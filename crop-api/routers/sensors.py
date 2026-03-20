import os
import uuid
import shutil
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from config import settings
import models
import schemas
import random

router = APIRouter(prefix="/api/v1", tags=["sensors"])


def get_sensor_photo_dir(sensor_id: int) -> str:
    """センサーIDごとのディレクトリパスを返す"""
    path = os.path.join(settings.SENSOR_PHOTO_DIR, str(sensor_id))
    os.makedirs(path, exist_ok=True)
    return path


def verify_sensor_token(sensor: models.Sensor, token: str):
    """センサーのtokenを検証する。不一致なら403を返す"""
    if sensor.token != token:
        raise HTTPException(status_code=403, detail="Invalid sensor token")


# ----------------------------------------------------------------
# センサー管理（CRUD）
# ----------------------------------------------------------------

@router.get("/sensors", response_model=List[schemas.SensorOut])
def list_sensors(
    field_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Sensor)
    if field_id:
        q = q.filter(models.Sensor.field_id == field_id)
    return q.all()


@router.post("/sensors", response_model=schemas.SensorOut)
def create_sensor(
    body: schemas.SensorCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sensor = models.Sensor(**body.model_dump())
    db.add(sensor)
    db.commit()
    db.refresh(sensor)
    return sensor


@router.put("/sensors/{sensor_id}", response_model=schemas.SensorOut)
def update_sensor(
    sensor_id: int,
    body: schemas.SensorUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sensor = db.query(models.Sensor).filter(models.Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(sensor, key, value)
    db.commit()
    db.refresh(sensor)
    return sensor


@router.delete("/sensors/{sensor_id}")
def delete_sensor(
    sensor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sensor = db.query(models.Sensor).filter(models.Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")

    # DBレコード削除（cascade により readings・photos レコードも削除）
    db.delete(sensor)
    db.commit()

    # 写真ディレクトリをまとめて削除
    photo_dir = os.path.join(settings.SENSOR_PHOTO_DIR, str(sensor_id))
    if os.path.exists(photo_dir):
        shutil.rmtree(photo_dir)

    return {"ok": True}


# ----------------------------------------------------------------
# 計測値の記録（センサーデバイスからのPOST・tokenで認証）
# ----------------------------------------------------------------

@router.post("/sensors/{sensor_id}/readings", response_model=schemas.SensorReadingOut)
def post_reading(
    sensor_id: int,
    body: schemas.SensorReadingCreate,
    db: Session = Depends(get_db),
):
    """センサーデバイスから計測値を受け取る（tokenで認証）"""
    sensor = db.query(models.Sensor).filter(models.Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    verify_sensor_token(sensor, body.token)
    reading = models.SensorReading(
        sensor_id=sensor_id,
        metric=body.metric,
        value=body.value,
        unit=body.unit,
        recorded_at=body.recorded_at or datetime.utcnow(),
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading


@router.get("/sensors/{sensor_id}/readings", response_model=List[schemas.SensorReadingOut])
def get_readings(
    sensor_id: int,
    metric: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.SensorReading).filter(models.SensorReading.sensor_id == sensor_id)
    if metric:
        q = q.filter(models.SensorReading.metric == metric)
    return q.order_by(models.SensorReading.recorded_at.desc()).limit(limit).all()


# ----------------------------------------------------------------
# 写真のアップロード・取得（センサーカメラ対応・tokenで認証）
# ----------------------------------------------------------------

@router.post("/sensors/{sensor_id}/photos", response_model=schemas.SensorPhotoOut)
async def upload_sensor_photo(
    sensor_id: int,
    token: str = Query(..., description="センサートークン"),
    file: UploadFile = File(...),
    taken_at: Optional[datetime] = None,
    db: Session = Depends(get_db),
):
    """センサーカメラから写真を受け取る（tokenで認証）"""
    sensor = db.query(models.Sensor).filter(models.Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    verify_sensor_token(sensor, token)

    photo_dir = get_sensor_photo_dir(sensor_id)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(photo_dir, filename)

    with open(file_path, "wb") as f:
        f.write(await file.read())

    url_path = f"/sensor-photos/{sensor_id}/{filename}"

    photo = models.SensorPhoto(
        sensor_id=sensor_id,
        file_path=url_path,
        taken_at=taken_at or datetime.utcnow(),
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return photo


@router.get("/sensors/{sensor_id}/photos", response_model=List[schemas.SensorPhotoOut])
def get_sensor_photos(
    sensor_id: int,
    limit: int = 24,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.SensorPhoto)
        .filter(models.SensorPhoto.sensor_id == sensor_id)
        .order_by(models.SensorPhoto.taken_at.desc())
        .limit(limit)
        .all()
    )


# ----------------------------------------------------------------
# 圃場ごとの最新センサー値サマリー（フロントのホーム画面向け）
# 圃場内の有効センサーをID昇順で並べ、最小ID（最も古い）のセンサーの値のみ返す
# ----------------------------------------------------------------

@router.get("/fields/{field_id}/sensor-summary", response_model=schemas.FieldSensorSummary)
def field_sensor_summary(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    field = db.query(models.Field).filter(models.Field.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    # 最小IDの有効センサーだけを取得
    primary_sensor = (
        db.query(models.Sensor)
        .filter(models.Sensor.field_id == field_id, models.Sensor.active == True)
        .order_by(models.Sensor.id.asc())
        .first()
    )

    if not primary_sensor:
        return schemas.FieldSensorSummary(
            field_id=field.id,
            field_name=field.name,
            sensors=[],
        )

    latest_per_metric = (
        db.query(models.SensorReading)
        .filter(models.SensorReading.sensor_id == primary_sensor.id)
        .order_by(
            models.SensorReading.metric,
            models.SensorReading.recorded_at.desc(),
        )
        .all()
    )
    seen = set()
    latest = []
    for r in latest_per_metric:
        if r.metric not in seen:
            seen.add(r.metric)
            latest.append(schemas.SensorLatestReading(
                metric=r.metric,
                value=r.value,
                unit=r.unit,
                recorded_at=r.recorded_at,
            ))

    return schemas.FieldSensorSummary(
        field_id=field.id,
        field_name=field.name,
        sensors=[schemas.SensorWithLatest(
            id=primary_sensor.id,
            name=primary_sensor.name,
            active=primary_sensor.active,
            latest=latest,
        )],
    )


# ----------------------------------------------------------------
# ダミーデータ生成（センサー未接続時の開発用・認証不要）
# ----------------------------------------------------------------

@router.post("/dev/seed-sensor-dummy")
def seed_sensor_dummy(
    db: Session = Depends(get_db),
):
    """全圃場にダミーセンサーと計測値を生成する（開発用・認証不要）"""
    fields = db.query(models.Field).all()
    if not fields:
        raise HTTPException(status_code=400, detail="No fields found. Create fields first.")

    created_sensors = 0
    created_readings = 0
    now = datetime.utcnow()

    for field in fields:
        existing = db.query(models.Sensor).filter(models.Sensor.field_id == field.id).first()
        if existing:
            continue

        dummy_token = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=15))
        sensor = models.Sensor(field_id=field.id, name=f"{field.name}センサー", active=True, token=dummy_token)
        db.add(sensor)
        db.flush()
        created_sensors += 1

        metrics = [
            ("water_level",   "cm",  15.0, 3.0),
            ("water_temp",    "\u00b0C",  22.0, 2.0),
            ("air_temp",      "\u00b0C",  20.0, 4.0),
            ("soil_moisture", "%",   65.0, 10.0),
        ]
        for hours_ago in range(24, -1, -1):
            recorded_at = now - timedelta(hours=hours_ago)
            for metric, unit, base, spread in metrics:
                value = round(base + random.uniform(-spread, spread), 1)
                db.add(models.SensorReading(
                    sensor_id=sensor.id,
                    metric=metric,
                    value=value,
                    unit=unit,
                    recorded_at=recorded_at,
                ))
                created_readings += 1

    db.commit()
    return {
        "ok": True,
        "sensors_created": created_sensors,
        "readings_created": created_readings,
    }
