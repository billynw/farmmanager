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

# ミドルウェア: datetime文字列にZサフィックスを追加
@app.middleware("http")
async def add_utc_suffix_middleware(request: Request, call_next):
    response = await call_next(request)
    
    # JSONレスポンスのみ処理
    if response.headers.get("content-type", "").startswith("application/json"):
        # レスポンスボディを読み取る
        body = b""
        async for chunk in response.body_iterator:
            body += chunk
        
        try:
            # JSONをデコード
            content = body.decode("utf-8")
            # ISO 8601形式のdatetimeにZサフィックスを追加（既にZがある場合は除外）
            # パターン: "2026-03-31T03:30:13" -> "2026-03-31T03:30:13Z"
            content = re.sub(
                r'"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)"',
                r'"\1Z"',
                content
            )
            # 新しいレスポンスを作成
            return Response(
                content=content,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )
        except:
            # エラーの場合は元のレスポンスをそのまま返す
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )
    
    return response

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
