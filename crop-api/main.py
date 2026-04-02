from datetime import datetime
import json
import re
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from routers import auth, users, items, work_logs, harvests, sensors, export, device_control
from database import engine
import models

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Farm Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_jst_timezone_suffix(request: Request, call_next):
    """
    APIレスポンス内の全てのdatetime文字列に+09:00サフィックスを追加
    フロントエンドがどのタイムゾーンでもJSTとして正しく解釈できるようにする
    """
    response = await call_next(request)
    
    # JSONレスポンスのみ処理
    if not response.headers.get("content-type", "").startswith("application/json"):
        return response
    
    # レスポンスボディを読み取り
    body = b""
    async for chunk in response.body_iterator:
        body += chunk
    
    try:
        content = body.decode("utf-8")
        # ISO 8601形式のdatetime文字列を検出: YYYY-MM-DDTHH:MM:SS (タイムゾーンなし)
        # 既にタイムゾーンがある場合(Z, +HH:MM, -HH:MM で終わる)は除外
        pattern = r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?![Z\+\-])'
        modified = re.sub(pattern, r'\1+09:00', content)
        
        # Content-Lengthを更新
        modified_bytes = modified.encode("utf-8")
        headers = dict(response.headers)
        headers["content-length"] = str(len(modified_bytes))
        
        return Response(
            content=modified_bytes,
            status_code=response.status_code,
            headers=headers,
            media_type=response.media_type,
        )
    except Exception:
        # エラー時は元のレスポンスを返す
        return Response(
            content=body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(items.router)
app.include_router(work_logs.router)
app.include_router(harvests.router)
app.include_router(sensors.router)
app.include_router(export.router)
app.include_router(device_control.router)


@app.get("/")
def root():
    return {"message": "Farm Manager API"}
