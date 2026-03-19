from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Date,
    Boolean, Numeric, ForeignKey, Enum, Table
)
from sqlalchemy.orm import relationship
from database import Base
import enum

class UserRole(str, enum.Enum):
    admin = "admin"
    member = "member"

class ItemStatus(str, enum.Enum):
    growing = "growing"
    finished = "finished"

# User と Field の中間テーブル（多対多）
user_fields = Table(
    "user_fields",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("field_id", Integer, ForeignKey("fields.id"), primary_key=True),
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=True, unique=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.member)
    created_at = Column(DateTime, default=datetime.utcnow)
    work_logs = relationship("WorkLog", back_populates="user")
    fields = relationship("Field", secondary=user_fields, back_populates="users")
    reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")

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
    """新規ユーザー仮登録テーブル"""
    __tablename__ = "email_verifications"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    token = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Field(Base):
    __tablename__ = "fields"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    area = Column(Numeric(6, 2), nullable=True)
    location_note = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    items = relationship("Item", back_populates="field")
    users = relationship("User", secondary=user_fields, back_populates="fields")

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
