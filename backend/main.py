from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging

from core.config import settings
from database import engine, Base
from core.monitoring import monitoring_loop
from core.ws_manager import manager
from api.routes import auth, monitors, incidents, notifications, dashboard, status_pages, admin
from api.routes import api_keys, organizations, maintenance, webhooks, audit, reports
import models  # ensures all models are registered

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Start the in-process monitoring engine (replaces Celery for local/single-process runs).
    # Skip it when a dedicated Celery worker owns checks (ENABLE_INPROCESS_MONITOR=false),
    # otherwise checks run twice and incidents double-fire.
    monitor_task = None
    if settings.ENABLE_INPROCESS_MONITOR:
        monitor_task = asyncio.create_task(monitoring_loop())
    else:
        logging.getLogger("uptime").info("In-process monitor disabled (ENABLE_INPROCESS_MONITOR=false)")
    yield
    if monitor_task:
        monitor_task.cancel()
        try:
            await monitor_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="Uptime API",
    description="AI-Powered Website, API & Server Monitoring Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(monitors.router)
app.include_router(incidents.router)
app.include_router(notifications.router)
app.include_router(dashboard.router)
app.include_router(status_pages.router)
app.include_router(admin.router)
app.include_router(api_keys.router)
app.include_router(organizations.router)
app.include_router(maintenance.router)
app.include_router(webhooks.router)
app.include_router(audit.router)
app.include_router(reports.router)


# manager is imported from core.ws_manager — shared with monitoring engine


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    await manager.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "uptime-api"}
