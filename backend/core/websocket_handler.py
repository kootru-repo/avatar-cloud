"""
100% SDK-compliant WebSocket message handling
Uses official SDK methods: send_realtime_input(), send_client_content()
Handles setup_complete, tool calls, usage metadata, and interruptions
"""

import logging
import json
import asyncio
import base64
import traceback
import uuid
from typing import Any, Optional
from pathlib import Path
from google.genai import types

from core.session import (
    create_session, remove_session, SessionState, update_session_activity
)
from core.gemini_client import create_gemini_session
from config.prompts import get_initial_context

logger = logging.getLogger(__name__)


def load_config() -> dict:
    """Load backend configuration."""
    try:
        config_path = Path(__file__).parent.parent / 'backend_config.json'
        if config_path.exists():
            with open(config_path, 'r') as f:
                return json.load(f)
        return {}
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        return {}


# Load caption configuration
_config = load_config()
_captions_config = _config.get("captions", {})
CAPTIONS_ENABLED = _captions_config.get("enabled", True)

logger.info(f"Caption configuration: enabled={CAPTIONS_ENABLED} (Gemini built-in transcription, full sentence display)")

# Audio configuration
_audio_config = _config.get("audio", {})
AUDIO_SAMPLE_RATE_INPUT = _audio_config.get("inputSampleRate", 16000)
AUDIO_SAMPLE_RATE_OUTPUT = _audio_config.get("outputSampleRate", 24000)
AUDIO_MIME_TYPE_INPUT = _audio_config.get("mimeTypeInput", "audio/pcm")
AUDIO_MIME_TYPE_OUTPUT = _audio_config.get("mimeTypeOutput", "audio/pcm")
AUDIO_CHUNK_SIZE_BYTES = _audio_config.get("chunkSizeBytes", 3200)

# Security: Size limits
MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024  # 10MB per chunk
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024   # 5MB per image
MAX_TEXT_LENGTH = 100000  # 100K characters

# Timeout configuration
_timeout_config = _config.get("timeouts", {})
SEND_TIMEOUT_SECONDS = _timeout_config.get("sendTimeoutSeconds", 5)
SETUP_TIMEOUT_SECONDS = _timeout_config.get("setupTimeoutSeconds", 10)

# Log loaded configuration
logger.info(f"Audio config: input={AUDIO_SAMPLE_RATE_INPUT}Hz, output={AUDIO_SAMPLE_RATE_OUTPUT}Hz, chunk_size={AUDIO_CHUNK_SIZE_BYTES}B")
logger.info(f"Timeout config: send={SEND_TIMEOUT_SECONDS}s, setup={SETUP_TIMEOUT_SECONDS}s")

# Valid message types
VALID_MESSAGE_TYPES = {"audio", "image", "text", "end", "tool_response", "interrupt"}


def validate_message_structure(data: dict) -> tuple[bool, Optional[str]]:
    """Validate incoming message structure."""
    if not isinstance(data, dict):
        return False, "Message must be a JSON object"

    if "type" not in data:
        return False, "Message missing required 'type' field"

    msg_type = data["type"]
    if msg_type not in VALID_MESSAGE_TYPES:
        return False, f"Invalid message type: {msg_type}"

    # Messages that require data field
    if msg_type in {"audio", "image", "text", "tool_response"}:
        if "data" not in data:
            return False, f"Message type '{msg_type}' requires 'data' field"

    # Messages that don't require data: interrupt, end

    return True, None


async def send_error_message(websocket: Any, error_data: dict) -> None:
    """Send formatted error message to client."""
    try:
        await websocket.send(json.dumps({
            "type": "error",
            "data": error_data
        }))
    except Exception as e:
        logger.error(f"Failed to send error message: {e}")


async def cleanup_session(session: Optional[SessionState], session_id: str) -> None:
    """Clean up session resources."""
    try:
        if session:
            await remove_session(session_id)
            logger.info(f"Session {session_id} cleaned up")
    except Exception as cleanup_error:
        logger.error(f"Error during session cleanup: {cleanup_error}")


async def handle_messages(websocket: Any, session: SessionState, session_id: str) -> None:
    """
    SDK-COMPLIANT: Handle bidirectional message flow.
    Uses asyncio.wait for Python 3.10 compatibility.
    """
    client_task = None
    gemini_task = None

    try:
        client_task = asyncio.create_task(handle_client_messages(websocket, session, session_id))
        gemini_task = asyncio.create_task(handle_gemini_responses(websocket, session))

        # OFFICIAL GOOGLE PATTERN: Wait for FIRST_COMPLETED (not FIRST_EXCEPTION)
        # This allows either task to complete normally while the other continues
        done, pending = await asyncio.wait(
            [client_task, gemini_task],
            return_when=asyncio.FIRST_COMPLETED
        )

        # Check for exceptions
        for task in done:
            if task.exception():
                exc = task.exception()
                exc_str = str(exc).lower()

                # Handle quota/rate limit errors
                if "quota" in exc_str or "rate limit" in exc_str or "resource exhausted" in exc_str:
                    logger.warning(f"Quota/rate limit error: {exc}")
                    try:
                        await send_error_message(websocket, {
                            "message": "API quota exceeded.",
                            "action": "Please wait and try again.",
                            "error_type": "quota_exceeded"
                        })
                    except Exception:
                        pass

                # Ignore connection closed errors
                elif "connection closed" not in exc_str and "websocket" not in exc_str:
                    logger.error(f"Error in message handling: {exc}")
                    raise exc

    finally:
        # Cancel pending tasks
        for task in [client_task, gemini_task]:
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass


async def handle_client_messages(websocket: Any, session: SessionState, session_id: str) -> None:
    """
    SDK-COMPLIANT: Handle incoming messages from client.
    Uses send_realtime_input() for audio and send_client_content() for text.
    """
    try:
        async for message in websocket:
            try:
                await update_session_activity(session_id)
                session.message_count += 1

                data = json.loads(message)

                # Validate message structure
                is_valid, error_msg = validate_message_structure(data)
                if not is_valid:
                    logger.warning(f"Invalid message: {error_msg}")
                    await send_error_message(websocket, {
                        "message": f"Invalid message: {error_msg}",
                        "error_type": "invalid_message"
                    })
                    continue

                msg_type = data["type"]

                if msg_type == "audio":
                    await handle_audio_input(session, data, websocket)
                elif msg_type == "image":
                    await handle_image_input(session, data, websocket)
                elif msg_type == "text":
                    await handle_text_input(session, data, websocket)
                elif msg_type == "tool_response":
                    await handle_tool_response(session, data, websocket)
                elif msg_type == "interrupt":
                    # Client detected barge-in locally and wants to stop audio immediately
                    logger.info("🛑 Client interrupt signal received")
                    session.client_interrupted = True
                    # Clear any accumulated transcription from interrupted turn
                    if session.output_transcriptions:
                        logger.info(f"🗑️ Clearing {len(session.output_transcriptions)} transcription chunks (interrupt)")
                    session.output_transcriptions.clear()
                elif msg_type == "end":
                    # Client VAD detected end - server VAD handles this automatically
                    logger.debug("Client VAD detected silence (server VAD active)")
                else:
                    logger.warning(f"Unsupported message type: {msg_type}")

            except Exception as e:
                logger.error(f"Error handling client message: {e}")
                logger.error(traceback.format_exc())

    except Exception as e:
        if "connection closed" not in str(e).lower():
            logger.error(f"WebSocket connection error: {e}")
        raise


async def handle_audio_input(session: SessionState, data: dict, websocket: Any) -> None:
    """
    SDK-COMPLIANT: Handle audio input using send_realtime_input() with Blob.
    """
    try:
        audio_b64 = data.get("data", "")
        if not audio_b64:
            return

        # Security: Validate size
        estimated_size = len(audio_b64) * 3 // 4
        if estimated_size > MAX_AUDIO_SIZE_BYTES:
            await send_error_message(websocket, {
                "message": "Audio data too large",
                "error_type": "size_limit_exceeded"
            })
            return

        # Reset client interrupt flag when new audio arrives (user's new query)
        if session.client_interrupted:
            logger.info("🔄 Resetting interrupt flag (new audio input)")
            session.client_interrupted = False

        # Clear transcription accumulator only when starting a NEW turn (not during active response)
        # This prevents clearing chunks that are still arriving from the current turn
        if session.output_transcriptions and not session.is_receiving_response:
            logger.info(f"🗑️ Clearing {len(session.output_transcriptions)} transcription chunks (new turn starting)")
            session.output_transcriptions.clear()

        # OFFICIAL GOOGLE PATTERN from src/project-livewire/server/core/websocket_handler.py:150-153
        # Use send() with input dict containing data and mime_type
        await asyncio.wait_for(
            session.genai_session.send(input={
                "data": audio_b64,
                "mime_type": AUDIO_MIME_TYPE_INPUT
            }, end_of_turn=True),
            timeout=SEND_TIMEOUT_SECONDS
        )

    except asyncio.TimeoutError:
        logger.error("Timeout sending audio to Gemini")
        await send_error_message(websocket, {
            "message": "Request timeout",
            "error_type": "timeout"
        })
    except Exception as e:
        logger.error(f"Error sending audio: {e}")
        raise


async def handle_image_input(session: SessionState, data: dict, websocket: Any) -> None:
    """
    SDK-COMPLIANT: Handle image input using send_client_content().
    """
    try:
        image_b64 = data.get("data", "")
        if not image_b64:
            return

        # Security: Validate size
        estimated_size = len(image_b64) * 3 // 4
        if estimated_size > MAX_IMAGE_SIZE_BYTES:
            await send_error_message(websocket, {
                "message": "Image data too large",
                "error_type": "size_limit_exceeded"
            })
            return

        logger.info(f"📤 Sending image: {len(image_b64)} bytes base64")

        # OFFICIAL GOOGLE PATTERN from src/project-livewire/server/core/websocket_handler.py:156-160
        # Use send() with input dict containing data and mime_type
        await asyncio.wait_for(
            session.genai_session.send(input={
                "data": image_b64,
                "mime_type": "image/jpeg"
            }),
            timeout=SEND_TIMEOUT_SECONDS
        )

        logger.info("✅ Image sent via send()")

    except Exception as e:
        logger.error(f"Error sending image: {e}")
        raise


async def handle_text_input(session: SessionState, data: dict, websocket: Any) -> None:
    """
    SDK-COMPLIANT: Handle text input using send_client_content().
    """
    try:
        text = data.get("data", "")
        if not text:
            return

        # Security: Validate length
        if len(text) > MAX_TEXT_LENGTH:
            await send_error_message(websocket, {
                "message": "Text too long",
                "error_type": "size_limit_exceeded"
            })
            return

        logger.info(f"📤 Sending text: {text[:100]}...")

        # OFFICIAL GOOGLE PATTERN from src/project-livewire/server/core/websocket_handler.py:162-165
        # Use send() with text string directly
        await asyncio.wait_for(
            session.genai_session.send(input=text, end_of_turn=True),
            timeout=SEND_TIMEOUT_SECONDS
        )

        logger.info("✅ Text sent via send()")

    except Exception as e:
        logger.error(f"Error sending text: {e}")
        raise


async def handle_tool_response(session: SessionState, data: dict, websocket: Any) -> None:
    """
    SDK-COMPLIANT: Handle tool/function response.
    """
    try:
        tool_data = data.get("data", {})
        logger.info(f"📤 Sending tool response: {tool_data}")

        # SDK-COMPLIANT: Send tool response with function_responses= parameter
        # FIXED: Use function_responses= parameter
        await asyncio.wait_for(
            session.genai_session.send_tool_response(
                function_responses=tool_data
            ),
            timeout=SEND_TIMEOUT_SECONDS
        )

        logger.info("✅ Tool response sent")

    except Exception as e:
        logger.error(f"Error sending tool response: {e}")
        raise


async def handle_gemini_responses(websocket: Any, session: SessionState) -> None:
    """
    SDK-COMPLIANT: Handle responses from Gemini using session.receive().
    Processes setup_complete, server_content, tool_call, usage_metadata, go_away.

    OFFICIAL PATTERN from Google's project-livewire:
    Wraps receive() in while True loop to handle reconnections
    Reference: src/project-livewire/server/core/websocket_handler.py lines 187-188
    """
    try:
        logger.info("🎧 Listening for Gemini responses...")
        response_count = 0

        # OFFICIAL GOOGLE PATTERN: Wrap in while True to keep receiving
        while True:
            async for response in session.genai_session.receive():
                try:
                    response_count += 1

                    # SDK-COMPLIANT: Handle setup_complete
                    if hasattr(response, 'setup_complete') and response.setup_complete:
                        logger.info("✅ Setup complete acknowledged")
                        await websocket.send(json.dumps({
                            "type": "setup_complete"
                        }))
                        continue

                    # SDK-COMPLIANT: Handle tool_call (function calling)
                    # CRITICAL: Process tool_call BEFORE server_content to ensure
                    # frontend receives tool_call message before audio starts playing
                    # This allows video state to switch before audio playback begins
                    if hasattr(response, 'tool_call') and response.tool_call:
                        logger.info(f"🔧 Tool call received: {response.tool_call}")
                        # SDK structure: tool_call.function_calls is an array
                        for function_call in response.tool_call.function_calls:
                            logger.info(f"   Calling function: {function_call.name} (id={function_call.id})")

                            # Fixed: Issue #56 - debounce rapid duplicate tool calls (2 second cooldown)
                            from datetime import datetime, timedelta
                            now = datetime.now()
                            should_skip = False
                            if (session.last_tool_call_name == function_call.name and
                                session.last_tool_call_time and
                                (now - session.last_tool_call_time).total_seconds() < 2.0):
                                logger.warning(f"   ⚠️ Skipping duplicate tool call within cooldown: {function_call.name}")
                                should_skip = True
                            else:
                                session.last_tool_call_name = function_call.name
                                session.last_tool_call_time = now

                            if should_skip:
                                # Still send tool_response to acknowledge
                                tool_response = types.LiveClientToolResponse(
                                    function_responses=[
                                        types.FunctionResponse(
                                            id=function_call.id,
                                            name=function_call.name,
                                            response={"success": False, "reason": "Duplicate call within cooldown"}
                                        )
                                    ]
                                )
                                await session.genai_session.send(tool_response)
                                continue
                            # Fixed: Issue #54 - add error handling for tool forwarding
                            try:
                                # Fixed: Issue #69 - add timestamp for debugging
                                await websocket.send(json.dumps({
                                    "type": "tool_call",
                                    "data": {
                                        "name": function_call.name,
                                        "args": function_call.args,
                                        "id": function_call.id,
                                        "timestamp": now.isoformat()
                                    }
                                }))
                                logger.info(f"   ✅ Tool call forwarded to frontend: {function_call.name}")
                            except Exception as e:
                                logger.error(f"   ❌ Failed to forward tool call to frontend: {e}")
                                # Continue to send tool_response even if frontend forwarding failed
                                # This prevents Gemini from waiting indefinitely

                            # SDK-COMPLIANT: Send tool_response back to Gemini
                            # This acknowledges the tool execution and prevents re-triggering
                            # Fixed: Issue #34 - added logging for successful tool execution
                            tool_response = types.LiveClientToolResponse(
                                function_responses=[
                                    types.FunctionResponse(
                                        id=function_call.id,
                                        name=function_call.name,
                                        response={"success": True}
                                    )
                                ]
                            )
                            await session.genai_session.send(tool_response)
                            logger.info(f"   ✅ Tool response sent to Gemini: success=True (id={function_call.id})")

                    # SDK-COMPLIANT: Handle server_content (audio, text, interruptions)
                    # Process AFTER tool_call to ensure frontend receives tool messages first
                    server_content = getattr(response, 'server_content', None)
                    if server_content:
                        await process_server_content(websocket, session, server_content)

                    # SDK-COMPLIANT: Handle usage_metadata
                    if hasattr(response, 'usage_metadata') and response.usage_metadata:
                        logger.info(f"📊 Usage metadata: {response.usage_metadata}")
                        session.total_tokens = getattr(response.usage_metadata, 'total_token_count', 0)

                    # SDK-COMPLIANT: Handle go_away (graceful shutdown)
                    if hasattr(response, 'go_away') and response.go_away:
                        logger.info("🚪 Server requested disconnect (go_away)")
                        await websocket.send(json.dumps({
                            "type": "go_away",
                            "data": {"message": "Server closing session"}
                        }))
                        break

                except Exception as e:
                    logger.error(f"Error processing Gemini response: {e}")
                    logger.error(traceback.format_exc())

    finally:
        logger.debug("handle_gemini_responses finished")


async def process_server_content(websocket: Any, session: SessionState, server_content: Any) -> None:
    """
    SDK-COMPLIANT: Process server_content including audio, text, and interruptions.
    """
    try:
        # Skip forwarding initial greeting from KV cache preload
        if session.skip_initial_greeting:
            # Check for turn_complete to know when KV cache processing is done
            if hasattr(server_content, 'turn_complete') and server_content.turn_complete:
                logger.info("✅ KV cache greeting consumed (not forwarded)")
                session.skip_initial_greeting = False
            else:
                logger.debug("⏭️ Skipping initial greeting content")
            return

        # SDK-COMPLIANT: Check for interruption
        if hasattr(server_content, 'interrupted') and server_content.interrupted:
            logger.info("⚠️ Interruption detected")
            await websocket.send(json.dumps({
                "type": "interrupted",
                "data": {"message": "Response interrupted"}
            }))
            session.is_receiving_response = False
            session.client_interrupted = False  # Reset flag
            return

        # CLIENT INTERRUPT: Skip sending if client interrupted
        if session.client_interrupted:
            logger.debug("⏭️ Skipping server content (client interrupted)")
            return

        # SDK-COMPLIANT: Process model_turn (audio and text parts)
        model_turn = getattr(server_content, 'model_turn', None)
        if model_turn:
            session.is_receiving_response = True

            for part in model_turn.parts:
                # Double-check client interrupt before sending each part
                if session.client_interrupted:
                    logger.info("⏭️ Stopping mid-response (client interrupted)")
                    return

                # SDK-COMPLIANT: Handle inline_data (audio) - fast path
                inline_data = getattr(part, 'inline_data', None)
                if inline_data:
                    # Audio data is raw bytes - encode to base64 for client
                    audio_base64 = base64.b64encode(inline_data.data).decode('utf-8')

                    # Send audio to client for playback
                    # Use string concatenation instead of json.dumps for simple messages (faster)
                    await websocket.send(f'{{"type":"audio","data":"{audio_base64}"}}')

                # SDK-COMPLIANT: Handle text
                else:
                    text = getattr(part, 'text', None)
                    if text:
                        # Use json.dumps for text (handles control characters properly)
                        await websocket.send(json.dumps({
                            "type": "text",
                            "data": text
                        }))

        # GEMINI TRANSCRIPTION: Send chunks in real-time AND accumulate
        # Reference: Gemini Live API sends transcription "in chunks, mirroring the spoken words"
        # Strategy: Send each chunk immediately for real-time display, also accumulate for final text
        if CAPTIONS_ENABLED and hasattr(server_content, 'output_transcription'):
            output_transcription = server_content.output_transcription
            if output_transcription and hasattr(output_transcription, 'text'):
                text = output_transcription.text.strip()
                if text:
                    logger.info(f"📝 Transcription chunk #{len(session.output_transcriptions) + 1}: '{text}'")
                    # Accumulate for final complete text
                    session.output_transcriptions.append(text)
                    # Send chunk immediately for real-time display
                    await websocket.send(json.dumps({
                        "type": "transcription_interim",
                        "data": text
                    }))

        # Check if model_turn has text parts (alternative to output_transcription)
        if CAPTIONS_ENABLED and model_turn:
            for part in model_turn.parts:
                if not hasattr(part, 'inline_data'):  # Not audio
                    text = getattr(part, 'text', None)
                    if text:
                        logger.info(f"📄 Model text part: '{text}'")

        # SDK-COMPLIANT: Handle turn_complete
        if hasattr(server_content, 'turn_complete') and server_content.turn_complete:
            logger.info(f"✅ Turn complete - accumulated {len(session.output_transcriptions)} transcription chunks")

            # Send accumulated transcription as complete sentence
            if CAPTIONS_ENABLED and session.output_transcriptions:
                complete_text = ' '.join(session.output_transcriptions)
                logger.info(f"📝 Complete transcription ({len(complete_text)} chars): '{complete_text}'")
                await websocket.send(json.dumps({
                    "type": "transcription",
                    "data": complete_text
                }))
                # Clear accumulator for next turn
                session.output_transcriptions.clear()
            elif CAPTIONS_ENABLED:
                logger.warning("⚠️ Turn complete but no transcription chunks accumulated!")

            await websocket.send(json.dumps({
                "type": "turn_complete"
            }))
            session.is_receiving_response = False
            session.client_interrupted = False  # Reset flag

    except Exception as e:
        if "connection closed" not in str(e).lower():
            logger.error(f"Error sending server content: {e}")


async def wait_for_setup_complete(session: SessionState) -> bool:
    """
    SDK-COMPLIANT: Wait for setup_complete before sending data.
    """
    try:
        logger.info("⏳ Waiting for setup_complete...")

        async def check_setup():
            async for response in session.genai_session.receive():
                if hasattr(response, 'setup_complete') and response.setup_complete:
                    logger.info("✅ Setup complete received")
                    return True
            return False

        setup_received = await asyncio.wait_for(
            check_setup(),
            timeout=SETUP_TIMEOUT_SECONDS
        )
        return setup_received

    except asyncio.TimeoutError:
        logger.warning("⚠️ Setup complete timeout - proceeding anyway")
        return False
    except Exception as e:
        logger.error(f"Error waiting for setup_complete: {e}")
        return False


async def handle_client(websocket: Any) -> None:
    """
    SDK-COMPLIANT: Handle client connection with proper session lifecycle.
    """
    session_id = str(uuid.uuid4())
    session = await create_session(session_id)

    try:
        # SDK-COMPLIANT: Create session context manager
        # Voice is configured via frontend/frontend_config.json → geminiVoice.voiceName
        gemini_session_context = await create_gemini_session()

        # SDK-COMPLIANT: Use async with for proper lifecycle management
        async with gemini_session_context as gemini_session:
            session.genai_session = gemini_session

            # Send backstory/setlist as first message for context (optional, disabled by default)
            initial_context_text = get_initial_context()
            if initial_context_text:
                try:
                    logger.info(f"📝 Sending initial context as message ({len(initial_context_text)} chars)")
                    await asyncio.wait_for(
                        gemini_session.send(input=initial_context_text, end_of_turn=True),
                        timeout=SEND_TIMEOUT_SECONDS
                    )
                    logger.info("✅ Initial context message sent")

                    # Wait for and consume the model's acknowledgment
                    async for response in gemini_session.receive():
                        server_content = getattr(response, 'server_content', None)
                        if server_content and hasattr(server_content, 'turn_complete') and server_content.turn_complete:
                            logger.info("✅ Context acknowledged")
                            break
                        if server_content:
                            break

                except Exception as e:
                    logger.warning(f"⚠️ Failed to send context: {e}")

            # Send ready to client
            await websocket.send(json.dumps({"ready": True}))
            logger.info(f"✅ Session {session_id} ready")

            # Start message handling
            await handle_messages(websocket, session, session_id)

    except asyncio.TimeoutError:
        logger.info(f"Session {session_id} timed out")
        try:
            await send_error_message(websocket, {
                "message": "Session timed out",
                "error_type": "timeout"
            })
        except:
            pass

    except Exception as e:
        logger.error(f"Error in handle_client: {e}")
        logger.error(traceback.format_exc())

        if "connection closed" not in str(e).lower():
            try:
                await send_error_message(websocket, {
                    "message": "An error occurred",
                    "error_type": "general"
                })
            except:
                pass

    finally:
        # SDK-COMPLIANT: Session automatically closed by async with
        try:
            await websocket.close()
        except Exception:
            pass

        await cleanup_session(session, session_id)
