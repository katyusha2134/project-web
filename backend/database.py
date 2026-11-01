import os
from dotenv import load_dotenv
from sqlmodel import SQLModel, create_engine, Session

load_dotenv()

# ตัวอย่าง DATABASE_URL ใน .env:
# DATABASE_URL=mysql+pymysql://trans_ai:password@localhost:3306/trans_db
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set (.env)")

# pool_pre_ping=True กัน connection หลุดจาก MySQL wait_timeout
# pool_recycle=3600 รีไซเคิล connection ก่อนโดน server ตัดทิ้ง
engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=3600,
)


def init_db():
    """สร้างตารางถ้ายังไม่มี — เรียกตอน startup"""
    from backend.models import User, Translation, ChatSession, ChatMessage, OCRResult  # noqa: F401
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency — เปิด session ต่อ request แล้วปิดอัตโนมัติ"""
    with Session(engine) as session:
        yield session
