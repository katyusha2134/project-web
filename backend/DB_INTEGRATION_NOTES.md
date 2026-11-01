# สรุปการแก้ไข + เชื่อม DB เข้า backend

## ไฟล์ที่แก้/เพิ่ม

| ไฟล์ | สถานะ | สิ่งที่เปลี่ยน |
|---|---|---|
| `schemas.py` | แก้ | ลบ `ChatRequest` ที่ประกาศซ้ำ (ตัวที่สองเคยทับตัวแรกจน `session_id` หาย) รวมเป็นคลาสเดียว เพิ่ม `engine` field ให้เลือก local/cloud ได้จริงจาก request |
| `models.py` | ใหม่ | รวม 5 ตาราง (`User`, `Translation`, `ChatSession`, `ChatMessage`, `OCRResult`) ตรงกับ schema.sql ที่สรุปกันไว้ ใช้ ENUM จริงสำหรับ `engine_used`/`role`, ตั้ง `ondelete` ให้ตรง (`SET NULL` กับ users, `CASCADE` กับ chat_sessions→chat_messages) |
| `database.py` | แก้ | เชื่อม MySQL ผ่าน `trans_ai`/`trans_db`, `init_db()` สร้างครบ 5 ตารางจาก `models.py` |
| `auth_schemas.py` | เดิม | ไม่เปลี่ยน |
| `auth_utils.py` | เดิม | ไม่เปลี่ยน |
| `auth_routes.py` | แก้ | import จาก `models.py` แทน `auth_models.py`, เพิ่ม `get_current_user_optional` — คืน `None` เงียบๆ ถ้าไม่มี/token ผิด แทนที่จะ raise 401 |
| `main.py` | แก้ | mount auth router, เรียก `init_db()` ตอน startup, ทุก endpoint (`translate`, `ocr`, `chatbot`) บันทึกประวัติลง DB ผ่าน `get_current_user_optional` |

**ลบไฟล์เก่าทิ้ง:** `auth_models.py` (ถูกรวมเข้า `models.py` แล้ว) — ถ้ายังมีอยู่ในโปรเจกต์ ให้ลบออกเพื่อไม่ให้ import ชนกัน

## หลักการที่ใช้: Login เป็น optional ไม่ใช่ bắt buộc

`get_current_user_optional` ทำให้ `/translate`, `/ocr`, `/chatbot` **ยังใช้งานได้แม้ไม่ login** (`user_id = NULL` ใน DB) แต่ถ้า frontend แนบ header `Authorization: Bearer <token>` มา ระบบจะผูกประวัติกับ user นั้นอัตโนมัติ — ไม่ต้องแก้ frontend เดิมทันที แต่พร้อมอัปเกรดทีหลัง

ถ้าอยากบังคับ login จริงๆ ในบาง endpoint ภายหลัง แค่เปลี่ยน dependency จาก `get_current_user_optional` เป็น `get_current_user` (ตัวที่ raise 401 ถ้าไม่ login)

## ติดตั้งก่อนรัน

```bash
pip install sqlmodel pymysql "python-jose[cryptography]" "passlib[bcrypt]" python-multipart
```

`.env` ต้องมี (ตามที่แก้ไปรอบก่อน):
```env
DATABASE_URL=mysql+pymysql://trans_ai:<password>@localhost:3306/trans_db
JWT_SECRET_KEY=<openssl rand -hex 32>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

## ทดสอบ

```bash
# แปลแบบ guest (ไม่ login) — บันทึกด้วย user_id = NULL
curl -X POST http://127.0.0.1:8000/api/v1/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"hello","source_lang":"en","target_lang":"th","engine":"local"}'

# สมัคร + login
curl -X POST http://127.0.0.1:8000/api/v1/auth/register \
  -d '{"username":"krit","email":"krit@example.com","password":"password123"}' \
  -H "Content-Type: application/json"

curl -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -d "username=krit&password=password123"

# แปลแบบ login แล้ว — บันทึกผูกกับ user_id จริง
curl -X POST http://127.0.0.1:8000/api/v1/translate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{"text":"hello","source_lang":"en","target_lang":"th","engine":"local"}'

# เช็คใน MySQL
mysql -u trans_ai -p trans_db -e "SELECT id, user_id, source_text, engine_used FROM translations;"
```

## สิ่งที่ยังไม่ทำ (บอกได้ถ้าต้องการ)

- Frontend (`app.js`) ยังไม่มี login form / ยังไม่เก็บ-แนบ token — ถ้าอยากให้ user login ผ่านหน้าเว็บได้จริง ต้องเพิ่ม UI ตรงนี้
- ยังไม่มี endpoint ดึงประวัติย้อนหลัง (เช่น `GET /api/v1/translate/history`) — ถ้าต้องการหน้า "ประวัติของฉัน" บอกได้ จะเพิ่มให้
