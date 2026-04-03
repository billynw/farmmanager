import secrets
from datetime import datetime, timedelta, timezone
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

# JST = UTC+9
JST = timezone(timedelta(hours=9))


def now_jst() -> datetime:
    """JSTの現在時刻を返す（タイムゾーン情報なしのnaive datetime）"""
    return datetime.now(JST).replace(tzinfo=None)


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


def get_my_field_role(field_id: int, user_id: int, db: Session):
    uf = db.query(models.UserField).filter(
        models.UserField.user_id == user_id,
        models.UserField.field_id == field_id
    ).first()
    return uf.role if uf else None


def require_owner_or_manager(field_id: int, current_user: models.User, db: Session):
    role = get_my_field_role(field_id, current_user.id, db)
    if role not in (models.UserFieldRole.owner, models.UserFieldRole.manager):
        raise HTTPException(403, "圃場のownerまたはmanagerのみ操作できます")


@router.get("/lookup")
def lookup_user(
    email: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        return {"found": False}
    user_fields = db.query(models.UserField).filter(models.UserField.user_id == user.id).all()
    return {
        "found": True,
        "name": user.name,
        "fields": [{"field_id": uf.field_id, "field_role": uf.role} for uf in user_fields],
    }


@router.get("", response_model=List[schemas.UserOut])
def list_users(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    require_owner_or_manager(field_id, current_user, db)
    user_fields = db.query(models.UserField).filter(models.UserField.field_id == field_id).all()
    result = []
    for uf in user_fields:
        result.append(schemas.UserOut(
            id=uf.user.id,
            name=uf.user.name,
            email=uf.user.email,
            is_owner_of_any=uf.user.is_owner_of_any,
            field_role=uf.role
        ))
    return result


@router.post("", response_model=schemas.UserOut)
def invite_user(
    data: schemas.UserInvite,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if not data.fields:
        raise HTTPException(400, "圃場を少なくとも1つ選択してください")

    for fi in data.fields:
        require_owner_or_manager(fi.field_id, current_user, db)

    existing_user = db.query(models.User).filter(models.User.email == data.email).first()
    if existing_user:
        for fi in data.fields:
            my_role = get_my_field_role(fi.field_id, current_user.id, db)
            uf = db.query(models.UserField).filter(
                models.UserField.user_id == existing_user.id,
                models.UserField.field_id == fi.field_id
            ).first()
            if uf:
                # managerはownerのロールを変更不可
                if my_role == models.UserFieldRole.manager and uf.role == models.UserFieldRole.owner:
                    raise HTTPException(403, "managerはownerの権限を変更できません")
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
        models.EmailVerification.expires_at > now_jst()
    ).first():
        raise HTTPException(400, "このメールアドレスはメール確認待ちです")

    # 既存の未使用招待を全て削除してから新規発行
    db.query(models.InviteVerification).filter(
        models.InviteVerification.email == data.email,
        models.InviteVerification.used == False
    ).delete()
    db.flush()

    # 圃場ごとにトークンを発行し、最初のトークンをメールに記載する
    expires_at = now_jst() + timedelta(hours=24)
    first_token = None
    field_names = []
    for fi in data.fields:
        field = db.get(models.Field, fi.field_id)
        if not field:
            continue
        token = secrets.token_hex(32)
        if first_token is None:
            first_token = token
        db.add(models.InviteVerification(
            name=data.name, email=data.email,
            field_id=fi.field_id, field_role=fi.field_role,
            token=token, expires_at=expires_at
        ))
        field_names.append(field.name)

    db.commit()

    if not first_token:
        raise HTTPException(400, "有効な圃場がありませんでした")

    # メールには1つのリンクだけ記載。accept-invite側で同メール宛の全招待を一括処理する。
    invite_url = f"{settings.FRONTEND_URL}/set-password?token={first_token}&type=invite"
    field_list = "、".join(field_names)
    body = f"""{data.name} さん、CropWorksの圃場管理へ招待されました。

招待された圃場：{field_list}

以下のリンクからパスワードを設定してください。
リンクの有効期限は24時間です。

{invite_url}

このメールに心当たりがない場合は無視してください。
"""
    send_email(data.email, "【CropWorks】圃場への招待", body)
    return schemas.UserOut(id=0, name=data.name, email=data.email, is_owner_of_any=False)


@router.patch("/{user_id}/field-role")
def update_field_role(
    user_id: int,
    field_id: int,
    field_role: models.UserFieldRole,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    圃場でのユーザーのロールを変更。
    - ownerへの変更は不可（招待時にのみ付与される）
    - managerはownerのロール変更不可
    - 自分自身のロール変更不可
    """
    my_role = get_my_field_role(field_id, current_user.id, db)
    if my_role not in (models.UserFieldRole.owner, models.UserFieldRole.manager):
        raise HTTPException(403, "圃場のownerまたはmanagerのみ操作できます")

    if user_id == current_user.id:
        raise HTTPException(403, "自分自身の権限は変更できません")

    # ownerへの変更は常に不可
    if field_role == models.UserFieldRole.owner:
        raise HTTPException(400, "ownerは招待時にのみ設定できます")

    target_uf = db.query(models.UserField).filter(
        models.UserField.user_id == user_id,
        models.UserField.field_id == field_id
    ).first()
    if not target_uf:
        raise HTTPException(404, "ユーザーがこの圃場に属していません")

    # managerはownerのロール変更不可
    if my_role == models.UserFieldRole.manager and target_uf.role == models.UserFieldRole.owner:
        raise HTTPException(403, "managerはownerの権限を変更できません")

    target_uf.role = field_role
    db.commit()
    return {"ok": True, "field_role": field_role}


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
    my_role = get_my_field_role(field_id, current_user.id, db)
    if my_role not in (models.UserFieldRole.owner, models.UserFieldRole.manager):
        raise HTTPException(403, "圃場のownerまたはmanagerのみ操作できます")

    target_uf = db.query(models.UserField).filter(
        models.UserField.user_id == user_id,
        models.UserField.field_id == field_id
    ).first()
    if not target_uf:
        return {"ok": True}

    if my_role == models.UserFieldRole.manager and target_uf.role == models.UserFieldRole.owner:
        raise HTTPException(403, "managerはownerを圃場から削除できません")

    db.delete(target_uf)
    db.commit()
    return {"ok": True}
