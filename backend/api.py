# backend/api.py
from fastapi import APIRouter
from .schemas import TranslateRequest, TranslateResponse
from .inference import translate

router = APIRouter()

@router.post("/translate", response_model=TranslateResponse)
def translate_api(req: TranslateRequest):
    outputs = translate(
        texts=req.texts,
        src_lang=req.src_lang,
        tgt_lang=req.tgt_lang,
        max_length=req.max_length
    )
    return TranslateResponse(translations=outputs)
