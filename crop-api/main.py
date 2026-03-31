from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
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

# カスタムJSON encoder: datetimeにZサフィックスを付けてUTCとして明示
from fastapi.responses import JSONResponse
from typing import Any

class UTCJSONResponse(JSONResponse):
    def render(self, content: Any) -> bytes:
        def convert_datetime(obj):
            if isinstance(obj, dict):
                return {k: convert_datetime(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_datetime(item) for item in obj]
            elif isinstance(obj, datetime):
                # datetime.utcnowで保存されているのでZサフィックスを付けてUTCを明示
                return obj.isoformat() + 'Z'
            return obj
        
        content = convert_datetime(content)
        return super().render(content)

app.router.default_response_class = UTCJSONResponse

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
