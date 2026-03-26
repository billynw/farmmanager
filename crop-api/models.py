from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Date,
    Boolean, Numeric, ForeignKey, Enum, Float, JSON
)
from sqlalchemy.orm import relationship
from database import Base
import enum


class UserFieldRole(str, enum.Enum):
    owner = "owner"
    manager = "manager"
    member = "member"


class ItemStatus(str, enum.Enum):
    growing = "growing"
    finished = "finished"


class DeviceCommandStatus(str, enum.Enum):
    pending = "pending"
    delivered = "delivered"
    completed = "completed"
    expired = "expired"
    cancelled = "cancelled"


class UserField(Base):
    __tablename__ = "user_fields"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    field_id = Column(Integer, ForeignKey("fields.id"), primary_key=True)
    role = Column(Enum(UserFieldRole), default=UserFieldRole.member, nullable=False)
    user = relationship("User", back_populates="user_fields")
    field = relationship("Field", back_populates="user_fields")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=True, unique=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    work_logs = relationship("WorkLog", back_populates="user")
    user_fields = relationship("UserField", back_populates="user", cascade="all, delete-orphan")
    reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")

    @property
    def fields(self):
        return [uf.field for uf in self.user_fields]

    def get_field_role(self, field_id: int):
        for uf in self.user_fields:
            if uf.field_id == field_id:
                return uf.role
        return None

    @property
    def is_owner_of_any(self):
        return any(uf.role == UserFieldRole.owner for uf in self.user_fields)

    @property
    def is_manager_of_any(self):
        return any(uf.role in (UserFieldRole.owner, UserFieldRole.manager) for uf in self.user_fields)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="reset_tokens")


class EmailVerification(Base):
    __tablename__ = "email_verifications"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    token = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class InviteVerification(Base):
    __tablename__ = "invite_verifications"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False)
    field_id = Column(Integer, ForeignKey("fields.id"), nullable=False)
    field_role = Column(Enum(UserFieldRole), default=UserFieldRole.member, nullable=False)
    token = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    field = relationship("Field")


class Field(Base):
    __tablename__ = "fields"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    area = Column(Numeric(6, 2), nullable=True)
    location_note = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    items = relationship("Item", back_populates="field")
    user_fields = relationship("UserField", back_populates="field", cascade="all, delete-orphan")
    sensors = relationship("Sensor", back_populates="field", cascade="all, delete-orphan")

    @property
    def users(self):
        return [uf.user for uf in self.user_fields]


class WorkType(Base):
    __tablename__ = "work_types"
    id = Column(Integer, primary_key=True)
    name = Column(String(50), nullable=False)
    color = Column(String(7), default="#888888")
    work_logs = relationship("WorkLog", back_populates="work_type")


class Item(Base):
    __tablename__ = "items"
    id = Column(Integer, primary_key=True)
    field_id = Column(Integer, ForeignKey("fields.id"), nullable=True)
    name = Column(String(100), nullable=False)
    variety = Column(String(100), nullable=True)
    planted_at = Column(Date, nullable=True)
    status = Column(Enum(ItemStatus), default=ItemStatus.growing)
    created_at = Column(DateTime, default=datetime.utcnow)
    field = relationship("Field", back_populates="items")
    work_logs = relationship("WorkLog", back_populates="item", order_by="WorkLog.worked_at.desc()", cascade="all, delete-orphan")
    harvests = relationship("Harvest", back_populates="item", order_by="Harvest.harvested_at.desc()", cascade="all, delete-orphan")


class WorkLog(Base):
    __tablename__ = "work_logs"
    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    work_type_id = Column(Integer, ForeignKey("work_types.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    worked_at = Column(DateTime, default=datetime.utcnow)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    item = relationship("Item", back_populates="work_logs")
    work_type = relationship("WorkType", back_populates="work_logs")
    user = relationship("User", back_populates="work_logs")
    agro_inputs = relationship("AgroInput", back_populates="work_log", cascade="all, delete-orphan")
    photos = relationship("Photo", back_populates="work_log", cascade="all, delete-orphan")


class AgroInput(Base):
    __tablename__ = "agro_inputs"
    id = Column(Integer, primary_key=True)
    log_id = Column(Integer, ForeignKey("work_logs.id"), nullable=False)
    product_name = Column(String(200), nullable=False)
    quantity = Column(String(50), nullable=True)
    dilution = Column(String(50), nullable=True)
    unit = Column(String(20), nullable=True)
    work_log = relationship("WorkLog", back_populates="agro_inputs")


class Photo(Base):
    __tablename__ = "photos"
    id = Column(Integer, primary_key=True)
    log_id = Column(Integer, ForeignKey("work_logs.id"), nullable=False)
    file_path = Column(String(500), nullable=False)
    taken_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    work_log = relationship("WorkLog", back_populates="photos")


class Harvest(Base):
    __tablename__ = "harvests"
    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    harvested_at = Column(Date, nullable=False)
    quantity = Column(Numeric(8, 2), nullable=True)
    unit = Column(String(20), nullable=True)
    shipped = Column(Boolean, default=False)
    memo = Column(Text, nullable=True)
    item = relationship("Item", back_populates="harvests")


class SensorFeatureType(Base):
    __tablename__ = "sensor_feature_types"
    id    = Column(Integer, primary_key=True)
    key   = Column(String(50), nullable=False, unique=True)
    label = Column(String(100), nullable=False)
    color = Column(String(7), nullable=True)
    value_max = Column(Float, nullable=True)
    value_min = Column(Float, nullable=True)
    unit = Column(String(20), nullable=True)


class Sensor(Base):
    __tablename__ = "sensors"
    id           = Column(Integer, primary_key=True)
    field_id     = Column(Integer, ForeignKey("fields.id"), nullable=False)
    name         = Column(String(100), nullable=False)
    active       = Column(Boolean, default=True)
    token        = Column(String(15), nullable=False)
    features     = Column(JSON, nullable=False, default=list)
    show_on_home = Column(JSON, nullable=False, default=list)
    current_state = Column(String(10), nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    field    = relationship("Field", back_populates="sensors")
    readings = relationship("SensorReading", back_populates="sensor", cascade="all, delete-orphan")
    photos   = relationship("SensorPhoto",   back_populates="sensor", cascade="all, delete-orphan")
    commands = relationship("DeviceCommand", back_populates="sensor", cascade="all, delete-orphan")


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    id          = Column(Integer, primary_key=True)
    sensor_id   = Column(Integer, ForeignKey("sensors.id"), nullable=False)
    metric      = Column(String(50), nullable=False)
    value       = Column(Float, nullable=False)
    recorded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    sensor = relationship("Sensor", back_populates="readings")


class SensorPhoto(Base):
    __tablename__ = "sensor_photos"
    id         = Column(Integer, primary_key=True)
    sensor_id  = Column(Integer, ForeignKey("sensors.id"), nullable=False)
    file_path  = Column(String(500), nullable=False)
    taken_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    sensor = relationship("Sensor", back_populates="photos")


class DeviceCommand(Base):
    __tablename__ = "device_commands"
    id = Column(Integer, primary_key=True)
    sensor_id = Column(Integer, ForeignKey("sensors.id"), nullable=False)
    command = Column(String(10), nullable=False)
    status = Column(Enum(DeviceCommandStatus), default=DeviceCommandStatus.pending, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    delivered_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    sensor = relationship("Sensor", back_populates="commands")
