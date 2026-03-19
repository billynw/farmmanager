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


def get_my_field_role(field_id: int, user_id: int, db: Session) -> models.UserFieldRole | None:
    uf = db.query(models.UserField).filter(
        models.UserField.user_id == user_id,
        models.UserField.field_id == field_id
    ).first()
    return uf.role if uf else None


def require_owner_or_manager(field_id: int, current_user: models.User, db: Session):
    role = get_my_field_role(field_id, current_user.id, db)
    if role not in (models.UserFieldRole.owner, models.UserFieldRole.manager):
        raise HTTPException(403, "圃場のoownerまたはmanagerのみ操作できます")


@router.get("", response_model=List[schemas.UserOut])
def list_users(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """指定圃場のユーザー一覧（owner or manager のみ）"""
    require_owner_or_manager(field_id, current_user, db)
    user_fields = db.query(models.UserField).filter(models.UserField.field_id == field_id).all()
    return [uf.user for uf in user_fields]


@router.post("", response_model=schemas.UserOut)
def invite_user(
    data: schemas.UserInvite,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """複数圃場へユーザーを一括招待（owner or manager のみ）"""
    if not data.fields:
        raise HTTPException(400, "圃場を少なくとも1つ選択してください")

    for fi in data.fields:
        require_owner_or_manager(fi.field_id, current_user, db)

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

    if db.query(models.EmailVerification).filter(
        models.EmailVerification.email == data.email,
        models.EmailVerification.used == False,
        models.EmailVerification.expires_at > datetime.utcnow()
    ).first():
        raise HTTPException(400, "このメールアドレスはメール確認待ちです")

    tokens = []
    for fi in data.fields:
        field = db.get(models.Field, fi.field_id)
        if not field: continue
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

    field_lines = "\n".join(
        [f"  ・{name}\n   {settings.FRONTEND_URL}/set-password?token={tok}&type=invite"
         for name, tok in tokens]
    )
    body = f"""{data.name} さん、CropWorksの圃場管理へ招待されました。

以下のリンクから圃場の設定を行ってください。
リンクの有効期限は24時間です。

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
def remove_user_from_field(
    user_id: int,
    field_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    圃場からユーザーを削除。権限ルール：
    - owner: 全ユーザー削除可
    - manager: managerとmemberのみ削除可（ownerは削除不可）
    """
    my_role = get_my_field_role(field_id, current_user.id, db)
    if my_role not in (models.UserFieldRole.owner, models.UserFieldRole.manager):
        raise HTTPException(403, "圃場のoownerまたはmanagerのみ操作できます")

    # 削除対象ユーザーのロールを取得
    target_uf = db.query(models.UserField).filter(
        models.UserField.user_id == user_id,
        models.UserField.field_id == field_id
    ).first()

    if not target_uf:
        return {"ok": True}

    # manager は owner を削除できない
    if my_role == models.UserFieldRole.manager and target_uf.role == models.UserFieldRole.owner:
        raise HTTPException(403, "managerはoownerを圃場から削除できません")

    db.delete(target_uf)
    db.commit()
    return {"ok": True}
