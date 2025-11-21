"""
Real-time audio transcription using Google Cloud Speech-to-Text API
Fast, serverless, no model downloads required
Uses configurable audio buffering to accumulate phrases for better accuracy
Captions display in real-time sync with audio playback
"""

import logging
import asyncio
import base64
import json
from pathlib import Path
from typing import Optional
from collections import deque
from google.cloud import speech_v1 as speech

logger = logging.getLogger(__name__)

# Load configuration
def load_config():
    """Load configuration from config.json."""
    config_path = Path(__file__).parent.parent / "config.json"
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Failed to load config.json: {e}, using defaults")
        return {}

config = load_config()

# Caption speed configuration (percentage: 100% = normal, 50% = slower updates, 200% = faster updates)
CAPTION_SPEED_PERCENT = config.get("captions", {}).get("speedPercent", 100)
CAPTIONS_ENABLED = config.get("captions", {}).get("enabled", True)

# Audio buffering configuration (adjusted by speed percentage)
BASE_BUFFER_DURATION_MS = 5000  # Base: 5 seconds at 100%
BUFFER_DURATION_MS = int(BASE_BUFFER_DURATION_MS * (100 / CAPTION_SPEED_PERCENT))
CHUNK_DURATION_MS = 200    # Estimated duration of each Gemini audio chunk
CAPTION_DELAY_MS = 0       # No delay - show captions in sync with audio playback


class AudioTranscriber:
    """
    Fast audio transcription using Google Cloud Speech-to-Text API.

    Benefits over Whisper:
    - No model downloads (zero cold start delay)
    - Serverless (Google-managed infrastructure)
    - Fast response times
    - Auto-scales
    """

    def __init__(self):
        """Initialize transcriber with Google Cloud Speech-to-Text client."""
        self.client = None
        self._initialized = False
        self.audio_buffer = deque()  # Buffer for accumulating audio chunks
        self.chunks_in_buffer = 0
        self.max_chunks_before_transcribe = BUFFER_DURATION_MS // CHUNK_DURATION_MS
        logger.info(f"AudioTranscriber created (Google Cloud Speech-to-Text)")
        logger.info(f"  Caption speed: {CAPTION_SPEED_PERCENT}% (buffer: {BUFFER_DURATION_MS}ms, ~{self.max_chunks_before_transcribe} chunks)")
        logger.info(f"  Captions enabled: {CAPTIONS_ENABLED}")

    async def initialize(self, progress_callback=None):
        """
        Initialize the Speech-to-Text client.
        Fast - no model downloads required.

        Args:
            progress_callback: Optional async function to call with progress updates
        """
        if self._initialized:
            return

        try:
            logger.info("Initializing Google Cloud Speech-to-Text client...")

            # Send progress update if callback provided
            if progress_callback:
                await progress_callback(0, 1, "Initializing Speech-to-Text...", 1)

            # Create client in thread pool (uses default credentials from Cloud Run)
            loop = asyncio.get_event_loop()
            self.client = await loop.run_in_executor(
                None,
                lambda: speech.SpeechClient()
            )

            self._initialized = True
            logger.info("Speech-to-Text client ready (no model download needed)")

            # Send completion update
            if progress_callback:
                await progress_callback(1, 1, "Ready", 0)

        except Exception as e:
            logger.error(f"Failed to initialize Speech-to-Text client: {e}")
            raise

    async def transcribe_audio_chunk(
        self,
        audio_base64: str,
        sample_rate: int = 24000
    ) -> Optional[str]:
        """
        Buffer audio chunks and transcribe when enough audio accumulated.
        This improves transcription accuracy for short chunks from Gemini.

        Args:
            audio_base64: Base64-encoded PCM audio data
            sample_rate: Audio sample rate (24000 for Gemini output)

        Returns:
            Transcribed text or None if buffering or no speech detected
        """
        # Skip transcription if captions disabled
        if not CAPTIONS_ENABLED:
            return None

        if not self._initialized:
            await self.initialize()

        try:
            # Add chunk to buffer
            self.audio_buffer.append(audio_base64)
            self.chunks_in_buffer += 1

            # Only transcribe when buffer is full
            if self.chunks_in_buffer < self.max_chunks_before_transcribe:
                logger.debug(f"Buffering audio ({self.chunks_in_buffer}/{self.max_chunks_before_transcribe} chunks)")
                return None

            # Combine buffered chunks
            logger.debug(f"Transcribing {self.chunks_in_buffer} buffered chunks...")
            combined_pcm = b''.join(base64.b64decode(chunk) for chunk in self.audio_buffer)

            # Clear buffer for next batch
            self.audio_buffer.clear()
            self.chunks_in_buffer = 0

            # Configure recognition
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
                sample_rate_hertz=sample_rate,
                language_code="en-US",
                enable_automatic_punctuation=True,
                model="default",  # Fast general model
            )

            audio = speech.RecognitionAudio(content=combined_pcm)

            # Run transcription in thread pool (synchronous API)
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.client.recognize(config=config, audio=audio)
            )

            # Extract transcription from response
            if response.results:
                # Get the most confident result
                result = response.results[0]
                if result.alternatives:
                    text = result.alternatives[0].transcript.strip()
                    if text:
                        logger.debug(f"Transcribed: {text}")

                        # Apply minimal delay if configured (currently 0 for real-time sync)
                        if CAPTION_DELAY_MS > 0:
                            await asyncio.sleep(CAPTION_DELAY_MS / 1000.0)

                        return text

            return None

        except Exception as e:
            logger.error(f"Transcription error: {e}")
            # Clear buffer on error to avoid accumulation
            self.audio_buffer.clear()
            self.chunks_in_buffer = 0
            return None

    def cleanup(self):
        """Clean up resources."""
        if self.client:
            # Speech client doesn't need explicit cleanup
            self.client = None
            self._initialized = False
            logger.info("Speech-to-Text client cleaned up")


# Global transcriber instance (initialized on first use)
_transcriber: Optional[AudioTranscriber] = None
_transcriber_failed: bool = False  # Track if initialization failed to avoid repeated attempts
_transcriber_lock: Optional[asyncio.Lock] = None  # Lock to prevent concurrent initialization


async def get_transcriber(websocket=None) -> Optional[AudioTranscriber]:
    """
    Get or create the global transcriber instance.
    Returns None if initialization fails.
    Thread-safe with async lock to prevent race conditions.

    Args:
        websocket: Optional websocket to send progress updates to client
    """
    global _transcriber, _transcriber_failed, _transcriber_lock

    # Don't retry if we already failed
    if _transcriber_failed:
        return None

    # Return if already initialized
    if _transcriber is not None:
        return _transcriber

    # Create lock if needed
    if _transcriber_lock is None:
        _transcriber_lock = asyncio.Lock()

    # Use lock to ensure only one initialization happens
    async with _transcriber_lock:
        # Double-check after acquiring lock (another task might have initialized)
        if _transcriber is not None:
            return _transcriber

        if _transcriber_failed:
            return None

        try:
            # Create progress callback to send updates to client
            async def progress_callback(current, total, message, eta_seconds=0):
                if websocket:
                    import json
                    try:
                        await websocket.send(json.dumps({
                            "type": "download_progress",
                            "current": current,
                            "total": total,
                            "message": message,
                            "eta_seconds": eta_seconds
                        }))
                    except Exception as e:
                        logger.debug(f"Failed to send progress update: {e}")

            _transcriber = AudioTranscriber()
            await _transcriber.initialize(progress_callback if websocket else None)
            logger.info("Transcription enabled (Google Cloud Speech-to-Text)")
        except Exception as e:
            logger.warning(f"Transcription disabled: {str(e)[:100]}")
            logger.info("   Audio playback will continue normally without captions")
            _transcriber_failed = True
            return None

    return _transcriber
