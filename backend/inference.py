import torch  # type: ignore
from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer  # type: ignore
from cloud_gemini import translate_cloud
from model_manager import scheduler

MODEL_NAME = "m2m100"
MODEL_PATH = "/home/krit/qlora_env/main/m2m100_qlora/final_m2m100_model"

model = None
tokenizer = None


# ==========================
# Model Loader / Unloader
# ==========================

def load_model():
    """เรียกโดย scheduler เท่านั้น — ไม่ต้องมี lock"""
    global model, tokenizer

    if model is not None:
        return

    tokenizer = M2M100Tokenizer.from_pretrained(MODEL_PATH)
    model = M2M100ForConditionalGeneration.from_pretrained(MODEL_PATH).to("cuda")
    model.eval()
    print(f"[{MODEL_NAME}] Loaded")


def unload_model():
    """เรียกโดย scheduler เท่านั้น — ไม่ต้องมี lock"""
    global model, tokenizer

    if model is None:
        return

    del model
    del tokenizer
    model = None
    tokenizer = None

    torch.cuda.empty_cache()
    torch.cuda.ipc_collect()
    print(f"[{MODEL_NAME}] Unloaded")


# ==========================
# Chunking
# ==========================

def chunk_text(text: str, max_chars: int = 800) -> list[str]:
    """แบ่งข้อความตามประโยค ไม่เกิน max_chars ต่อ chunk"""
    sentences = text.replace("\n", " ").split(". ")
    chunks, current = [], ""

    for s in sentences:
        if len(current) + len(s) < max_chars:
            current += s + ". "
        else:
            if current:
                chunks.append(current.strip())
            current = s + ". "

    if current:
        chunks.append(current.strip())

    return chunks


# ==========================
# Inference (private — เรียกผ่าน scheduler เท่านั้น)
# ==========================

def _do_inference(text: str, src: str, tgt: str) -> str:
    """ทำงานใน worker thread ของ scheduler — GPU safe, no lock needed"""
    tokenizer.src_lang = src
    encoded = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=1024,
    ).to("cuda")

    generated_tokens = model.generate(
        **encoded,
        forced_bos_token_id=tokenizer.get_lang_id(tgt),
        max_length=512,
    )

    return tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0]


# ==========================
# Public API
# ==========================

def translate_local(text: str, src: str, tgt: str) -> str:
    """
    ส่ง job เข้า scheduler แล้วรอผล
    หลาย user เรียกพร้อมกันได้ — scheduler จัดคิวให้เอง
    """
    future = scheduler.submit(
        MODEL_NAME,
        load_model,
        unload_model,
        _do_inference,
        text, src, tgt,
    )
    return future.result()


def translate_long_text(text: str, src: str, tgt: str) -> str:
    """แบ่ง chunk แล้วแปลทีละส่วน — ใช้กับข้อความยาวจาก OCR"""
    chunks = chunk_text(text)
    results = [translate_local(chunk, src, tgt) for chunk in chunks]
    return " ".join(results)


def hybrid_translate(text: str, src: str, tgt: str, engine: str):
    if engine == "local":
        return translate_long_text(text, src, tgt), "local"

    if engine == "cloud":
        return translate_cloud(text, tgt), "cloud"

    # Auto: ลอง local ก่อน fallback cloud
    try:
        return translate_long_text(text, src, tgt), "local"
    except Exception:
        return translate_cloud(text, tgt), "cloud"