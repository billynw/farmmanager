"""
初回セットアップ用スクリプト
使い方: python3 seed.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, engine
import models
from auth import hash_password

models.Base.metadata.create_all(bind=engine)

db = SessionLocal()

# 管理者ユーザー
if not db.query(models.User).first():
    db.add(models.User(name="admin", password_hash=hash_password("changeme"), role=models.UserRole.admin))
    print("Created admin user (password: changeme)")

# 作業種別マスタ
if not db.query(models.WorkType).first():
    work_types = [
        ("播種", "#4CAF50"),
        ("定植", "#8BC34A"),
        ("施肥", "#FF9800"),
        ("農薬", "#F44336"),
        ("灌水", "#2196F3"),
        ("除草", "#795548"),
        ("収穫", "#E91E63"),
        ("その他", "#9E9E9E"),
    ]
    for name, color in work_types:
        db.add(models.WorkType(name=name, color=color))
    print("Created work types")

# サンプル圃場
if not db.query(models.Field).first():
    db.add(models.Field(name="第1圃場", area=10.0, location_note="東側"))
    db.add(models.Field(name="第2圃場", area=5.0, location_note="西側"))
    print("Created sample fields")

db.commit()
db.close()
print("Seed complete.")
