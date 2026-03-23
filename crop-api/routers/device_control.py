from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/v1", tags=["device-control"])


class DeviceStateRequest(BaseModel):
    """デバイスの状態リクエスト"""
    state: str
    token: Optional[str] = None


class DeviceCommandResponse(BaseModel):
    """デバイスへのコマンドレスポンス"""
    command: str


@router.post("/device/command", response_model=DeviceCommandResponse)
def get_device_command(request: DeviceStateRequest):
    """
    デバイスの状態に基づいてコマンドを返す
    
    受信JSON:
    {
        "state": "CLOSED",
        "token": "your-token"  # オプション
    }
    
    返すJSON:
    {
        "command": "OPEN"
    }
    """
    if request.state == "CLOSED":
        return DeviceCommandResponse(command="OPEN")
    elif request.state == "OPEN":
        return DeviceCommandResponse(command="CLOSE")
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid state: {request.state}. Expected 'OPEN' or 'CLOSED'"
        )
