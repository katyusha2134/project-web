"""
STT Service — faster-whisper
รับ audio bytes → คืน transcript string
"""

import io
import os
import tempfile
from faster_whisper import WhisperModel

# ─── Model config ───────────────────────────────────────────
# เปลี่ยน model size ได้: tiny / base / small / medium / large-v3
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")
WHISPER_DEVICE     = os.getenv("WHISPER_DEVICE", "cuda")   # "cpu" ถ้าไม่มี GPU
WHISPER_COMPUTE    = os.getenv("WHISPER_COMPUTE", "float16")  # "int8" สำหรับ CPU

_whisper_model: WhisperModel | None = None


def get_whisper_model() -> WhisperModel:
    """Lazy-load — โหลดครั้งเดียว แล้ว cache ไว้"""
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel(
            WHISPER_MODEL_SIZE,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE,
        )
    return _whisper_model


def transcribe_audio(audio_bytes: bytes, language: str | None = None) -> dict:
    """
    Parameters
    ----------
    audio_bytes : bytes   ไฟล์เสียง (webm / wav / mp3 / ogg …)
    language    : str     รหัสภาษา เช่น "th", "en" หรือ None (auto-detect)

    Returns
    -------
    {
        "text": str,
        "language": str,
        "language_probability": float
    }
    """
    model = get_whisper_model()

    # บันทึกลง temp file เพราะ faster-whisper ต้องการ path หรือ file-like
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        segments, info = model.transcribe(
            tmp_path,
            language=language,       # None = auto-detect
            beam_size=5,
            vad_filter=True,         # ตัดเสียงเงียบออก
            vad_parameters=dict(min_silence_duration_ms=500),
        )
        transcript = " ".join(seg.text.strip() for seg in segments)
    finally:
        os.unlink(tmp_path)

    return {
        "text": transcript,
        "language": info.language,
        "language_probability": round(info.language_probability, 4),
    }