from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import models, schemas
from auth import get_current_user, hash_password

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def require_admin(current_user: models.User = Depends(get_current_user)):
    if current_user.role != models.UserRole.admin:
        raise HTTPException(403, "管理者のみ操作できます")
    return current_user


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
def create_user(data: schemas.UserCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    """ユーザー新規作成（admin専用）"""
    if db.query(models.User).filter(models.User.name == data.name).first():
        raise HTTPException(400, "このユーザー名はすでに使われています")
    if data.email and db.query(models.User).filter(models.User.email == data.email).first():
        raise HTTPException(400, "このメールアドレスはすでに使われています")
    user = models.User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, data: schemas.UserUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    """ユーザー情報更新（admin専用）"""
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "ユーザーが見つかりません")
    if data.name:
        existing = db.query(models.User).filter(models.User.name == data.name, models.User.id != user_id).first()
        if existing:
            raise HTTPException(400, "このユーザー名はすでに使われています")
        user.name = data.name
    if data.email is not None:
        if data.email:
            existing = db.query(models.User).filter(models.User.email == data.email, models.User.id != user_id).first()
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
