from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import models, schemas
from auth import get_current_user

router = APIRouter(prefix="/api/v1/harvests", tags=["harvests"])

@router.get("", response_model=List[schemas.HarvestOut])
def list_harvests(
    item_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    q = db.query(models.Harvest)
    if item_id: q = q.filter(models.Harvest.item_id == item_id)
    return q.order_by(models.Harvest.harvested_at.desc()).all()

@router.post("", response_model=schemas.HarvestOut)
def create_harvest(data: schemas.HarvestCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    h = models.Harvest(**data.model_dump())
    db.add(h); db.commit(); db.refresh(h)
    return h

@router.put("/{harvest_id}", response_model=schemas.HarvestOut)
def update_harvest(harvest_id: int, data: schemas.HarvestCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    h = db.get(models.Harvest, harvest_id)
    if not h: raise HTTPException(404, "Harvest not found")
    for k, v in data.model_dump().items(): setattr(h, k, v)
    db.commit(); db.refresh(h)
    return h

@router.delete("/{harvest_id}")
def delete_harvest(harvest_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    h = db.get(models.Harvest, harvest_id)
    if not h: raise HTTPException(404, "Harvest not found")
    db.delete(h); db.commit()
    return {"ok": True}
