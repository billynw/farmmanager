from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
import models, schemas
from auth import get_current_user

router = APIRouter(prefix="/api/v1", tags=["items"])


def get_field_role(db: Session, user_id: int, field_id: int) -> Optional[models.UserFieldRole]:
    uf = db.query(models.UserField).filter(
        models.UserField.user_id == user_id,
        models.UserField.field_id == field_id
    ).first()
    return uf.role if uf else None


# --- Fields ---
@router.get("/fields", response_model=List[schemas.FieldOut])
def list_fields(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """\u81ea\u5206\u306b\u7d10\u3065\u3044\u305f\u5703\u5834\u306e\u307f\u8fd4\u3059\uff08role\u60c5\u5831\u4ed8\u304d\uff09"""
    result = []
    for uf in current_user.user_fields:
        field = uf.field
        field_out = schemas.FieldOut(
            id=field.id, name=field.name,
            area=float(field.area) if field.area else None,
            location_note=field.location_note,
            my_role=uf.role
        )
        result.append(field_out)
    return result


@router.post("/fields", response_model=schemas.FieldOut)
def create_field(data: schemas.FieldCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """\u5703\u5834\u4f5c\u6210\uff1a\u4f5c\u6210\u8005\u306f\u81ea\u52d5\u7684\u306b owner \u3068\u3057\u3066\u7d10\u3065\u304f"""
    field = models.Field(**data.model_dump())
    db.add(field)
    db.flush()
    db.add(models.UserField(user_id=current_user.id, field_id=field.id, role=models.UserFieldRole.owner))
    db.commit()
    db.refresh(field)
    return schemas.FieldOut(
        id=field.id, name=field.name,
        area=float(field.area) if field.area else None,
        location_note=field.location_note,
        my_role=models.UserFieldRole.owner
    )


@router.put("/fields/{field_id}", response_model=schemas.FieldOut)
def update_field(field_id: int, data: schemas.FieldCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    field = db.get(models.Field, field_id)
    if not field: raise HTTPException(404, "Field not found")
    role = get_field_role(db, current_user.id, field_id)
    if role != models.UserFieldRole.owner:
        raise HTTPException(403, "圃場のoownerのみ編集できます")
    for k, v in data.model_dump().items(): setattr(field, k, v)
    db.commit(); db.refresh(field)
    return schemas.FieldOut(
        id=field.id, name=field.name,
        area=float(field.area) if field.area else None,
        location_note=field.location_note,
        my_role=role
    )


@router.delete("/fields/{field_id}")
def delete_field(field_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    role = get_field_role(db, current_user.id, field_id)
    if role != models.UserFieldRole.owner:
        raise HTTPException(403, "圃場のoownerのみ削除できます")
    field = db.get(models.Field, field_id)
    if not field: raise HTTPException(404, "Field not found")
    if field.items:
        raise HTTPException(400, "この圃場には作物が登録されているため削除できません")
    db.delete(field)
    db.commit()
    return {"ok": True}


# --- ユーザーと圃場の紐づけ管理 (owner only) ---
@router.post("/fields/{field_id}/users/{user_id}")
def assign_user_to_field(
    field_id: int, user_id: int,
    field_role: models.UserFieldRole = models.UserFieldRole.member,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if get_field_role(db, current_user.id, field_id) != models.UserFieldRole.owner:
        raise HTTPException(403, "圃場のoownerのみ操作できます")
    field = db.get(models.Field, field_id)
    if not field: raise HTTPException(404, "Field not found")
    user = db.get(models.User, user_id)
    if not user: raise HTTPException(404, "User not found")
    existing = db.query(models.UserField).filter(
        models.UserField.user_id == user_id,
        models.UserField.field_id == field_id
    ).first()
    if existing:
        existing.role = field_role
    else:
        db.add(models.UserField(user_id=user_id, field_id=field_id, role=field_role))
    db.commit()
    return {"ok": True}


@router.delete("/fields/{field_id}/users/{user_id}")
def remove_user_from_field(
    field_id: int, user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if get_field_role(db, current_user.id, field_id) != models.UserFieldRole.owner:
        raise HTTPException(403, "圃場のoownerのみ操作できます")
    uf = db.query(models.UserField).filter(
        models.UserField.user_id == user_id,
        models.UserField.field_id == field_id
    ).first()
    if uf:
        db.delete(uf)
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
    accessible_field_ids = [uf.field_id for uf in current_user.user_fields]
    q = db.query(models.Item).options(joinedload(models.Item.field))
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
        ).options(joinedload(models.WorkLog.work_type)).order_by(models.WorkLog.worked_at.desc()).first()
        item.latest_work_log = latest_log
    return items


@router.get("/items/{item_id}", response_model=schemas.ItemOut)
def get_item(item_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    item = db.query(models.Item).options(joinedload(models.Item.field)).get(item_id)
    if not item: raise HTTPException(404, "Item not found")
    if item.field_id is not None:
        accessible_field_ids = [uf.field_id for uf in current_user.user_fields]
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
