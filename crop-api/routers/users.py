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
        raise HTTPException(403, "圃場のoownerのみ操作できます")


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
    """圃場へユーザーを招待。登録済みなら即座に紐づけ、未登録ならメール送信"""
    require_field_owner(data.field_id, current_user, db)

    # 圃場の存在確認
    field = db.get(models.Field, data.field_id)
    if not field: raise HTTPException(404, "圃場が見つかりません")

    # 登録済みユーザーの場合→即座に紐づけ
    existing_user = db.query(models.User).filter(models.User.email == data.email).first()
    if existing_user:
        uf = db.query(models.UserField).filter(
            models.UserField.user_id == existing_user.id,
            models.UserField.field_id == data.field_id
        ).first()
        if uf:
            uf.role = data.field_role
        else:
            db.add(models.UserField(user_id=existing_user.id, field_id=data.field_id, role=data.field_role))
        db.commit()
        return existing_user

    # 未登録の場合→ users/email_verifications 両方をチェック
    if db.query(models.EmailVerification).filter(
        models.EmailVerification.email == data.email,
        models.EmailVerification.used == False,
        models.EmailVerification.expires_at > datetime.utcnow()
    ).first():
        raise HTTPException(400, "このメールアドレスはメール確認待ちです")

    # 既存の招待があれば上書き
    existing_invite = db.query(models.InviteVerification).filter(
        models.InviteVerification.email == data.email,
        models.InviteVerification.field_id == data.field_id
    ).first()
    if existing_invite:
        db.delete(existing_invite)
        db.flush()

    token = secrets.token_hex(32)
    expires_at = datetime.utcnow() + timedelta(hours=24)
    db.add(models.InviteVerification(
        name=data.name, email=data.email,
        field_id=data.field_id, field_role=data.field_role,
        token=token, expires_at=expires_at
    ))
    db.commit()

    invite_url = f"{settings.FRONTEND_URL}/set-password?token={token}&type=invite"
    body = f"""{data.name} さん、{field.name} の管理へ招待されました。

以下のリンクをクリックしてパスワードを設定し、CropWorksを始めてください。
リンクの有効期限は24時間です。

{invite_url}
このメールに心当たりがない場合は無視してください。
"""
    send_email(data.email, "【CropWorks】圃場への招待", body)
    return schemas.UserOut(id=0, name=data.name, email=data.email, is_owner_of_any=False)


@router.get("/{user_id}/fields", response_model=List[schemas.FieldOut])
def get_user_fields(
    user_id: int,
    field_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """圃場のユーザー一覧（owner専用）"""
    require_field_owner(field_id, current_user, db)
    user = db.get(models.User, user_id)
    if not user: raise HTTPException(404, "ユーザーが見つかりません")
    result = []
    for uf in user.user_fields:
        f = uf.field
        result.append(schemas.FieldOut(
            id=f.id, name=f.name,
            area=float(f.area) if f.area else None,
            location_note=f.location_note,
            my_role=uf.role
        ))
    return result


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
