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
    user = db.query(models.User).filter(models.User.name == req.name).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return {"access_token": create_access_token(user.id, user.role), "token_type": "bearer"}


@router.get("/me", response_model=schemas.UserOut)
def me(current_user=Depends(get_current_user)):
    return current_user


@router.post("/password-reset/request")
def request_password_reset(req: schemas.PasswordResetRequest, db: Session = Depends(get_db)):
    """メールアドレスにパスワードリセット用リンクを送信"""
    user = db.query(models.User).filter(models.User.email == req.email).first()
    # ユーザーが存在しない場合も同じレスポンスを返す（メールアドレス列挙対策）
    if user:
        # 既存の未使用トークンを無効化
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
    """トークンを検証して新しいパスワードを設定"""
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
