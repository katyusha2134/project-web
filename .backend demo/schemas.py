from typing import Optional
from pydantic import BaseModel
from pydantic import BaseModel, EmailStr

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default"

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

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

