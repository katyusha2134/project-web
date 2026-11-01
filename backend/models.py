import enum
from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy import Enum as SAEnum


class EngineType(str, enum.Enum):
    local = "local"
    cloud = "cloud"


class RoleType(str, enum.Enum):
    user = "user"
    bot = "bot"


# ======================
# 1. users
# ======================
class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True, max_length=50)
    email: str = Field(index=True, unique=True, max_length=255)
    hashed_password: str = Field(max_length=255)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ======================
# 2. translations
# ======================
class Translation(SQLModel, table=True):
    __tablename__ = "translations"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    source_text: str
    translated_text: str
    source_lang: str = Field(max_length=50)
    target_lang: str = Field(max_length=50)
    engine_used: EngineType = Field(
        sa_column=Column(SAEnum(EngineType, name="engine_used_enum", values_callable=lambda e: [x.value for x in e]), nullable=False)
    )
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


# ======================
# 3. chat_sessions
# ======================
class ChatSession(SQLModel, table=True):
    __tablename__ = "chat_sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    session_id: str = Field(max_length=100, unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ======================
# 4. chat_messages  (ผูกกับ chat_sessions ไม่ใช่ users → CASCADE)
# ======================
class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(
        sa_column=Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    role: RoleType = Field(
        sa_column=Column(SAEnum(RoleType, name="role_enum", values_callable=lambda e: [x.value for x in e]), nullable=False)
    )
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


# ======================
# 5. ocr_results
# ======================
class OCRResult(SQLModel, table=True):
    __tablename__ = "ocr_results"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    image_name: str = Field(max_length=255)
    extracted_text: str
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
