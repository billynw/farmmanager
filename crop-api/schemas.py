from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, field_validator
from models import UserFieldRole, ItemStatus

# --- Auth ---
class Token(BaseModel):
    access_token: str
    token_type: str

class LoginRequest(BaseModel):
    email: str
    password: str

class PasswordResetRequest(BaseModel):
    email: str

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

class RegisterRequest(BaseModel):
    name: str
    email: str

class VerifyEmailRequest(BaseModel):
    token: str
    password: str

class AcceptInviteRequest(BaseModel):
    token: str
    password: str

# --- User ---
class UserOut(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    is_owner_of_any: bool = False
    is_manager_of_any: bool = False
    field_role: Optional[UserFieldRole] = None
    model_config = {"from_attributes": True}

class FieldInviteItem(BaseModel):
    field_id: int
    field_role: UserFieldRole = UserFieldRole.member

class UserInvite(BaseModel):
    name: str
    email: str
    fields: List[FieldInviteItem]

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None

# --- Field ---
class FieldCreate(BaseModel):
    name: str
    area: Optional[float] = None
    location_note: Optional[str] = None

class FieldOut(FieldCreate):
    id: int
    my_role: Optional[UserFieldRole] = None
    model_config = {"from_attributes": True}

# --- WorkType ---
class WorkTypeCreate(BaseModel):
    name: str
    color: str = "#888888"

class WorkTypeOut(WorkTypeCreate):
    id: int
    model_config = {"from_attributes": True}

# --- AgroInput ---
class AgroInputCreate(BaseModel):
    product_name: str
    quantity: Optional[str] = None
    dilution: Optional[str] = None
    unit: Optional[str] = None

class AgroInputOut(AgroInputCreate):
    id: int
    model_config = {"from_attributes": True}

# --- Photo ---
class PhotoOut(BaseModel):
    id: int
    file_path: str
    taken_at: Optional[datetime]
    model_config = {"from_attributes": True}

# --- WorkLog (簡易版) ---
class WorkLogSimple(BaseModel):
    id: int
    worked_at: datetime
    memo: Optional[str]
    work_type: Optional[WorkTypeOut] = None
    model_config = {"from_attributes": True}

# --- Item ---
class ItemCreate(BaseModel):
    name: str
    variety: Optional[str] = None
    field_id: Optional[int] = None
    planted_at: Optional[date] = None
    status: ItemStatus = ItemStatus.growing

class ItemOut(BaseModel):
    id: int
    name: str
    variety: Optional[str]
    field_id: Optional[int]
    planted_at: Optional[date]
    status: ItemStatus
    field: Optional[FieldOut] = None
    latest_work_log: Optional[WorkLogSimple] = None
    model_config = {"from_attributes": True}

# --- WorkLog ---
class WorkLogCreate(BaseModel):
    item_id: int
    work_type_id: Optional[int] = None
    worked_at: Optional[datetime] = None
    memo: Optional[str] = None
    agro_inputs: List[AgroInputCreate] = []

class WorkLogOut(BaseModel):
    id: int
    item_id: int
    worked_at: datetime
    memo: Optional[str]
    work_type: Optional[WorkTypeOut] = None
    user: Optional[UserOut] = None
    agro_inputs: List[AgroInputOut] = []
    photos: List[PhotoOut] = []
    model_config = {"from_attributes": True}

# --- Harvest ---
class HarvestCreate(BaseModel):
    item_id: int
    harvested_at: date
    quantity: Optional[float] = None
    unit: Optional[str] = None
    shipped: bool = False
    memo: Optional[str] = None

class HarvestOut(HarvestCreate):
    id: int
    model_config = {"from_attributes": True}

# --- SensorFeatureType ---
class SensorFeatureTypeOut(BaseModel):
    id: int
    key: str
    label: str
    model_config = {"from_attributes": True}

# --- Sensor ---
class SensorCreate(BaseModel):
    field_id: int
    name: str
    active: bool = True
    token: str
    features: List[int] = []   # sensor_feature_types.id のリスト

    @field_validator("features")
    @classmethod
    def features_unique(cls, v: List[int]) -> List[int]:
        """重複IDを除去して返す"""
        seen = []
        for x in v:
            if x not in seen:
                seen.append(x)
        return seen

class SensorUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    field_id: Optional[int] = None
    features: Optional[List[int]] = None   # None のとき更新しない

    @field_validator("features")
    @classmethod
    def features_unique(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is None:
            return v
        seen = []
        for x in v:
            if x not in seen:
                seen.append(x)
        return seen

class SensorOut(BaseModel):
    id: int
    field_id: int
    name: str
    active: bool
    token: str
    features: List[int] = []   # sensor_feature_types.id のリスト
    model_config = {"from_attributes": True}

# --- SensorReading ---
class SensorReadingCreate(BaseModel):
    token: str
    metric: str
    value: float
    unit: Optional[str] = None
    recorded_at: Optional[datetime] = None

class SensorReadingOut(BaseModel):
    id: int
    sensor_id: int
    metric: str
    value: float
    unit: Optional[str]
    recorded_at: datetime
    model_config = {"from_attributes": True}

# --- SensorPhoto ---
class SensorPhotoOut(BaseModel):
    id: int
    sensor_id: int
    file_path: str
    taken_at: datetime
    model_config = {"from_attributes": True}

# センサーの最新値をmetricごとにまとめたもの（フロント向け集約）
class SensorLatestReading(BaseModel):
    metric: str
    value: float
    unit: Optional[str]
    recorded_at: datetime

class SensorWithLatest(BaseModel):
    id: int
    name: str
    active: bool
    latest: List[SensorLatestReading] = []
    model_config = {"from_attributes": True}

class FieldSensorSummary(BaseModel):
    field_id: int
    field_name: str
    sensors: List[SensorWithLatest] = []
