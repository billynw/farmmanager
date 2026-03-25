from datetime import datetime, date
from typing import Optional, List, Any
from pydantic import BaseModel, field_validator, model_validator
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

# --- WorkLog ---
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
    color: Optional[str] = None
    value_max: Optional[float] = None
    value_min: Optional[float] = None
    unit: Optional[str] = None
    model_config = {"from_attributes": True}

# --- Sensor ---
def _unique(v: List[int]) -> List[int]:
    seen = []
    for x in v:
        if x not in seen:
            seen.append(x)
    return seen

def _to_int_list(v: Any) -> List[int]:
    """DBのカラム値がリストでない場合（旧TINYINT=0など）は空リストに変換"""
    if isinstance(v, list):
        return v
    return []

class SensorCreate(BaseModel):
    field_id: int
    name: str
    active: bool = True
    token: str
    features: List[int] = []
    show_on_home: List[int] = []

    @field_validator("features", "show_on_home")
    @classmethod
    def ids_unique(cls, v: List[int]) -> List[int]:
        return _unique(v)

class SensorUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    field_id: Optional[int] = None
    features: Optional[List[int]] = None
    show_on_home: Optional[List[int]] = None

    @field_validator("features", "show_on_home")
    @classmethod
    def ids_unique(cls, v: Optional[List[int]]) -> Optional[List[int]]:
        if v is None:
            return v
        return _unique(v)

class SensorOut(BaseModel):
    id: int
    field_id: int
    name: str
    active: bool
    token: str
    features: List[int] = []
    show_on_home: List[int] = []
    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def normalize_json_fields(cls, data: Any) -> Any:
        """旧データ互換: features/show_on_home がリスト以外(0など)なら空リストに"""
        if hasattr(data, "__dict__"):
            # SQLAlchemy モデルオブジェクトの場合
            for field in ("features", "show_on_home"):
                val = getattr(data, field, None)
                if not isinstance(val, list):
                    setattr(data, field, [])
        elif isinstance(data, dict):
            for field in ("features", "show_on_home"):
                if not isinstance(data.get(field), list):
                    data[field] = []
        return data

# --- SensorReading ---
class SensorReadingCreate(BaseModel):
    token: str
    metric: str
    value: float
    recorded_at: Optional[datetime] = None

class SensorReadingOut(BaseModel):
    id: int
    sensor_id: int
    metric: str
    value: float
    recorded_at: datetime
    model_config = {"from_attributes": True}

# --- SensorPhoto ---
class SensorPhotoOut(BaseModel):
    id: int
    sensor_id: int
    file_path: str
    taken_at: datetime
    model_config = {"from_attributes": True}

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
