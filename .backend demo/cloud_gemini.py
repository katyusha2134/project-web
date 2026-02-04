import os
from dotenv import load_dotenv
import google.generativeai as genai

# โหลด env ให้ชัดเจน
load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

if not API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set")

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel(MODEL_NAME)

def translate_cloud(text: str, target_lang: str) -> str:
    prompt = f"Translate this text into {target_lang}:\n{text}"
    return model.generate_content(prompt).text

def chat_gemini(message: str) -> str:
    if not message or not message.strip():
        return ""

    prompt = f"""
ตอบให้สั้นที่สุดและตรงคำถามเท่านั้น
- ห้ามอธิบาย
- ห้ามยกตัวอย่าง
- ห้ามใช้ markdown หรือสัญลักษณ์พิเศษ
- ถ้าเป็นคำศัพท์ ให้ตอบเป็นคำแปลเดียว

คำถาม: {message}
คำตอบ:
"""
    response = model.generate_content(prompt)
    return response.text.strip()