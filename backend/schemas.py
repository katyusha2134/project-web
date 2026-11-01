from typing import Optional
from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default"
    engine: Optional[str] = "local"  # "local" | "cloud"


class TranslateRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str
    engine: str  # "local" | "cloud" | "auto"


class TranslateResponse(BaseModel):
    translation: str
    engine_used: str


class OCRResponse(BaseModel):
    text: str


class ChatResponse(BaseModel):
    reply: str
