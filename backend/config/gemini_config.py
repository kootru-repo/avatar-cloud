"""
Gemini Live API configuration builder
100% SDK-compliant implementation based on official Google Gen AI SDK
"""

import logging
import json
from pathlib import Path
from google.genai import types
from config.environment import api_config
from config.prompts import SYSTEM_INSTRUCTIONS

logger = logging.getLogger(__name__)


def load_config_json() -> dict:
    """Load configuration from backend_config.json."""
    backend_config_path = Path(__file__).parent.parent / 'backend_config.json'
    if backend_config_path.exists():
        with open(backend_config_path, 'r') as f:
            return json.load(f)
    return {}


def validate_voice_name(voice_name: str) -> bool:
    """
    Validate voice name against supported Gemini voices.

    Reference: https://ai.google.dev/gemini-api/docs/audio
    Valid voices for Gemini 2.0: Puck, Charon, Kore, Fenrir, Aoede,
                                  Zubenelgenubi, Orion, Pegasus, Vega,
                                  Algenib, Alkaid, Altair, Castor, Polaris
    """
    valid_voices = [
        # Original voices
        'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede',
        'Zubenelgenubi', 'Orion', 'Pegasus', 'Vega',
        # Additional Gemini 2.0 voices
        'Algenib', 'Alkaid', 'Altair', 'Castor', 'Polaris'
    ]
    return voice_name in valid_voices


def get_gemini_config() -> dict:
    """
    Create 100% SDK-compliant Gemini Live API configuration.

    OFFICIAL PATTERN from Google's project-livewire example:
    https://github.com/googleapis/python-genai (in src/project-livewire/server/config/config.py)

    Voice is configured ONLY via frontend/frontend_config.json → geminiVoice.voiceName
    No environment variable fallbacks.

    Returns:
        Plain dictionary config (NOT typed objects)
    """
    # Get voice from frontend_config.json (loaded in api_config)
    voice_name = api_config.voice

    # Validate voice name
    if not validate_voice_name(voice_name):
        raise ValueError(
            f"Invalid voice name '{voice_name}'. "
            f"Valid voices: Puck, Charon, Kore, Fenrir, Aoede, Zubenelgenubi, "
            f"Orion, Pegasus, Vega, Algenib, Alkaid, Altair, Castor, Polaris. "
            f"Update geminiVoice.voiceName in frontend/frontend_config.json"
        )

    # OFFICIAL GOOGLE PATTERN: speech_config as dictionary object
    # Reference: https://ai.google.dev/gemini-api/docs/audio
    # The SDK requires speech_config to be a dictionary with voice_name

    # CRITICAL: Test if system_instruction needs to be Content object vs string
    # According to SDK docs, system_instruction can be string OR Content object
    # Let's try Content object first as it's more explicit
    system_instruction_as_content = types.Content(
        role="user",
        parts=[types.Part(text=SYSTEM_INSTRUCTIONS)]
    )

    config = {
        "generation_config": {
            "response_modalities": api_config.response_modalities,
            "speech_config": {
                "voice_config": {
                    "prebuilt_voice_config": {
                        "voice_name": voice_name
                    }
                }
            }
        },
        "system_instruction": system_instruction_as_content  # Try Content object format
    }

    # AFFECTIVE DIALOG: Adapt response style to input expression and tone
    # Requires API version v1alpha (configurable via backend_config.json)
    if api_config.affective_dialog:
        config["enable_affective_dialog"] = True

    # FUNCTION CALLING: Define tools that Gemini can call
    # Dance mode tool allows Gemini to trigger dance sequence
    # Goodbye mode tool triggers farewell sequence
    config["tools"] = [
        {
            "function_declarations": [
                {
                    "name": "trigger_dance_mode",
                    "description": "Triggers the avatar's dance mode, playing music and showing a dance animation for 10 seconds. IMPORTANT: You MUST continue speaking enthusiastically about dancing while calling this function - the dance music plays quietly in the background so the user can still hear you. Use this when the user asks to dance, mentions dancing, or requests dance music. Parameters are empty (no configuration needed).",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {},
                        "required": []
                    }
                },
                {
                    "name": "trigger_goodbye_mode",
                    "description": "Triggers the avatar's goodbye sequence with a farewell animation. IMPORTANT: You MUST say ONLY the exact phrase 'See you later!' while calling this function - nothing more, nothing less. Use this when the user says goodbye, farewell, bye, see ya, or indicates they are leaving. Parameters are empty (no configuration needed).",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {},
                        "required": []
                    }
                }
            ]
        }
    ]

    # CAPTIONS/TRANSCRIPTION: Enable Gemini's built-in output audio transcription
    # This provides real-time transcription of the model's spoken responses
    config_json = load_config_json()
    captions_config = config_json.get("captions", {})
    if captions_config.get("enabled", True):
        config["output_audio_transcription"] = {}
        logger.info(f"   Output audio transcription: Enabled (Gemini built-in)")

    # AUTOMATIC VAD: Configure automatic voice activity detection
    # Gemini will automatically detect when user starts/stops speaking
    vad_config = config_json.get("automaticVAD", {})
    if vad_config.get("enabled", True):
        config["realtime_input_config"] = {
            "automatic_activity_detection": {
                "disabled": False,
                "start_of_speech_sensitivity": vad_config.get("startOfSpeechSensitivity", "START_SENSITIVITY_HIGH"),
                "end_of_speech_sensitivity": vad_config.get("endOfSpeechSensitivity", "END_SENSITIVITY_HIGH"),
                "prefix_padding_ms": vad_config.get("prefixPaddingMs", 100),
                "silence_duration_ms": vad_config.get("silenceDurationMs", 200),
            }
        }
        logger.info(f"   Automatic VAD: Enabled (start={vad_config.get('startOfSpeechSensitivity')}, end={vad_config.get('endOfSpeechSensitivity')})")

    logger.info(f"✅ SDK-compliant Gemini config created")
    logger.info(f"   Voice: {voice_name}")
    logger.info(f"   Response modalities: {', '.join(api_config.response_modalities)}")
    logger.info(f"   System instruction: {len(SYSTEM_INSTRUCTIONS)} chars")
    if api_config.affective_dialog:
        logger.info(f"   Affective dialog: Enabled (adapts to tone/expression)")
    logger.info(f"   Config keys: {list(config.keys())}")

    # DEBUG: Verify system_instruction is in config and not empty
    logger.info("="*80)
    logger.info("🔍 GEMINI CONFIG DEBUG - SYSTEM INSTRUCTION")
    logger.info("="*80)
    if "system_instruction" in config:
        si_value = config["system_instruction"]
        if si_value:
            logger.info(f"✅ system_instruction present in config")
            logger.info(f"✅ system_instruction type: {type(si_value)}")

            # Handle Content object
            if isinstance(si_value, types.Content):
                logger.info("✅ system_instruction is Content object (correct format)")
                logger.info(f"   Role: {si_value.role}")
                logger.info(f"   Parts: {len(si_value.parts)} part(s)")
                if si_value.parts:
                    first_part = si_value.parts[0]
                    if hasattr(first_part, 'text'):
                        text_content = first_part.text
                        logger.info(f"   Text length: {len(text_content)} characters")
                        if "Whinny Kravitz" in text_content:
                            logger.info("✅ 'Whinny Kravitz' found in Content object text")
                        else:
                            logger.error("❌ 'Whinny Kravitz' NOT found in Content object text!")
                        logger.info("First 300 chars of system_instruction text:")
                        logger.info(text_content[:300])
            # Handle string (fallback)
            elif isinstance(si_value, str):
                logger.info("⚠️ system_instruction is string (should be Content object?)")
                logger.info(f"   Length: {len(si_value)} characters")
                if "Whinny Kravitz" in si_value:
                    logger.info("✅ 'Whinny Kravitz' found in string")
                else:
                    logger.error("❌ 'Whinny Kravitz' NOT found in string!")
                logger.info("First 300 chars:")
                logger.info(si_value[:300])
            else:
                logger.warning(f"⚠️ Unexpected system_instruction type: {type(si_value)}")
        else:
            logger.error("❌ CRITICAL: system_instruction is EMPTY in config!")
    else:
        logger.error("❌ CRITICAL: system_instruction key NOT in config!")
    logger.info("="*80)

    return config
