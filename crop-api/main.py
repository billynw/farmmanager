from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
