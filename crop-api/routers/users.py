import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import models, schemas
from auth import get_current_user
from config import settings
import smtplib
from email.mime.text import MIMEText

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def require_admin(current_user: models.User = Depends(get_current_user)):
    if current_user.role != models.UserRole.admin:
        raise HTTPException(403, "管理者のみ操作できます")
    return current_user


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


@router.get("", response_model=List[schemas.UserOut])
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    """ユーザー一覧（admin専用）"""
    return db.query(models.User).order_by(models.User.name).all()


@router.get("/{user_id}/fields", response_model=List[schemas.FieldOut])
def get_user_fields(user_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """指定ユーザーの圃場一覧（admin専用）"""
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "ユーザーが見つかりません")
    return user.fields


@router.post("", response_model=schemas.UserOut)
def invite_user(
    data: schemas.UserInvite,
    db: Session = Depends(get_db),
    _=Depends(require_admin)
):
    """ユーザー招待（admin専用）— メールでパスワード設定リンクを送信"""
    # メールアドレスの重複チェック（本登録済み）
    if db.query(models.User).filter(models.User.email == data.email).first():
        raise HTTPException(400, "このメールアドレスはすでに登録されています")

    # 既存の仮登録があれば上書き
    existing = db.query(models.EmailVerification).filter(
        models.EmailVerification.email == data.email
    ).first()
    if existing:
        db.delete(existing)
        db.flush()

    token = secrets.token_hex(32)
    expires_at = datetime.utcnow() + timedelta(hours=24)
    verification = models.EmailVerification(
        name=data.name,
        email=data.email,
        token=token,
        expires_at=expires_at,
    )
    db.add(verification)
    db.commit()

    verify_url = f"{settings.FRONTEND_URL}/set-password?token={token}"
    body = f"""{data.name} さん、CropWorksに招待されました。

以下のリンクをクリックしてパスワードを設定し、アカウントを有効化してください。
リンクの有効期限は24時間です。

{verify_url}

このメールに心当たりがない場合は無視してください。
"""
    send_email(data.email, "【CropWorks】アカウントの有効化", body)

    # 仮登録を返す（まだ本登録前なので pending 状態を示すダミーユーザーを返す）
    dummy = models.User(
        id=0,
        name=data.name,
        email=data.email,
        password_hash="",
        role=data.role,
    )
    dummy.id = -1  # 以下はフロントで使わないので内容は不要
    return schemas.UserOut(id=0, name=data.name, email=data.email, role=data.role)


@router.put("/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, data: schemas.UserUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    """ユーザー情報更新（admin専用）"""
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "ユーザーが見つかりません")
    if data.name:
        user.name = data.name
    if data.email is not None:
        if data.email:
            existing = db.query(models.User).filter(
                models.User.email == data.email,
                models.User.id != user_id
            ).first()
            if existing:
                raise HTTPException(400, "このメールアドレスはすでに使われています")
        user.email = data.email
    if data.role:
        user.role = data.role
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    """ユーザー削除（admin専用）"""
    if user_id == current_user.id:
        raise HTTPException(400, "自分自身は削除できません")
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "ユーザーが見つかりません")
    db.delete(user)
    db.commit()
    return {"ok": True}
