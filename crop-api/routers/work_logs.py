from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import os, uuid, shutil
from PIL import Image
from database import get_db
import models, schemas
from auth import get_current_user
from config import settings

router = APIRouter(prefix="/api/v1/work-logs", tags=["work_logs"])

# JST = UTC+9
JST = timezone(timedelta(hours=9))


def now_jst() -> datetime:
    """JSTの現在時刻を返す（タイムゾーン情報なしのnaive datetime）"""
    return datetime.now(JST).replace(tzinfo=None)


def save_photo(file: UploadFile, log_id: int) -> str:
    os.makedirs(settings.PHOTO_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "img.jpg")[1].lower() or ".jpg"
    filename = f"{log_id}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.PHOTO_DIR, filename)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    # リサイズ・EXIF除去
    try:
        img = Image.open(path)
        img.thumbnail((1920, 1920), Image.LANCZOS)
        img.save(path, quality=85, optimize=True)
    except Exception:
        pass
    return f"/photos/{filename}"

@router.get("", response_model=List[schemas.WorkLogOut])
def list_logs(
    item_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    q = db.query(models.WorkLog).options(
        joinedload(models.WorkLog.work_type),
        joinedload(models.WorkLog.user),
        joinedload(models.WorkLog.agro_inputs),
        joinedload(models.WorkLog.photos),
    )
    if item_id: q = q.filter(models.WorkLog.item_id == item_id)
    return q.order_by(models.WorkLog.worked_at.desc()).offset(offset).limit(limit).all()

@router.get("/{log_id}", response_model=schemas.WorkLogOut)
def get_log(log_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    log = db.query(models.WorkLog).options(
        joinedload(models.WorkLog.work_type),
        joinedload(models.WorkLog.user),
        joinedload(models.WorkLog.agro_inputs),
        joinedload(models.WorkLog.photos),
    ).get(log_id)
    if not log: raise HTTPException(404, "Log not found")
    return log

@router.post("", response_model=schemas.WorkLogOut)
def create_log(
    data: schemas.WorkLogCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    worked_at = data.worked_at or now_jst()
    log = models.WorkLog(
        item_id=data.item_id,
        work_type_id=data.work_type_id,
        user_id=current_user.id,
        worked_at=worked_at,
        memo=data.memo,
    )
    db.add(log); db.flush()
    for ai in data.agro_inputs:
        db.add(models.AgroInput(log_id=log.id, **ai.model_dump()))
    db.commit()
    return db.query(models.WorkLog).options(
        joinedload(models.WorkLog.work_type),
        joinedload(models.WorkLog.user),
        joinedload(models.WorkLog.agro_inputs),
        joinedload(models.WorkLog.photos),
    ).get(log.id)

@router.put("/{log_id}", response_model=schemas.WorkLogOut)
def update_log(
    log_id: int,
    data: schemas.WorkLogCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    log = db.get(models.WorkLog, log_id)
    if not log: raise HTTPException(404, "Log not found")
    
    # 基本情報を更新
    log.work_type_id = data.work_type_id
    log.worked_at = data.worked_at or log.worked_at
    log.memo = data.memo
    
    # 既存の農薬・肥料を削除して新しいものを追加
    for ai in log.agro_inputs:
        db.delete(ai)
    db.flush()
    
    for ai in data.agro_inputs:
        db.add(models.AgroInput(log_id=log.id, **ai.model_dump()))
    
    db.commit()
    return db.query(models.WorkLog).options(
        joinedload(models.WorkLog.work_type),
        joinedload(models.WorkLog.user),
        joinedload(models.WorkLog.agro_inputs),
        joinedload(models.WorkLog.photos),
    ).get(log.id)

@router.post("/{log_id}/photos", response_model=schemas.PhotoOut)
def upload_photo(
    log_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    log = db.get(models.WorkLog, log_id)
    if not log: raise HTTPException(404, "Log not found")
    path = save_photo(file, log_id)
    photo = models.Photo(log_id=log_id, file_path=path)
    db.add(photo); db.commit(); db.refresh(photo)
    return photo

@router.delete("/{log_id}/photos/{photo_id}")
def delete_photo(log_id: int, photo_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    photo = db.get(models.Photo, photo_id)
    if not photo or photo.log_id != log_id: raise HTTPException(404, "Photo not found")
    # ファイル削除
    try:
        file_path = os.path.join(settings.PHOTO_DIR, os.path.basename(photo.file_path))
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass
    db.delete(photo); db.commit()
    return {"ok": True}

@router.delete("/{log_id}")
def delete_log(log_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    log = db.get(models.WorkLog, log_id)
    if not log: raise HTTPException(404, "Log not found")
    db.delete(log); db.commit()
    return {"ok": True}
