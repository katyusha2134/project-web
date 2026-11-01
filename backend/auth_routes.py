from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlmodel import Session, select

from backend.database import get_session
from backend.models import User
from backend.auth_schemas import UserRegister, UserPublic, Token
from backend.auth_utils import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# tokenUrl ใช้บอก Swagger UI ว่า endpoint ไหนใช้ขอ token (ไม่กระทบ logic)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# auto_error=False → ไม่ raise ถ้าไม่มี token ใช้กับ route ที่ login เป็น optional
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


# ======================
# Register
# ======================
@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, session: Session = Depends(get_session)):
    existing = session.exec(
        select(User).where(
            (User.username == payload.username) | (User.email == payload.email)
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="username หรือ email นี้ถูกใช้แล้ว")

    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


# ======================
# Login → ใช้ OAuth2PasswordRequestForm (ส่งเป็น form-data: username, password)
# เพื่อให้ใช้กับ Swagger "Authorize" ปุ่มได้เลย
# ======================
@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
):
    user = session.exec(select(User).where(User.username == form_data.username)).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="username หรือ password ไม่ถูกต้อง",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="บัญชีนี้ถูกระงับการใช้งาน")

    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


# ======================
# Dependency: get_current_user  →  บังคับต้อง login (raise 401 ถ้าไม่มี/token ผิด)
# ======================
def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="ไม่สามารถยืนยันตัวตนได้",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    username = payload.get("sub")
    if username is None:
        raise credentials_exception

    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise credentials_exception

    return user


# ======================
# Dependency: get_current_user_optional  →  login ได้แต่ไม่บังคับ
# ใช้กับ /translate, /ocr, /chatbot ที่ยัง guest ใช้ได้ แต่ถ้า login จะผูก user_id ให้
# ======================
def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    session: Session = Depends(get_session),
) -> Optional[User]:
    if not token:
        return None

    payload = decode_access_token(token)
    if payload is None:
        return None

    username = payload.get("sub")
    if not username:
        return None

    return session.exec(select(User).where(User.username == username)).first()


# ======================
# /me — ตัวอย่าง protected route (ทดสอบว่า token ใช้งานได้)
# ======================
@router.get("/me", response_model=UserPublic)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user
