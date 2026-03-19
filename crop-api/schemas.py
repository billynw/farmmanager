from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel
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
    model_config = {"from_attributes": True}

class FieldInviteItem(BaseModel):
    """招待時の圃場と権限のペア"""
    field_id: int
    field_role: UserFieldRole = UserFieldRole.member

class UserInvite(BaseModel):
    name: str
    email: str
    fields: List[FieldInviteItem]  # 複数圃場に一括招待

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
