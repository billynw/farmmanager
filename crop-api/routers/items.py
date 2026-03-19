from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
import models, schemas
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["items"])

# --- Fields ---
@router.get("/fields", response_model=List[schemas.FieldOut])
def list_fields(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(models.Field).all()

@router.post("/fields", response_model=schemas.FieldOut)
def create_field(data: schemas.FieldCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    field = models.Field(**data.model_dump())
    db.add(field); db.commit(); db.refresh(field)
    return field

@router.put("/fields/{field_id}", response_model=schemas.FieldOut)
def update_field(field_id: int, data: schemas.FieldCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    field = db.get(models.Field, field_id)
    if not field: raise HTTPException(404, "Field not found")
    for k, v in data.model_dump().items(): setattr(field, k, v)
    db.commit(); db.refresh(field)
    return field

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
    _=Depends(get_current_user)
):
    q = db.query(models.Item).options(joinedload(models.Item.field))
    if field_id: q = q.filter(models.Item.field_id == field_id)
    if status: q = q.filter(models.Item.status == status)
    return q.order_by(models.Item.name).all()

@router.get("/items/{item_id}", response_model=schemas.ItemOut)
def get_item(item_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.query(models.Item).options(joinedload(models.Item.field)).get(item_id)
    if not item: raise HTTPException(404, "Item not found")
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
