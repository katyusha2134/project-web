from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv

import torch
import os
import io

load_dotenv()

from local_qwen import chat_qwen
from cloud_gemini import chat_gemini
from schemas import (
    TranslateRequest,
    TranslateResponse,
    OCRResponse,
    ChatRequest,
    ChatResponse
)
from inference import hybrid_translate
from ocr_service import run_ocr
from model_manager import scheduler
from stt_service import transcribe_audio       # ← faster-whisper
from tts_service import synthesize_speech, preload_models      # ← Hybrid TTS

app = FastAPI(title="Hybrid AI Translation Backend")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "../frontend")

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


# ======================
# CORS
# ======================
_cors_origins_env = os.getenv("CORS_ALLOW_ORIGINS", "https://katyusha2134.github.io")
_cors_origins = (
    ["*"] if _cors_origins_env.strip() == "*"
    else [o.strip() for o in _cors_origins_env.split(",")]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ======================
# [8] Graceful Shutdown Hook
# ── ส่ง evict job เข้า queue และรอ worker ยืนยันก่อน return
# ── GPU lifecycle ยังอยู่ใน worker เสมอ ไม่มี direct call
# ======================
@app.on_event("startup")
def on_startup():
    import threading
    t = threading.Thread(target=preload_models, daemon=True)
    t.start()


@app.on_event("shutdown")
def on_shutdown():
    scheduler.force_unload_sync(timeout=30.0)


# ======================
# Health Check
# ======================
@app.get("/health")
def health():
    return {
        "status":     "ok",
        "gpu_model":  scheduler.current_model,
        "queue_size": scheduler.queue_size,
    }


# ======================
# Translation API
# ======================
@app.post("/api/v1/translate", response_model=TranslateResponse)
def translate_api(req: TranslateRequest):
    result, engine_used = hybrid_translate(
        req.text,
        req.source_lang,
        req.target_lang,
        req.engine
    )
    return {"translation": result, "engine_used": engine_used}


# ======================
# OCR API
# ======================
@app.post("/api/v1/ocr", response_model=OCRResponse)
async def ocr_api(file: UploadFile = File(...)):
    image_bytes = await file.read()
    text = run_ocr(image_bytes)
    return {"text": text}


# ======================
# Chatbot API
# ======================
@app.post("/api/v1/chatbot", response_model=ChatResponse)
def chatbot_api(req: ChatRequest):
    engine = getattr(req, "engine", "local")

    try:
        if engine == "cloud":
            reply = chat_gemini(req.message)
            return {"reply": reply}

        # Primary: Qwen (ผ่าน scheduler — queue-safe)
        reply = chat_qwen(req.message)
        return {"reply": reply}

    except RuntimeError as e:
        error_msg = str(e)

        # ── Queue overloaded ──────────────────────────────────
        if "queue overloaded" in error_msg.lower():
            return {"reply": "[ERROR] Server is busy. Please retry in a moment."}

        # ── GPU OOM ───────────────────────────────────────────
        # ส่ง evict job เข้า queue (async) แล้ว fallback cloud ทันที
        # ไม่เรียก GPU โดยตรง — worker จัดการ evict เอง
        if "out of memory" in error_msg.lower():
            scheduler.force_unload_async()

            fallback_reply = chat_gemini(req.message)
            return {
                "reply": fallback_reply
                + "\n\n[Fallback: Gemini due to GPU memory limit]"
            }

        return {"reply": f"[ERROR] {error_msg}"}

    except TimeoutError:
        return {"reply": "[ERROR] Request timed out. Please retry."}


# ======================
# STT API  (faster-whisper)
# ======================
@app.post("/api/v1/stt")
async def stt_api(
    file:     UploadFile = File(...),
    language: str        = Form(default=None),   # "th" / "en" / None = auto-detect
):
    """
    รับไฟล์เสียง (webm / wav / mp3) → คืน transcript JSON
    {
        "text": "...",
        "language": "th",
        "language_probability": 0.99
    }
    """
    audio_bytes = await file.read()
    result = transcribe_audio(audio_bytes, language=language or None)
    return result


# ======================
# TTS API  (Hybrid: f5-tts-th / f5-tts / edge-tts)
# ======================
@app.post("/api/v1/tts")
async def tts_api(
    text:     str   = Form(...),
    language: str   = Form(default="en"),  # "th" / "en" / "zh" / "ja" / ...
    speed:    float = Form(default=1.0),
):
    """
    รับ text + language → คืน audio stream (WAV หรือ MP3 ตาม engine)
    - th        → f5-tts-th
    - en, zh    → f5-tts
    - ภาษาอื่น  → edge-tts (MP3)
    """
    audio_bytes, mime_type = await synthesize_speech(
        text     = text,
        language = language,
        speed    = speed,
    )
    ext = "wav" if mime_type == "audio/wav" else "mp3"
    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type=mime_type,
        headers={"Content-Disposition": f"inline; filename=tts_output.{ext}"},
    )