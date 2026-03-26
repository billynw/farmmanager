from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models
import schemas

router = APIRouter(prefix="/api/v1", tags=["device-control"])


class DeviceStateRequest(BaseModel):
    """デバイスの状態リクエスト"""
    state: str
    token: Optional[str] = None


class DeviceCommandResponse(BaseModel):
    """デバイスへのコマンドレスポンス"""
    command: Optional[str] = None


class DeviceCommandCancelRequest(BaseModel):
    """命令キャンセルリクエスト"""
    command_id: int


@router.post("/device/command", response_model=DeviceCommandResponse)
def get_device_command(
    request: DeviceStateRequest,
    db: Session = Depends(get_db)
):
    """
    センサーデバイスが命令を取得するエンドポイント
    
    受信JSON:
    {
        "state": "OPEN",  # or "CLOSE"
        "token": "sensor-token"
    }
    
    返すJSON:
    {
        "command": "OPEN"  # or "CLOSE", or null
    }
    """
    if not request.token:
        raise HTTPException(status_code=400, detail="Token is required")
    
    # トークンでセンサーを特定
    sensor = db.query(models.Sensor).filter(models.Sensor.token == request.token).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    # pending状態で有効期限内の命令を取得（最新1件）
    now = datetime.utcnow()
    command = (
        db.query(models.DeviceCommand)
        .filter(
            models.DeviceCommand.sensor_id == sensor.id,
            models.DeviceCommand.status == models.DeviceCommandStatus.pending,
            models.DeviceCommand.expires_at > now
        )
        .order_by(models.DeviceCommand.created_at.desc())
        .first()
    )
    
    if command:
        # 現在の状態と同じコマンドなら不要
        if request.state == command.command:
            # 不要な命令として完了扱い
            command.status = models.DeviceCommandStatus.completed
            command.delivered_at = now
            command.completed_at = now
            db.commit()
            return DeviceCommandResponse(command=None)
        
        # 配信済みにマーク
        command.status = models.DeviceCommandStatus.delivered
        command.delivered_at = now
        db.commit()
        return DeviceCommandResponse(command=command.command)
    
    return DeviceCommandResponse(command=None)


@router.post("/device/command/complete")
def complete_device_command(
    request: DeviceStateRequest,
    db: Session = Depends(get_db)
):
    """
    センサーがコマンド実行完了を報告するエンドポイント
    
    受信JSON:
    {
        "state": "OPEN",  # 実行後の状態
        "token": "sensor-token"
    }
    """
    if not request.token:
        raise HTTPException(status_code=400, detail="Token is required")
    
    # トークンでセンサーを特定
    sensor = db.query(models.Sensor).filter(models.Sensor.token == request.token).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    # センサーのfeaturesからゲート制御機能のfeature_idを取得
    # feature_id 2: 給水ゲート (gate_supply), 3: 排水ゲート (gate_drain)
    gate_feature_ids = [2, 3]  # 給水ゲート、排水ゲート
    gate_feature_id = None
    for fid in sensor.features:
        if fid in gate_feature_ids:
            gate_feature_id = fid
            break
    
    if not gate_feature_id:
        raise HTTPException(status_code=400, detail="Sensor does not have gate control feature")
    
    # feature_idからmetric keyを取得
    feature_type = db.query(models.SensorFeatureType).filter(
        models.SensorFeatureType.id == gate_feature_id
    ).first()
    
    if not feature_type:
        raise HTTPException(status_code=500, detail="Feature type not found")
    
    # ゲート状態をsensor_readingsに記録
    # OPEN -> 1, CLOSE -> 0
    state_value = 1.0 if request.state == "OPEN" else 0.0
    reading = models.SensorReading(
        sensor_id=sensor.id,
        metric=feature_type.key,  # gate_supply または gate_drain
        value=state_value,
        recorded_at=datetime.utcnow()
    )
    db.add(reading)
    
    # deliveredステータスのコマンドをcompletedに変更
    now = datetime.utcnow()
    command = (
        db.query(models.DeviceCommand)
        .filter(
            models.DeviceCommand.sensor_id == sensor.id,
            models.DeviceCommand.status == models.DeviceCommandStatus.delivered
        )
        .order_by(models.DeviceCommand.delivered_at.desc())
        .first()
    )
    
    if command:
        command.status = models.DeviceCommandStatus.completed
        command.completed_at = now
    
    db.commit()
    return {"ok": True}


@router.post("/device/command/send", response_model=schemas.DeviceCommandOut)
def send_device_command(
    body: schemas.DeviceCommandCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    フロントエンドから命令を送信するエンドポイント
    
    受信JSON:
    {
        "sensor_id": 5,
        "command": "OPEN"  # or "CLOSE"
    }
    """
    # センサーの存在確認
    sensor = db.query(models.Sensor).filter(models.Sensor.id == body.sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    
    # コマンド検証
    if body.command not in ["OPEN", "CLOSE"]:
        raise HTTPException(status_code=400, detail="Command must be OPEN or CLOSE")
    
    # 命令作成（有効期限24時間）
    command = models.DeviceCommand(
        sensor_id=body.sensor_id,
        command=body.command,
        status=models.DeviceCommandStatus.pending,
        expires_at=datetime.utcnow() + timedelta(hours=24)
    )
    db.add(command)
    db.commit()
    db.refresh(command)
    
    return command


@router.post("/device/command/cancel")
def cancel_device_command(
    body: DeviceCommandCancelRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    命令をキャンセルするエンドポイント
    
    受信JSON:
    {
        "command_id": 123
    }
    """
    command = db.query(models.DeviceCommand).filter(
        models.DeviceCommand.id == body.command_id
    ).first()
    
    if not command:
        raise HTTPException(status_code=404, detail="Command not found")
    
    if command.status != models.DeviceCommandStatus.pending:
        raise HTTPException(status_code=400, detail="Only pending commands can be cancelled")
    
    command.status = models.DeviceCommandStatus.cancelled
    db.commit()
    
    return {"ok": True}


@router.get("/device/commands", response_model=List[schemas.DeviceCommandOut])
def get_device_commands(
    sensor_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    命令履歴を取得するエンドポイント
    """
    commands = (
        db.query(models.DeviceCommand)
        .filter(models.DeviceCommand.sensor_id == sensor.id)
        .order_by(models.DeviceCommand.created_at.desc())
        .limit(limit)
        .all()
    )
    return commands
