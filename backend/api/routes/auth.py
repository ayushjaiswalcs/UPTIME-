from datetime import timedelta, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from core.deps import get_db, get_current_user
from core.config import settings
from core.email import send_email, smtp_configured
from core.security import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    decode_token, create_purpose_token, decode_purpose_token,
)
from models.user import User
from schemas.user import (
    UserRegister, UserLogin, TokenResponse, UserOut, UserUpdate, PasswordChange,
    ForgotPasswordRequest, ResetPasswordRequest, VerifyEmailRequest,
)
try:
    import pyotp
    _PYOTP_AVAILABLE = True
except ImportError:
    _PYOTP_AVAILABLE = False

router = APIRouter(prefix="/auth", tags=["auth"])

# Generic message so we never reveal whether an email is registered.
_FORGOT_OK = "If an account exists for that email, a password reset link has been sent."
MIN_PASSWORD_LEN = 8


def _validate_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=422,
            detail=f"Password must be at least {MIN_PASSWORD_LEN} characters",
        )


def _send_verification_email(user: User) -> str:
    token = create_purpose_token(user.id, "verify", timedelta(hours=24))
    link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    send_email(
        user.email,
        "Verify your Uptime account",
        f"Hi {user.name},\n\nConfirm your email address:\n{link}\n\nThis link expires in 24 hours.",
    )
    return token


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(data: UserRegister, db: Session = Depends(get_db)):
    _validate_password(data.password)
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role="owner",
        subscription_plan="free",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _send_verification_email(user)
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    # Track last login
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    # If 2FA is enabled, return a challenge response instead of full tokens.
    # The frontend must follow up with POST /auth/2fa/verify.
    if user.totp_enabled and _PYOTP_AVAILABLE:
        pre_token = create_purpose_token(user.id, "pre2fa", timedelta(minutes=5))
        return {"requires_2fa": True, "pre_token": pre_token}
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=UserOut.model_validate(user))


@router.post("/refresh")
def refresh_token(token: str, db: Session = Depends(get_db)):
    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    new_access = create_access_token({"sub": str(user.id)})
    return {"access_token": new_access, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(data: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if data.name:
        current_user.name = data.name
    if data.email:
        existing = db.query(User).filter(User.email == data.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        current_user.email = data.email
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password")
def change_password(data: PasswordChange, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    _validate_password(data.new_password)
    current_user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"message": "Password updated successfully"}


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    response = {"message": _FORGOT_OK}
    if user:
        token = create_purpose_token(user.id, "reset", timedelta(minutes=30))
        link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        send_email(
            user.email,
            "Reset your Uptime password",
            f"Hi {user.name},\n\nReset your password using this link:\n{link}\n\nThis link expires in 30 minutes. If you didn't request this, you can ignore this email.",
        )
        # In local dev (no SMTP) expose the link so the flow remains testable.
        if not smtp_configured():
            response["dev_reset_link"] = link
    return response


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    user_id = decode_purpose_token(data.token, "reset")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    _validate_password(data.new_password)
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"message": "Your password has been reset. You can now sign in."}


@router.post("/verify-email")
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    user_id = decode_purpose_token(data.token, "verify")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    user.is_verified = "true"
    db.commit()
    return {"message": "Email verified successfully"}


@router.post("/resend-verification")
def resend_verification(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.is_verified == "true":
        return {"message": "Your email is already verified"}
    token = _send_verification_email(current_user)
    response = {"message": "Verification email sent"}
    if not smtp_configured():
        response["dev_verify_link"] = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    return response


# ── 2FA endpoints ─────────────────────────────────────────────────────────

@router.get("/2fa/setup")
def setup_2fa(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _PYOTP_AVAILABLE:
        raise HTTPException(status_code=503, detail="2FA not available: pyotp not installed")
    if current_user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled")
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=current_user.email, issuer_name="Uptime")
    current_user.totp_secret = secret
    db.commit()
    return {"secret": secret, "otpauth_uri": provisioning_uri}


@router.post("/2fa/enable")
def enable_2fa(code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not _PYOTP_AVAILABLE:
        raise HTTPException(status_code=503, detail="2FA not available: pyotp not installed")
    if current_user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled")
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="Setup 2FA first via GET /auth/2fa/setup")
    totp = pyotp.TOTP(current_user.totp_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")
    current_user.totp_enabled = True
    db.commit()
    return {"message": "2FA enabled successfully"}


@router.post("/2fa/verify")
def verify_2fa(pre_token: str, code: str, db: Session = Depends(get_db)):
    if not _PYOTP_AVAILABLE:
        raise HTTPException(status_code=503, detail="2FA not available: pyotp not installed")
    user_id = decode_purpose_token(pre_token, "pre2fa")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired pre-auth token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, user=UserOut.model_validate(user))


@router.delete("/2fa/disable")
def disable_2fa(password: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is not enabled")
    if not verify_password(password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect password")
    current_user.totp_enabled = False
    current_user.totp_secret = None
    db.commit()
    return {"message": "2FA disabled"}
