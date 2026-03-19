import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from auth import verify_password, create_access_token, get_current_user, hash_password
from config import settings
import smtplib
from email.mime.text import MIMEText

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def send_email(to: str, subject: str, body: str):
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    try:
        if settings.SMTP_TLS:
            smtp = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
        else:
            smtp = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.sendmail(settings.SMTP_FROM, [to], msg.as_string())
        smtp.quit()
    except Exception as e:
        raise HTTPException(500, f"メール送信に失敗しました: {e}")


@router.post("/login", response_model=schemas.Token)
def login(req: schemas.LoginRequest, db: Session = Depends(get_db)):
    """メールアドレス + パスワードでログイン"""
    user = db.query(models.User).filter(models.User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="メールアドレスまたはパスワードが違います"
        )
    return {"access_token": create_access_token(user.id, user.role), "token_type": "bearer"}


@router.get("/me", response_model=schemas.UserOut)
def me(current_user=Depends(get_current_user)):
    return current_user


# --- 新規ユーザー登録 ---

@router.post("/register")
def register(req: schemas.RegisterRequest, db: Session = Depends(get_db)):
    """メールアドレスをキーに仮登録して確認メールを送信"""
    # メールアドレスの重複チェック（本登録済み）
    if db.query(models.User).filter(models.User.email == req.email).first():
        raise HTTPException(400, "このメールアドレスはすでに登録されています")

    # 既存の仮登録があれば上書き（再送信対応）
    existing = db.query(models.EmailVerification).filter(
        models.EmailVerification.email == req.email
    ).first()
    if existing:
        db.delete(existing)
        db.flush()

    token = secrets.token_hex(32)
    expires_at = datetime.utcnow() + timedelta(hours=24)
    verification = models.EmailVerification(
        name=req.name,
        email=req.email,
        token=token,
        expires_at=expires_at,
    )
    db.add(verification)
    db.commit()

    verify_url = f"{settings.FRONTEND_URL}/set-password?token={token}"
    body = f"""{req.name} さん、CropWorksへのご登録ありがとうございます。

以下のリンクをクリックしてパスワードを設定し、登録を完了してください。
リンクの有効期限は24時間です。

{verify_url}

このメールに心当たりがない場合は無視してください。
"""
    send_email(req.email, "【CropWorks】メールアドレスの確認", body)
    return {"message": "確認メールを送信しました。メールをご確認ください。"}


@router.post("/verify-email", response_model=schemas.Token)
def verify_email(req: schemas.VerifyEmailRequest, db: Session = Depends(get_db)):
    """トークンを検証してパスワードを設定し本登録完了 → JWTを返しそのままログイン"""
    verification = db.query(models.EmailVerification).filter(
        models.EmailVerification.token == req.token,
        models.EmailVerification.used == False,
        models.EmailVerification.expires_at > datetime.utcnow()
    ).first()

    if not verification:
        raise HTTPException(400, "無効または期限切れのリンクです。再度登録をお試しください。")

    if len(req.password) < 6:
        raise HTTPException(400, "パスワードは6文字以上で入力してください")

    # 本登録：adminとして作成
    user = models.User(
        name=verification.name,
        email=verification.email,
        password_hash=hash_password(req.password),
        role=models.UserRole.admin,
    )
    db.add(user)
    verification.used = True
    db.commit()
    db.refresh(user)

    return {"access_token": create_access_token(user.id, user.role), "token_type": "bearer"}


# --- パスワードリセット ---

@router.post("/password-reset/request")
def request_password_reset(req: schemas.PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == req.email).first()
    if user:
        db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.user_id == user.id,
            models.PasswordResetToken.used == False
        ).update({"used": True})

        token = secrets.token_hex(32)
        expires_at = datetime.utcnow() + timedelta(hours=1)
        reset_token = models.PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=expires_at
        )
        db.add(reset_token)
        db.commit()

        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        body = f"""パスワードリセットのご依頼を受け付けました。

以下のリンクをクリックしてパスワードを再設定してください。
リンクの有効期限は1時間です。

{reset_url}

このメールに心当たりがない場合は無視してください。
"""
        send_email(user.email, "【CropWorks】パスワードリセット", body)

    return {"message": "メールアドレスが登録されている場合、リセット用リンクを送信しました"}


@router.post("/password-reset/confirm")
def confirm_password_reset(req: schemas.PasswordResetConfirm, db: Session = Depends(get_db)):
    reset_token = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token == req.token,
        models.PasswordResetToken.used == False,
        models.PasswordResetToken.expires_at > datetime.utcnow()
    ).first()

    if not reset_token:
        raise HTTPException(400, "無効または期限切れのトークンです")

    user = db.get(models.User, reset_token.user_id)
    user.password_hash = hash_password(req.new_password)
    reset_token.used = True
    db.commit()

    return {"message": "パスワードを変更しました"}
