from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
import os

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

load_dotenv()

from inference import hybrid_translate
from ocr_service import run_ocr

app = FastAPI(title="Hybrid AI Translation Backend")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "../frontend")

app.mount(
    "/static",
    StaticFiles(directory=FRONTEND_DIR),
    name="static"
)

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


# ======================
# CORS (GitHub Pages)
# ======================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ปรับภายหลังเป็น domain จริง
    allow_methods=["*"],
    allow_headers=["*"],
)

# ======================
# Health Check
# ======================
@app.get("/health")
def health():
    return {"status": "ok"}

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

    return {
        "translation": result,
        "engine_used": engine_used
    }

# ======================
# OCR API (แยก service)
# ======================
@app.post("/api/v1/ocr", response_model=OCRResponse)
async def ocr_api(file: UploadFile = File(...)):
    image_bytes = await file.read()
    text = run_ocr(image_bytes)
    return {"text": text}

# ======================
# chat bot
# ======================
@app.post("/api/v1/chatbot", response_model=ChatResponse)
def chatbot_api(req: ChatRequest):
    try:
        reply = chat_gemini(req.message)
        return {"reply": reply}
    except Exception as e:
        return {"reply": f"[ERROR] {str(e)}"}
