"""
Real-time audio transcription using faster-whisper
Optimized for ultra-fast response time with tiny model
"""

import logging
import asyncio
import base64
import io
import numpy as np
from typing import Optional
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)


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
        """Load the Whisper model asynchronously."""
        if self._initialized:
            return

        try:
            logger.info(f"Loading Whisper model '{self.model_size}'...")

            # Load model in thread pool (blocking operation)
            loop = asyncio.get_event_loop()
            self.model = await loop.run_in_executor(
                None,
                lambda: WhisperModel(
                    self.model_size,
                    device="cpu",
                    compute_type="int8",  # Fast int8 quantization
                    num_workers=1,        # Single worker for low latency
                    download_root=None    # Use default cache
                )
            )

            self._initialized = True
            logger.info(f"✅ Whisper model '{self.model_size}' loaded successfully")

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


async def get_transcriber() -> AudioTranscriber:
    """Get or create the global transcriber instance."""
    global _transcriber

    if _transcriber is None:
        _transcriber = AudioTranscriber(model_size="tiny")  # Ultra-fast
        await _transcriber.initialize()

    return _transcriber
