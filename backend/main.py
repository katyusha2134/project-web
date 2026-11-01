from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from sqlmodel import Session, select

import torch
import os
import io

load_dotenv()

from backend.local_qwen import chat_qwen
from backend.cloud_gemini import chat_gemini
from backend.schemas import (
    TranslateRequest,
    TranslateResponse,
    OCRResponse,
    ChatRequest,
    ChatResponse
)
from backend.inference import hybrid_translate
from backend.ocr_service import run_ocr
from backend.model_manager import scheduler
from backend.stt_service import transcribe_audio       # ← faster-whisper
from backend.tts_service import synthesize_speech, preload_models      # ← Hybrid TTS

# ── DB / Auth ─────────────────────────────────────────────
from backend.database import init_db, get_session
from backend.models import User, Translation, ChatSession, ChatMessage, OCRResult, EngineType, RoleType
from backend.auth_routes import router as auth_router, get_current_user_optional

app = FastAPI(title="Hybrid AI Translation Backend")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "../frontend")

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
app.include_router(auth_router)


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
# Startup / Shutdown
# ======================
@app.on_event("startup")
def on_startup():
    import threading

    init_db()  # สร้างตาราง MySQL ทั้ง 5 ตัวถ้ายังไม่มี

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
def translate_api(
    req: TranslateRequest,
    db: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    result, engine_used = hybrid_translate(
        req.text,
        req.source_lang,
        req.target_lang,
        req.engine
    )

    # บันทึกประวัติการแปล — user_id เป็น NULL ได้ถ้าไม่ได้ login (guest)
    record = Translation(
        user_id=current_user.id if current_user else None,
        source_text=req.text,
        translated_text=result,
        source_lang=req.source_lang,
        target_lang=req.target_lang,
        engine_used=EngineType(engine_used),
    )
    db.add(record)
    db.commit()

    return {"translation": result, "engine_used": engine_used}


# ======================
# OCR API
# ======================
@app.post("/api/v1/ocr", response_model=OCRResponse)
async def ocr_api(
    file: UploadFile = File(...),
    db: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    image_bytes = await file.read()
    text = run_ocr(image_bytes)

    record = OCRResult(
        user_id=current_user.id if current_user else None,
        image_name=file.filename or "unknown",
        extracted_text=text,
    )
    db.add(record)
    db.commit()

    return {"text": text}


# ======================
# Chat history helpers
# ======================
def _get_or_create_chat_session(db: Session, session_id: str, user_id: Optional[int]) -> ChatSession:
    chat_session = db.exec(
        select(ChatSession).where(ChatSession.session_id == session_id)
    ).first()

    if chat_session is None:
        chat_session = ChatSession(session_id=session_id, user_id=user_id)
        db.add(chat_session)
        db.commit()
        db.refresh(chat_session)

    return chat_session


def _log_message(db: Session, chat_session_id: int, role: RoleType, content: str):
    db.add(ChatMessage(session_id=chat_session_id, role=role, content=content))
    db.commit()


# ======================
# Chatbot API
# ======================
@app.post("/api/v1/chatbot", response_model=ChatResponse)
def chatbot_api(
    req: ChatRequest,
    db: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    engine = req.engine or "local"
    session_id = req.session_id or "default"

    chat_session = _get_or_create_chat_session(
        db, session_id, current_user.id if current_user else None
    )
    _log_message(db, chat_session.id, RoleType.user, req.message)

    try:
        if engine == "cloud":
            reply = chat_gemini(req.message)
            _log_message(db, chat_session.id, RoleType.bot, reply)
            return {"reply": reply}

        # Primary: Qwen (ผ่าน scheduler — queue-safe)
        reply = chat_qwen(req.message)
        _log_message(db, chat_session.id, RoleType.bot, reply)
        return {"reply": reply}

    except RuntimeError as e:
        error_msg = str(e)

        # ── Queue overloaded ──────────────────────────────────
        if "queue overloaded" in error_msg.lower():
            reply = "[ERROR] Server is busy. Please retry in a moment."
            _log_message(db, chat_session.id, RoleType.bot, reply)
            return {"reply": reply}

        # ── GPU OOM ───────────────────────────────────────────
        # ส่ง evict job เข้า queue (async) แล้ว fallback cloud ทันที
        # ไม่เรียก GPU โดยตรง — worker จัดการ evict เอง
        if "out of memory" in error_msg.lower():
            scheduler.force_unload_async()

            fallback_reply = chat_gemini(req.message)
            reply = fallback_reply + "\n\n[Fallback: Gemini due to GPU memory limit]"
            _log_message(db, chat_session.id, RoleType.bot, reply)
            return {"reply": reply}

        reply = f"[ERROR] {error_msg}"
        _log_message(db, chat_session.id, RoleType.bot, reply)
        return {"reply": reply}

    except TimeoutError:
        reply = "[ERROR] Request timed out. Please retry."
        _log_message(db, chat_session.id, RoleType.bot, reply)
        return {"reply": reply}


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
