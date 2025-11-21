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


async def download_model_from_gcs(progress_callback=None) -> bool:
    """
    Download whisper model from GCS to local filesystem.
    Returns True if successful, False otherwise.

    Args:
        progress_callback: Optional async function to call with progress updates
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

        # First, count total files
        def count_blobs():
            client = storage.Client()
            bucket = client.bucket(GCS_BUCKET_NAME)
            blobs = list(bucket.list_blobs(prefix=GCS_MODEL_PREFIX))
            return [b for b in blobs if not b.name.endswith('/') and b.name[len(GCS_MODEL_PREFIX):]]

        blobs_to_download = await loop.run_in_executor(None, count_blobs)
        total_files = len(blobs_to_download)

        if progress_callback:
            await progress_callback(0, total_files, "Preparing download...")

        # Download files with progress updates
        for idx, blob in enumerate(blobs_to_download, 1):
            relative_path = blob.name[len(GCS_MODEL_PREFIX):]
            local_file = model_path / relative_path
            local_file.parent.mkdir(parents=True, exist_ok=True)

            if progress_callback:
                # Estimate: ~1 second per file
                eta_seconds = (total_files - idx + 1) * 1
                await progress_callback(idx, total_files, f"Downloading {relative_path}...", eta_seconds)

            logger.info(f"  Downloading {blob.name}...")

            # Download in thread pool
            await loop.run_in_executor(
                None,
                lambda b=blob, lf=local_file: b.download_to_filename(str(lf))
            )

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

    async def initialize(self, progress_callback=None):
        """Load the Whisper model asynchronously.

        Uses faster-whisper's built-in download from Hugging Face.
        Model is cached in /root/.cache/huggingface/hub for subsequent loads.

        Args:
            progress_callback: Optional async function to call with download progress
        """
        if self._initialized:
            return

        try:
            logger.info(f"Loading Whisper model '{self.model_size}'...")

            # Send progress update if callback provided
            if progress_callback:
                await progress_callback(0, 1, "Loading Whisper tiny model...", 5)

            # Load model - faster-whisper downloads and caches automatically
            # Downloads from Hugging Face on first run, caches locally after
            loop = asyncio.get_event_loop()
            self.model = await loop.run_in_executor(
                None,
                lambda: WhisperModel(
                    self.model_size,      # "tiny" - downloads from Hugging Face
                    device="cpu",
                    compute_type="int8",  # Fast int8 quantization
                    num_workers=1,        # Single worker for low latency
                )
            )

            self._initialized = True
            logger.info(f"Whisper model '{self.model_size}' loaded successfully")

            # Send completion update
            if progress_callback:
                await progress_callback(1, 1, "Model ready", 0)

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
                    vad_filter=False,         # Disabled for testing
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
_transcriber_lock: Optional[asyncio.Lock] = None  # Lock to prevent concurrent initialization


async def get_transcriber(websocket=None) -> Optional[AudioTranscriber]:
    """
    Get or create the global transcriber instance.
    Returns None if initialization fails (e.g., model download issues).
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

            _transcriber = AudioTranscriber(model_size="tiny")  # Ultra-fast
            await _transcriber.initialize(progress_callback if websocket else None)
            logger.info("Transcription enabled")
        except Exception as e:
            logger.warning(f"Transcription disabled: {str(e)[:100]}")
            logger.info("   Audio playback will continue normally without captions")
            _transcriber_failed = True
            return None

    return _transcriber
