"""
Real-time audio transcription using faster-whisper
Optimized for ultra-fast response time with tiny model
Model files hosted in Google Cloud Storage for reliable access
"""

import logging
import asyncio
import base64
import io
import os
from pathlib import Path
import numpy as np
from typing import Optional
from faster_whisper import WhisperModel
from google.cloud import storage

logger = logging.getLogger(__name__)

# GCS bucket configuration
GCS_BUCKET_NAME = "avatar-478217-whisper-models"
GCS_MODEL_PREFIX = "faster-whisper-tiny/"
LOCAL_MODEL_PATH = "/tmp/whisper-models/faster-whisper-tiny"


async def download_model_from_gcs() -> bool:
    """
    Download whisper model from GCS to local filesystem.
    Returns True if successful, False otherwise.
    """
    model_path = Path(LOCAL_MODEL_PATH)

    # Check if model already downloaded
    if model_path.exists() and (model_path / "model.bin").exists():
        logger.info(f"Model already cached at {LOCAL_MODEL_PATH}")
        return True

    try:
        logger.info(f"Downloading model from gs://{GCS_BUCKET_NAME}/{GCS_MODEL_PREFIX}...")

        # Create local directory
        model_path.mkdir(parents=True, exist_ok=True)

        # Download model files from GCS using Python client
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()

        def download_blobs():
            client = storage.Client()
            bucket = client.bucket(GCS_BUCKET_NAME)

            # List all blobs with the model prefix
            blobs = bucket.list_blobs(prefix=GCS_MODEL_PREFIX)

            for blob in blobs:
                # Skip directory markers
                if blob.name.endswith('/'):
                    continue

                # Get the filename relative to the prefix
                relative_path = blob.name[len(GCS_MODEL_PREFIX):]
                if not relative_path:
                    continue

                local_file = model_path / relative_path
                local_file.parent.mkdir(parents=True, exist_ok=True)

                logger.info(f"  Downloading {blob.name}...")
                blob.download_to_filename(str(local_file))

        await loop.run_in_executor(None, download_blobs)

        logger.info(f"Model downloaded successfully to {LOCAL_MODEL_PATH}")
        return True

    except Exception as e:
        logger.error(f"Error downloading model from GCS: {e}")
        return False


class AudioTranscriber:
    """
    Ultra-fast audio transcription using faster-whisper tiny model.

    Optimizations for speed:
    - Uses 'tiny' model (fastest, ~100ms latency)
    - int8 quantization for CPU efficiency
    - Processes chunks immediately (no batching)
    - Skips beam search (greedy decoding)
    """

    def __init__(self, model_size: str = "tiny"):
        """
        Initialize transcriber with speed-optimized settings.

        Args:
            model_size: "tiny" (fastest), "base", "small", "medium", "large"
        """
        self.model = None
        self.model_size = model_size
        self._initialized = False
        logger.info(f"AudioTranscriber created (model: {model_size})")

    async def initialize(self):
        """Load the Whisper model asynchronously from GCS."""
        if self._initialized:
            return

        try:
            # Download model from GCS to local filesystem
            if not await download_model_from_gcs():
                raise Exception("Failed to download model from GCS")

            logger.info(f"Loading Whisper model from {LOCAL_MODEL_PATH}...")

            # Load model from local path (blocking operation)
            loop = asyncio.get_event_loop()
            self.model = await loop.run_in_executor(
                None,
                lambda: WhisperModel(
                    LOCAL_MODEL_PATH,     # Use local path instead of model size
                    device="cpu",
                    compute_type="int8",  # Fast int8 quantization
                    num_workers=1,        # Single worker for low latency
                )
            )

            self._initialized = True
            logger.info(f"Whisper model loaded successfully from GCS")

        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise

    async def transcribe_audio_chunk(
        self,
        audio_base64: str,
        sample_rate: int = 24000
    ) -> Optional[str]:
        """
        Transcribe a single audio chunk with ultra-fast settings.

        Args:
            audio_base64: Base64-encoded PCM audio data
            sample_rate: Audio sample rate (24000 for Gemini output)

        Returns:
            Transcribed text or None if no speech detected
        """
        if not self._initialized:
            await self.initialize()

        try:
            # Decode base64 PCM audio
            pcm_data = base64.b64decode(audio_base64)

            # Convert PCM bytes to float32 numpy array
            # Gemini sends PCM16LE (16-bit signed little-endian)
            audio_array = np.frombuffer(pcm_data, dtype=np.int16).astype(np.float32) / 32768.0

            # Run transcription in thread pool (CPU-bound)
            loop = asyncio.get_event_loop()
            segments, info = await loop.run_in_executor(
                None,
                lambda: self.model.transcribe(
                    audio_array,
                    language="en",
                    beam_size=1,              # Greedy decoding (fastest)
                    best_of=1,                # No alternative sampling
                    temperature=0,            # Deterministic output
                    vad_filter=True,          # Skip silence
                    vad_parameters=dict(
                        threshold=0.3,        # Lower = more sensitive
                        min_speech_duration_ms=100,  # Catch short words
                        min_silence_duration_ms=300  # Quick sentence breaks
                    ),
                    word_timestamps=False,    # Skip word timing (faster)
                    condition_on_previous_text=False  # No context (faster)
                )
            )

            # Collect all text segments
            text_segments = [segment.text.strip() for segment in segments]
            text = " ".join(text_segments).strip()

            if text:
                logger.debug(f"Transcribed: {text[:50]}...")
                return text

            return None

        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return None

    def cleanup(self):
        """Clean up resources."""
        if self.model:
            del self.model
            self.model = None
            self._initialized = False
            logger.info("Whisper model unloaded")


# Global transcriber instance (initialized on first use)
_transcriber: Optional[AudioTranscriber] = None
_transcriber_failed: bool = False  # Track if initialization failed to avoid repeated attempts


async def get_transcriber() -> Optional[AudioTranscriber]:
    """
    Get or create the global transcriber instance.
    Returns None if initialization fails (e.g., model download issues).
    """
    global _transcriber, _transcriber_failed

    # Don't retry if we already failed
    if _transcriber_failed:
        return None

    if _transcriber is None:
        try:
            _transcriber = AudioTranscriber(model_size="tiny")  # Ultra-fast
            await _transcriber.initialize()
            logger.info("✅ Transcription enabled")
        except Exception as e:
            logger.warning(f"⚠️ Transcription disabled: {str(e)[:100]}")
            logger.info("   Audio playback will continue normally without captions")
            _transcriber_failed = True
            return None

    return _transcriber
