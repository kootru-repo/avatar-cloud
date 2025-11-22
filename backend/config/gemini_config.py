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
    """Load configuration from config.json."""
    backend_config_path = Path(__file__).parent.parent / 'config.json'
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

    Voice is configured ONLY via frontend/config.json → geminiVoice.voiceName
    No environment variable fallbacks.

    Returns:
        Plain dictionary config (NOT typed objects)
    """
    # Get voice from config.json (loaded in api_config)
    voice_name = api_config.voice

    # Validate voice name
    if not validate_voice_name(voice_name):
        raise ValueError(
            f"Invalid voice name '{voice_name}'. "
            f"Valid voices: Puck, Charon, Kore, Fenrir, Aoede, Zubenelgenubi, "
            f"Orion, Pegasus, Vega, Algenib, Alkaid, Altair, Castor, Polaris. "
            f"Update geminiVoice.voiceName in frontend/config.json"
        )

    # OFFICIAL GOOGLE PATTERN: speech_config as dictionary object
    # Reference: https://ai.google.dev/gemini-api/docs/audio
    # The SDK requires speech_config to be a dictionary with voice_name
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
        "system_instruction": SYSTEM_INSTRUCTIONS
    }

    # AFFECTIVE DIALOG: Adapt response style to input expression and tone
    # Requires API version v1alpha (configurable via config.json)
    if api_config.affective_dialog:
        config["enable_affective_dialog"] = True

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

    logger.info(f"✅ SDK-compliant Gemini config created (plain dict)")
    logger.info(f"   Voice: {voice_name}")
    logger.info(f"   Response modalities: {', '.join(api_config.response_modalities)}")
    if api_config.affective_dialog:
        logger.info(f"   Affective dialog: Enabled (adapts to tone/expression)")
    logger.info(f"   Config type: {type(config)}")

    return config
