import os
import uuid
import shutil
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from database import get_db
from auth import get_current_user
from config import settings
import models
import schemas
import random

router = APIRouter(prefix="/api/v1", tags=["sensors"])

# JST = UTC+9
JST = timezone(timedelta(hours=9))


def now_jst() -> datetime:
    """JSTの現在時刻を返す（タイムゾーン情報なしのnaive datetime）"""
    return datetime.now(JST).replace(tzinfo=None)


def get_sensor_photo_dir(sensor_id: int) -> str:
    path = os.path.join(settings.SENSOR_PHOTO_DIR, str(sensor_id))
    os.makedirs(path, exist_ok=True)
    return path


def verify_sensor_token(sensor: models.Sensor, token: str):
    if sensor.token != token:
        raise HTTPException(status_code=403, detail="Invalid sensor token")


def validate_feature_ids(feature_ids: List[int], db: Session) -> None:
    if not feature_ids:
        return
    existing = (
        db.query(models.SensorFeatureType.id)
        .filter(models.SensorFeatureType.id.in_(feature_ids))
        .all()
    )
    existing_ids = {row.id for row in existing}
    invalid = set(feature_ids) - existing_ids
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"無効な feature ID が含まれています: {sorted(invalid)}",
        )


def get_feature_type_by_key(db: Session) -> dict:
    """sensor_feature_typesをkeyでマッピングした辞書を返す"""
    types = db.query(models.SensorFeatureType).all()
    return {t.key: t for t in types}


# ----------------------------------------------------------------
# センサー機能マスタ取得
# ----------------------------------------------------------------

@router.get("/sensor-feature-types", response_model=List[schemas.SensorFeatureTypeOut])
def list_sensor_feature_types(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.SensorFeatureType).order_by(models.SensorFeatureType.id).all()


# ----------------------------------------------------------------
# センサー管理(CRUD)
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
    
    sensors = q.all()
    
    # センサーのfeaturesに含まれる最小ID順でソート
    def min_feature_id(sensor):
        if sensor.features and len(sensor.features) > 0:
            return min(sensor.features)
        return float('inf')
    
    sensors.sort(key=min_feature_id)
    return sensors


@router.post("/sensors", response_model=schemas.SensorOut)
def create_sensor(
    body: schemas.SensorCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    validate_feature_ids(body.features, db)
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

    data = body.model_dump(exclude_unset=True)
    if "features" in data and data["features"] is not None:
        validate_feature_ids(data["features"], db)

    for key, value in data.items():
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

    db.delete(sensor)
    db.commit()

    photo_dir = os.path.join(settings.SENSOR_PHOTO_DIR, str(sensor_id))
    if os.path.exists(photo_dir):
        shutil.rmtree(photo_dir)

    return {"ok": True}


# ----------------------------------------------------------------
# 計測値の記録
# ----------------------------------------------------------------

@router.post("/sensors/{sensor_id}/readings", response_model=schemas.SensorReadingOut)
def post_reading(
    sensor_id: int,
    body: schemas.SensorReadingCreate,
    db: Session = Depends(get_db),
):
    sensor = db.query(models.Sensor).filter(models.Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    verify_sensor_token(sensor, body.token)
    
    reading = models.SensorReading(
        sensor_id=sensor_id,
        metric=body.metric,
        value=body.value,
        recorded_at=body.recorded_at or now_jst(),
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    
    # レスポンス用にunitを付加
    feature_types = get_feature_type_by_key(db)
    ft = feature_types.get(body.metric)
    unit = ft.unit if ft else None
    
    return schemas.SensorReadingOut(
        id=reading.id,
        sensor_id=reading.sensor_id,
        metric=reading.metric,
        value=reading.value,
        unit=unit,
        recorded_at=reading.recorded_at,
    )


@router.get("/sensors/{sensor_id}/readings", response_model=List[schemas.SensorReadingOut])
def get_readings(
    sensor_id: int,
    metric: Optional[str] = None,
    hours: Optional[int] = None,
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.SensorReading).filter(models.SensorReading.sensor_id == sensor_id)
    if metric:
        q = q.filter(models.SensorReading.metric == metric)
    
    if hours:
        cutoff = now_jst() - timedelta(hours=hours)
        q = q.filter(models.SensorReading.recorded_at >= cutoff)
    
    readings = q.order_by(models.SensorReading.recorded_at.desc()).limit(limit).all()
    
    # sensor_feature_typesからunitを取得
    feature_types = get_feature_type_by_key(db)
    result = []
    for r in readings:
        ft = feature_types.get(r.metric)
        unit = ft.unit if ft else None
        result.append(schemas.SensorReadingOut(
            id=r.id,
            sensor_id=r.sensor_id,
            metric=r.metric,
            value=r.value,
            unit=unit,
            recorded_at=r.recorded_at,
        ))
    return result


# ----------------------------------------------------------------
# 写真のアップロード・取得
# ----------------------------------------------------------------

def _send_gate_photo_email(
    sensor: models.Sensor,
    field: models.Field,
    gate_state: Optional[str],
    taken_at: datetime,
    file_bytes: bytes,
    ext: str,
    recipients: list,
):
    state_label = "開きました" if gate_state == "OPEN" else "閉まりました"
    subject = f"[{field.name}] {sensor.name} がゲートを{state_label}"
    body = (
        f"センサー名 : {sensor.name}\n"
        f"圃場     : {field.name}\n"
        f"状態     : {'開' if gate_state == 'OPEN' else '閉'}\n"
        f"日時     : {taken_at.strftime('%Y-%m-%d %H:%M:%S')}"
    )
    attachment_filename = f"gate_{taken_at.strftime('%Y%m%d%H%M%S')}{ext}"

    for user in recipients:
        if not user.email:
            continue
        msg = MIMEMultipart()
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM
        msg["To"] = user.email
        msg.attach(MIMEText(body, "plain", "utf-8"))

        part = MIMEBase("image", "jpeg")
        part.set_payload(file_bytes)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{attachment_filename}"')
        msg.attach(part)

        try:
            if settings.SMTP_TLS:
                smtp = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
            else:
                smtp = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.sendmail(settings.SMTP_FROM, [user.email], msg.as_string())
            smtp.quit()
        except Exception as e:
            print(f"ゲートメール送信失敗 ({user.email}): {e}")


@router.post("/sensors/{sensor_id}/photos")
async def upload_sensor_photo(
    sensor_id: int,
    token: str = Query(..., description="センサートークン"),
    file: UploadFile = File(...),
    taken_at: Optional[datetime] = None,
    send_email: bool = Query(False, description="trueのとき写真を保存せずメール送信"),
    gate_state: Optional[str] = Query(None, description="ゲート状態 OPEN or CLOSE"),
    db: Session = Depends(get_db),
):
    sensor = db.query(models.Sensor).filter(models.Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    verify_sensor_token(sensor, token)

    file_bytes = await file.read()
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    photo_taken_at = taken_at or now_jst()

    if send_email:
        field = db.query(models.Field).filter(models.Field.id == sensor.field_id).first()
        recipients = (
            db.query(models.User)
            .join(models.UserField, models.User.id == models.UserField.user_id)
            .filter(
                models.UserField.field_id == sensor.field_id,
                models.UserField.role.in_(["owner", "manager"]),
            )
            .all()
        )
        _send_gate_photo_email(sensor, field, gate_state, photo_taken_at, file_bytes, ext, recipients)
        return {"ok": True}

    photo_dir = get_sensor_photo_dir(sensor_id)
    timestamp = photo_taken_at.strftime("%Y%m%d%H%M%S")
    filename = f"{timestamp}{ext}"
    file_path = os.path.join(photo_dir, filename)

    with open(file_path, "wb") as f:
        f.write(file_bytes)

    url_path = f"/sensor-photos/{sensor_id}/{filename}"
    photo = models.SensorPhoto(
        sensor_id=sensor_id,
        file_path=url_path,
        taken_at=photo_taken_at,
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
# 圃場ごとの最新センサー値サマリー(ホーム画面向け)
# show_on_home=True のセンサーを優先。なければ最小IDの有効センサー。
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

    # show_on_home=True を優先、なければ最小IDの有効センサー
    primary_sensor = (
        db.query(models.Sensor)
        .filter(
            models.Sensor.field_id == field_id,
            models.Sensor.active == True,
            models.Sensor.show_on_home == True,
        )
        .order_by(models.Sensor.id.asc())
        .first()
    )
    if not primary_sensor:
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
    
    feature_types = get_feature_type_by_key(db)
    seen = set()
    latest = []
    for r in latest_per_metric:
        if r.metric not in seen:
            seen.add(r.metric)
            ft = feature_types.get(r.metric)
            unit = ft.unit if ft else None
            latest.append(schemas.SensorLatestReading(
                metric=r.metric,
                value=r.value,
                unit=unit,
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
# ダミーデータ生成(開発用)
# ----------------------------------------------------------------

@router.post("/dev/seed-sensor-dummy")
def seed_sensor_dummy(
    db: Session = Depends(get_db),
):
    fields = db.query(models.Field).all()
    if not fields:
        raise HTTPException(status_code=400, detail="No fields found. Create fields first.")

    created_sensors = 0
    created_readings = 0
    now = now_jst()

    for field in fields:
        existing = db.query(models.Sensor).filter(models.Sensor.field_id == field.id).first()
        if existing:
            continue

        dummy_token = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=15))
        sensor = models.Sensor(
            field_id=field.id,
            name=f"{field.name}センサー",
            active=True,
            token=dummy_token,
            features=[],
            show_on_home=False,
        )
        db.add(sensor)
        db.flush()
        created_sensors += 1

        metrics = [
            ("water_level",   15.0, 3.0),
            ("water_temp",    22.0, 2.0),
            ("temperature",   20.0, 4.0),
            ("soil_moisture", 65.0, 10.0),
        ]
        for hours_ago in range(24, -1, -1):
            recorded_at = now - timedelta(hours=hours_ago)
            for metric, base, spread in metrics:
                value = round(base + random.uniform(-spread, spread), 1)
                db.add(models.SensorReading(
                    sensor_id=sensor.id,
                    metric=metric,
                    value=value,
                    recorded_at=recorded_at,
                ))
                created_readings += 1

    db.commit()
    return {
        "ok": True,
        "sensors_created": created_sensors,
        "readings_created": created_readings,
    }
