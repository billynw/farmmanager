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


def require_field_owner(field_id: int, current_user: models.User, db: Session):
    uf = db.query(models.UserField).filter(
        models.UserField.user_id == current_user.id,
        models.UserField.field_id == field_id
    ).first()
    if not uf or uf.role != models.UserFieldRole.owner:
        raise HTTPException(403, "圃場のownerのみ操作できます")


@router.get("", response_model=List[schemas.UserOut])
def list_users(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """指定圃場のユーザー一覧（この圃場の owner のみ利用可）"""
    require_field_owner(field_id, current_user, db)
    user_fields = db.query(models.UserField).filter(models.UserField.field_id == field_id).all()
    return [uf.user for uf in user_fields]


@router.post("", response_model=schemas.UserOut)
def invite_user(
    data: schemas.UserInvite,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """複数圃場へユーザーを一括招待。登録済みなら即座に紐づけ、未登録ならメール送信"""
    if not data.fields:
        raise HTTPException(400, "圃場を少なくとも1つ選択してください")

    # 全圃場のoowner権限を確認
    for fi in data.fields:
        require_field_owner(fi.field_id, current_user, db)

    # 登録済みユーザーの場合 → 全圃場に即座に紐づけ
    existing_user = db.query(models.User).filter(models.User.email == data.email).first()
    if existing_user:
        for fi in data.fields:
            uf = db.query(models.UserField).filter(
                models.UserField.user_id == existing_user.id,
                models.UserField.field_id == fi.field_id
            ).first()
            if uf:
                uf.role = fi.field_role
            else:
                db.add(models.UserField(
                    user_id=existing_user.id,
                    field_id=fi.field_id,
                    role=fi.field_role
                ))
        db.commit()
        return existing_user

    # 未登録の場合 → email_verifications をチェック
    if db.query(models.EmailVerification).filter(
        models.EmailVerification.email == data.email,
        models.EmailVerification.used == False,
        models.EmailVerification.expires_at > datetime.utcnow()
    ).first():
        raise HTTPException(400, "このメールアドレスはメール確認待ちです")

    # 圃場ごとに招待トークンを作成しメール送信（1通のメールにまとめる）
    # 圃場ごとに別々のトークンを作成（accept-inviteで圃場ごとの結びつき処理のため）
    field_names = []
    tokens = []
    for fi in data.fields:
        field = db.get(models.Field, fi.field_id)
        if not field: continue
        field_names.append(field.name)

        # 既存招待があれば上書き
        existing_invite = db.query(models.InviteVerification).filter(
            models.InviteVerification.email == data.email,
            models.InviteVerification.field_id == fi.field_id
        ).first()
        if existing_invite:
            db.delete(existing_invite)
            db.flush()

        token = secrets.token_hex(32)
        expires_at = datetime.utcnow() + timedelta(hours=24)
        db.add(models.InviteVerification(
            name=data.name, email=data.email,
            field_id=fi.field_id, field_role=fi.field_role,
            token=token, expires_at=expires_at
        ))
        tokens.append((field.name, token))

    db.commit()

    # 圃場名を並べたメールを送信
    # 複数圃場がある場合は圃場ごとにリンクを記載
    field_lines = "\n".join(
        [f"  ・{name}\n   {settings.FRONTEND_URL}/set-password?token={tok}&type=invite"
         for name, tok in tokens]
    )
    body = f"""{data.name} さん、CropWorksの圃場管理へ招待されました。

以下のリンクから圃場の設定を行ってください。
リンクの有効期限は各24時間です。

{field_lines}

このメールに心当たりがない場合は無視してください。
"""
    send_email(data.email, "【CropWorks】圃場への招待", body)
    return schemas.UserOut(id=0, name=data.name, email=data.email, is_owner_of_any=False)


@router.put("/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    data: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """ユーザー情報更新（自分のみ）"""
    if user_id != current_user.id:
        raise HTTPException(403, "自分の情報のみ変更できます")
    user = db.get(models.User, user_id)
    if data.name: user.name = data.name
    if data.email is not None:
        if data.email:
            existing = db.query(models.User).filter(
                models.User.email == data.email, models.User.id != user_id
            ).first()
            if existing: raise HTTPException(400, "このメールアドレスはすでに使われています")
        user.email = data.email
    db.commit(); db.refresh(user)
    return user


@router.delete("/{user_id}")
def remove_user_from_field_by_owner(
    user_id: int,
    field_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """圃場からユーザーを削除（owner専用）"""
    require_field_owner(field_id, current_user, db)
    uf = db.query(models.UserField).filter(
        models.UserField.user_id == user_id,
        models.UserField.field_id == field_id
    ).first()
    if uf:
        db.delete(uf)
        db.commit()
    return {"ok": True}
