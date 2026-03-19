from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
import models, schemas
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["items"])

# --- Fields ---
@router.get("/fields", response_model=List[schemas.FieldOut])
def list_fields(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role == models.UserRole.admin:
        return db.query(models.Field).all()
    return current_user.fields

@router.post("/fields", response_model=schemas.FieldOut)
def create_field(data: schemas.FieldCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    field = models.Field(**data.model_dump())
    db.add(field)
    db.flush()
    field.users.append(current_user)
    db.commit(); db.refresh(field)
    return field

@router.put("/fields/{field_id}", response_model=schemas.FieldOut)
def update_field(field_id: int, data: schemas.FieldCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    field = db.get(models.Field, field_id)
    if not field: raise HTTPException(404, "Field not found")
    if current_user.role != models.UserRole.admin and field not in current_user.fields:
        raise HTTPException(403, "Permission denied")
    for k, v in data.model_dump().items(): setattr(field, k, v)
    db.commit(); db.refresh(field)
    return field

@router.delete("/fields/{field_id}")
def delete_field(field_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != models.UserRole.admin:
        raise HTTPException(403, "Admin only")
    field = db.get(models.Field, field_id)
    if not field: raise HTTPException(404, "Field not found")
    # 圃場に紐づいた作物がある場合は削除不可
    if field.items:
        raise HTTPException(400, "この圃場には作物が登録されているため削除できません")
    db.delete(field)
    db.commit()
    return {"ok": True}

# --- ユーザーと圃場の紐づけ管理 (admin only) ---
@router.post("/fields/{field_id}/users/{user_id}")
def assign_user_to_field(
    field_id: int, user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != models.UserRole.admin:
        raise HTTPException(403, "Admin only")
    field = db.get(models.Field, field_id)
    if not field: raise HTTPException(404, "Field not found")
    user = db.get(models.User, user_id)
    if not user: raise HTTPException(404, "User not found")
    if user not in field.users:
        field.users.append(user)
        db.commit()
    return {"ok": True}

@router.delete("/fields/{field_id}/users/{user_id}")
def remove_user_from_field(
    field_id: int, user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != models.UserRole.admin:
        raise HTTPException(403, "Admin only")
    field = db.get(models.Field, field_id)
    if not field: raise HTTPException(404, "Field not found")
    user = db.get(models.User, user_id)
    if not user: raise HTTPException(404, "User not found")
    if user in field.users:
        field.users.remove(user)
        db.commit()
    return {"ok": True}

# --- WorkTypes ---
@router.get("/work-types", response_model=List[schemas.WorkTypeOut])
def list_work_types(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(models.WorkType).all()

@router.post("/work-types", response_model=schemas.WorkTypeOut)
def create_work_type(data: schemas.WorkTypeCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    wt = models.WorkType(**data.model_dump())
    db.add(wt); db.commit(); db.refresh(wt)
    return wt

# --- Items ---
@router.get("/items", response_model=List[schemas.ItemOut])
def list_items(
    field_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    q = db.query(models.Item).options(joinedload(models.Item.field))
    if current_user.role != models.UserRole.admin:
        accessible_field_ids = [f.id for f in current_user.fields]
        q = q.filter(
            (models.Item.field_id == None) |
            (models.Item.field_id.in_(accessible_field_ids))
        )
    if field_id: q = q.filter(models.Item.field_id == field_id)
    if status: q = q.filter(models.Item.status == status)
    items = q.order_by(models.Item.name).all()
    for item in items:
        latest_log = db.query(models.WorkLog).filter(
            models.WorkLog.item_id == item.id
        ).options(
            joinedload(models.WorkLog.work_type)
        ).order_by(models.WorkLog.worked_at.desc()).first()
        item.latest_work_log = latest_log
    return items

@router.get("/items/{item_id}", response_model=schemas.ItemOut)
def get_item(item_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    item = db.query(models.Item).options(joinedload(models.Item.field)).get(item_id)
    if not item: raise HTTPException(404, "Item not found")
    if current_user.role != models.UserRole.admin and item.field_id is not None:
        accessible_field_ids = [f.id for f in current_user.fields]
        if item.field_id not in accessible_field_ids:
            raise HTTPException(403, "Permission denied")
    return item

@router.post("/items", response_model=schemas.ItemOut)
def create_item(data: schemas.ItemCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = models.Item(**data.model_dump())
    db.add(item); db.commit(); db.refresh(item)
    return item

@router.put("/items/{item_id}", response_model=schemas.ItemOut)
def update_item(item_id: int, data: schemas.ItemCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.get(models.Item, item_id)
    if not item: raise HTTPException(404, "Item not found")
    for k, v in data.model_dump().items(): setattr(item, k, v)
    db.commit(); db.refresh(item)
    return item

@router.delete("/items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.get(models.Item, item_id)
    if not item: raise HTTPException(404, "Item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}
