"""
TTS Service — Hybrid Engine  (optimized)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
การปรับปรุงเพื่อลด delay:

  1. Preload at startup  — โหลด model ทันทีตอนเริ่มเซิร์ฟเวอร์
  2. Ref audio cache     — preprocess ref audio ครั้งเดียว ไม่ทำซ้ำ
  3. Thread pool         — inference รันใน executor ไม่บล็อก event loop
  4. Idle auto-unload    — คืน VRAM หลังไม่ใช้งานตาม TTS_IDLE_TIMEOUT

  th              →  f5-tts-th
  en, zh          →  f5-tts
  ภาษาอื่น        →  edge-tts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import asyncio
import importlib.util
import io
import os
import threading
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import soundfile as sf

# ──────────────────────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────────────────────
_SPEC_F5    = importlib.util.find_spec("f5_tts")
_F5_PKG_DIR = os.path.dirname(_SPEC_F5.origin) if (_SPEC_F5 and _SPEC_F5.origin) else ""

F5_REF_AUDIO = os.getenv(
    "F5_REF_AUDIO",
    os.path.join(_F5_PKG_DIR, "infer/examples/basic/basic_ref_en.wav"),
)
F5_REF_TEXT  = os.getenv("F5_REF_TEXT", "Some call me nature, others call me mother nature.")
F5_MODEL     = os.getenv("F5_MODEL",    "F5TTS_v1_Base")
F5_DEVICE    = os.getenv("F5_DEVICE",   "cuda")

F5TH_REF_AUDIO = os.getenv("F5TH_REF_AUDIO", "")
F5TH_REF_TEXT  = os.getenv("F5TH_REF_TEXT",  "ได้รับข่าวคราวของเราที่จะหาที่มันเป็นไปที่จะจัดขึ้น.")

TTS_IDLE_TIMEOUT = int(os.getenv("TTS_IDLE_TIMEOUT", "300"))  # วินาที

# ──────────────────────────────────────────────────────────────
# Thread pool — inference รันแยก thread ไม่บล็อก FastAPI
# ──────────────────────────────────────────────────────────────
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="tts")

# ──────────────────────────────────────────────────────────────
# Idle unload timer
# ──────────────────────────────────────────────────────────────
_tts_lock  = threading.Lock()
_tts_timer: threading.Timer | None = None


def _schedule_unload(unload_fn):
    global _tts_timer
    with _tts_lock:
        if _tts_timer is not None:
            _tts_timer.cancel()
        _tts_timer = threading.Timer(TTS_IDLE_TIMEOUT, unload_fn)
        _tts_timer.daemon = True
        _tts_timer.start()


# ──────────────────────────────────────────────────────────────
# F5-TTS (EN / ZH)
# ──────────────────────────────────────────────────────────────
_f5_model     = None
_f5_ref_cache = None   # cache preprocessed ref audio


def _unload_f5():
    global _f5_model, _f5_ref_cache
    with _tts_lock:
        if _f5_model is not None:
            del _f5_model
            _f5_model     = None
            _f5_ref_cache = None
            print(f"[TTS-F5] unloaded (idle {TTS_IDLE_TIMEOUT}s)")


def _get_f5_model():
    global _f5_model, _f5_ref_cache
    if _f5_model is None:
        from f5_tts.api import F5TTS
        print(f"[TTS-F5] loading ({F5_MODEL} on {F5_DEVICE})...")
        _f5_model = F5TTS(F5_MODEL, device=F5_DEVICE)

        # ── cache ref audio preprocessing ──────────────────────
        # F5TTS.preprocess_ref_audio_text() คำนวณ mel ของ ref audio
        # cache ไว้เพื่อไม่ต้องทำซ้ำทุก call
        if F5_REF_AUDIO and os.path.exists(F5_REF_AUDIO):
            try:
                from f5_tts.infer.utils_infer import preprocess_ref_audio_text
                _f5_ref_cache = preprocess_ref_audio_text(F5_REF_AUDIO, F5_REF_TEXT)
                print("[TTS-F5] ref audio cached ✓")
            except Exception as e:
                print(f"[TTS-F5] ref cache skipped: {e}")
                _f5_ref_cache = None

        print("[TTS-F5] ready")

    _schedule_unload(_unload_f5)
    return _f5_model, _f5_ref_cache


# ──────────────────────────────────────────────────────────────
# F5-TTS-THAI (TH)
# ──────────────────────────────────────────────────────────────
_f5th_model     = None
_f5th_ref_cache = None


def _unload_f5th():
    global _f5th_model, _f5th_ref_cache
    with _tts_lock:
        if _f5th_model is not None:
            del _f5th_model
            _f5th_model     = None
            _f5th_ref_cache = None
            print(f"[TTS-TH] unloaded (idle {TTS_IDLE_TIMEOUT}s)")


def _get_f5th_model():
    global _f5th_model, _f5th_ref_cache
    if _f5th_model is None:
        from f5_tts_th.tts import TTS
        print("[TTS-TH] loading...")
        _f5th_model = TTS(model="v1")

        # ── cache ref audio preprocessing ──────────────────────
        if F5TH_REF_AUDIO and os.path.exists(F5TH_REF_AUDIO):
            try:
                from f5_tts_th.utils_infer import preprocess_ref_audio_text
                _f5th_ref_cache = preprocess_ref_audio_text(F5TH_REF_AUDIO, F5TH_REF_TEXT)
                print("[TTS-TH] ref audio cached ✓")
            except Exception as e:
                print(f"[TTS-TH] ref cache skipped: {e}")
                _f5th_ref_cache = None

        print("[TTS-TH] ready")

    _schedule_unload(_unload_f5th)
    return _f5th_model, _f5th_ref_cache


# ──────────────────────────────────────────────────────────────
# Preload at startup (optional — เรียกจาก main.py)
# ──────────────────────────────────────────────────────────────
def preload_models():
    """
    เรียกตอน startup เพื่อโหลด model ล่วงหน้า
    request แรกจะได้ไม่รอ cold start
    """
    preload_f5  = os.getenv("TTS_PRELOAD_F5",   "false").lower() == "true"
    preload_f5th = os.getenv("TTS_PRELOAD_F5TH", "true").lower()  == "true"

    if preload_f5th:
        try:
            _get_f5th_model()
        except Exception as e:
            print(f"[TTS-TH] preload failed: {e}")

    if preload_f5:
        try:
            _get_f5_model()
        except Exception as e:
            print(f"[TTS-F5] preload failed: {e}")


# ──────────────────────────────────────────────────────────────
# edge-tts voices
# ──────────────────────────────────────────────────────────────
EDGE_VOICE_MAP: dict[str, str] = {
    "th":      "th-TH-PremwadeeNeural",
    "en":      "en-US-JennyNeural",
    "zh":      "zh-CN-XiaoxiaoNeural",
    "ja":      "ja-JP-NanamiNeural",
    "ko":      "ko-KR-SunHiNeural",
    "fr":      "fr-FR-DeniseNeural",
    "de":      "de-DE-KatjaNeural",
    "es":      "es-ES-ElviraNeural",
    "ru":      "ru-RU-SvetlanaNeural",
    "vi":      "vi-VN-HoaiMyNeural",
    "id":      "id-ID-GadisNeural",
    "default": "en-US-JennyNeural",
}


async def _edge_tts_bytes(text: str, voice: str) -> bytes:
    import edge_tts
    communicate = edge_tts.Communicate(text, voice)
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    buf.seek(0)
    return buf.read()


# ──────────────────────────────────────────────────────────────
# Helper: numpy/tensor → WAV bytes
# ──────────────────────────────────────────────────────────────
def _to_wav_bytes(wav, sr: int) -> bytes:
    if hasattr(wav, "numpy"):
        wav = wav.numpy()
    buf = io.BytesIO()
    sf.write(buf, np.array(wav, dtype=np.float32), sr, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.read()


# ──────────────────────────────────────────────────────────────
# Sync inference functions (รันใน thread pool)
# ──────────────────────────────────────────────────────────────
def _infer_f5th(text: str, ref_path: str, ref_txt: str,
                ref_cache, speed: float) -> bytes:
    model, _ = _get_f5th_model()

    kwargs = dict(gen_text=text, speed=speed)
    if ref_cache is not None:
        # ใช้ cache แทนการ preprocess ซ้ำ
        kwargs["ref_audio"] = ref_cache[0]
        kwargs["ref_text"]  = ref_cache[1]
    else:
        kwargs["ref_audio"] = ref_path
        kwargs["ref_text"]  = ref_txt

    wav = model.infer(**kwargs)
    return _to_wav_bytes(wav, 24000)


def _infer_f5(text: str, ref_path: str, ref_txt: str,
              ref_cache, speed: float) -> bytes:
    model, _ = _get_f5_model()

    if ref_cache is not None:
        wav, sr, _ = model.infer(
            ref_file  = ref_cache[0],
            ref_text  = ref_cache[1],
            gen_text  = text,
            speed     = speed,
            show_info = lambda x: None,
        )
    else:
        wav, sr, _ = model.infer(
            ref_file  = ref_path,
            ref_text  = ref_txt,
            gen_text  = text,
            speed     = speed,
            show_info = lambda x: None,
        )
    return _to_wav_bytes(wav, sr)


# ──────────────────────────────────────────────────────────────
# Public API  (async)
# ──────────────────────────────────────────────────────────────
async def synthesize_speech(
    text: str,
    language: str = "en",
    speed: float = 1.0,
    ref_audio_path: str | None = None,
    ref_text: str | None = None,
) -> tuple[bytes, str]:
    """Returns (audio_bytes, mime_type)"""

    lang  = language.lower().split("-")[0]
    voice = EDGE_VOICE_MAP.get(lang, EDGE_VOICE_MAP["default"])
    loop  = asyncio.get_event_loop()

    # ── TH → f5-tts-th ───────────────────────────────────────
    if lang == "th":
        ref_path = ref_audio_path or F5TH_REF_AUDIO
        ref_txt  = ref_text or F5TH_REF_TEXT

        if ref_path and os.path.exists(ref_path):
            try:
                _, cache = _get_f5th_model()
                wav_bytes = await loop.run_in_executor(
                    _executor,
                    lambda: _infer_f5th(text, ref_path, ref_txt, cache, speed),
                )
                return wav_bytes, "audio/wav"
            except Exception as e:
                print(f"[TTS-TH] fallback edge-tts: {e}")

        return await _edge_tts_bytes(text, voice), "audio/mpeg"

    # ── EN / ZH → f5-tts ─────────────────────────────────────
    if lang in ("en", "zh"):
        ref_path = ref_audio_path or F5_REF_AUDIO
        ref_txt  = ref_text or F5_REF_TEXT

        if ref_path and os.path.exists(ref_path):
            try:
                _, cache = _get_f5_model()
                wav_bytes = await loop.run_in_executor(
                    _executor,
                    lambda: _infer_f5(text, ref_path, ref_txt, cache, speed),
                )
                return wav_bytes, "audio/wav"
            except Exception as e:
                print(f"[TTS-F5] fallback edge-tts: {e}")

        return await _edge_tts_bytes(text, voice), "audio/mpeg"

    # ── ภาษาอื่น → edge-tts ──────────────────────────────────
    return await _edge_tts_bytes(text, voice), "audio/mpeg"