from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models
import schemas
import random

router = APIRouter(prefix="/api/v1", tags=["sensors"])


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


@router.delete("/sensors/{sensor_id}")
def delete_sensor(
    sensor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sensor = db.query(models.Sensor).filter(models.Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    db.delete(sensor)
    db.commit()
    return {"ok": True}


# ----------------------------------------------------------------
# 計測値の記録（センサーデバイスからのPOST想定・認証不要）
# ----------------------------------------------------------------

@router.post("/sensors/{sensor_id}/readings", response_model=schemas.SensorReadingOut)
def post_reading(
    sensor_id: int,
    body: schemas.SensorReadingCreate,
    db: Session = Depends(get_db),
):
    """センサーデバイスから計測値を受け取る（認証不要）"""
    sensor = db.query(models.Sensor).filter(models.Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
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
# 圃場ごとの最新センサー値サマリー（フロントのホーム画面向け）
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

    sensors_out = []
    for sensor in field.sensors:
        if not sensor.active:
            continue
        # metricごとの最新レコードを取得
        latest_per_metric = (
            db.query(models.SensorReading)
            .filter(models.SensorReading.sensor_id == sensor.id)
            .order_by(
                models.SensorReading.metric,
                models.SensorReading.recorded_at.desc(),
            )
            .all()
        )
        # 各metricの最新1件だけ残す
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
        sensors_out.append(schemas.SensorWithLatest(
            id=sensor.id,
            name=sensor.name,
            active=sensor.active,
            latest=latest,
        ))

    return schemas.FieldSensorSummary(
        field_id=field.id,
        field_name=field.name,
        sensors=sensors_out,
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
        # すでにセンサーがある圃場はスキップ
        existing = db.query(models.Sensor).filter(models.Sensor.field_id == field.id).first()
        if existing:
            continue

        sensor = models.Sensor(field_id=field.id, name=f"{field.name}センサー", active=True)
        db.add(sensor)
        db.flush()  # sensor.id を確定
        created_sensors += 1

        # 過去24時間分のダミー計測値を1時間ごとに生成
        metrics = [
            ("water_level",   "cm",  15.0, 3.0),
            ("water_temp",    "°C",  22.0, 2.0),
            ("air_temp",      "°C",  20.0, 4.0),
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
