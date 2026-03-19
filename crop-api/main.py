from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from database import engine
import models
from routers import auth, items, work_logs, harvests, export, users

# テーブル自動作成（本番はAlembicに切り替え）
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="CropWorks API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(items.router)
app.include_router(work_logs.router)
app.include_router(harvests.router)
app.include_router(export.router)
app.include_router(users.router)

@app.get("/api/v1/health")
def health():
    return {"status": "ok"}
