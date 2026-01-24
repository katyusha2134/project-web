import os
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer
import google.generativeai as genai
import pytesseract
from PIL import Image

app = Flask(__name__)
CORS(app)

# ==========================================
# 1. ตั้งค่า API Key (Gemini)
# ==========================================
API_KEY = "AIzaSyBTTrg7SIBL8t8Ngu8fFOAbZBNK3CDVoaA"
genai.configure(api_key=API_KEY)
chat_model = genai.GenerativeModel('gemini-flash-latest')

# ==========================================
# 2. ตั้งค่า Tesseract (แก้ Path ให้ชัวร์ที่สุด)
# ==========================================
# ใช้ Path มาตรฐานของ Windows 64-bit
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# ==========================================
# 3. โหลดโมเดลแปลภาษา (m2m100)
# ==========================================
print("--- กำลังโหลดโมเดล m2m100... ---")
try:
    model_name = "facebook/m2m100_418M"
    tokenizer = M2M100Tokenizer.from_pretrained(model_name)
    model = M2M100ForConditionalGeneration.from_pretrained(model_name)
    print("--- โหลดโมเดลเสร็จแล้ว! ---")
except:
    print("คำเตือน: โหลด m2m100 ไม่สำเร็จ (จะใช้ Gemini แทน)")

# --- Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/v1/translate', methods=['POST'])
def translate_api():
    data = request.json
    # ใช้ Gemini แปลแทน เพราะเร็วกว่าและรองรับทุกภาษา
    try:
        prompt = f"Translate this to {data['target_lang']}: {data['text']}"
        response = chat_model.generate_content(prompt)
        return jsonify({"translation": response.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/v1/chatbot', methods=['POST'])
def chatbot_api():
    data = request.json
    try:
        response = chat_model.generate_content(data.get('message', ''))
        return jsonify({"reply": response.text})
    except Exception as e:
        return jsonify({"reply": "ระบบขัดข้อง: " + str(e)}), 500

# API 3: OCR (ฉบับแก้ไขให้ไม่พัง)
@app.route('/api/v1/ocr-translate', methods=['POST'])
def ocr_api():
    if 'image' not in request.files:
        return jsonify({"error": "No image uploaded"}), 400
    
    file = request.files['image']
    tgt_lang = request.form.get('target_lang', 'en')
    
    try:
        img = Image.open(file)
        
        # 1. ลองอ่านภาษาอังกฤษก่อน (เพื่อเช็คว่าโปรแกรมอยู่จริงไหม)
        # หมายเหตุ: ผมเปลี่ยนเป็น 'eng' ก่อน ถ้าลงภาษาไทยแล้วค่อยแก้เป็น 'tha+eng'
        print("กำลังเริ่มสแกนภาพ...")
        extracted_text = pytesseract.image_to_string(img, lang='eng') 
        print(f"อ่านข้อความได้ว่า: {extracted_text[:50]}...")

        # 2. แปลภาษา
        if not extracted_text.strip():
            extracted_text = "(ไม่พบข้อความในภาพ หรือ ภาพไม่ชัด)"
            translated_text = "-"
        else:
            prompt = f"Translate this text to {tgt_lang}: {extracted_text}"
            response = chat_model.generate_content(prompt)
            translated_text = response.text
        
        return jsonify({
            "extracted_text": extracted_text,
            "translation": translated_text
        })

    except pytesseract.TesseractNotFoundError:
        print("❌ Error: หาไฟล์ tesseract.exe ไม่เจอ!")
        return jsonify({"error": "Server Error: หาโปรแกรม Tesseract ไม่เจอ (เช็ค Path บรรทัด 23)"}), 500
    except Exception as e:
        print(f"❌ Error อื่นๆ: {e}")
        return jsonify({"error": f"OCR Error: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)