from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from datetime import datetime, timedelta, timezone
from core.deps import get_db, get_current_user
from core.monitoring import check_monitor
from models.user import User
from models.monitor import Monitor
from models.monitor_log import MonitorLog
from schemas.monitor import MonitorCreate, MonitorUpdate, MonitorOut, MonitorLogOut

router = APIRouter(prefix="/monitors", tags=["monitors"])

PLAN_LIMITS = {"free": 10, "pro": 100, "enterprise": None}


@router.get("", response_model=List[MonitorOut])
def list_monitors(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Monitor).filter(Monitor.user_id == current_user.id).order_by(desc(Monitor.created_at)).all()


@router.post("", response_model=MonitorOut, status_code=201)
def create_monitor(data: MonitorCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    limit = PLAN_LIMITS.get(current_user.subscription_plan)
    if limit is not None:
        count = db.query(Monitor).filter(Monitor.user_id == current_user.id).count()
        if count >= limit:
            raise HTTPException(status_code=400, detail=f"Monitor limit reached for {current_user.subscription_plan} plan")
    monitor = Monitor(user_id=current_user.id, **data.model_dump())
    db.add(monitor)
    db.commit()
    db.refresh(monitor)
    return monitor


@router.get("/{monitor_id}", response_model=MonitorOut)
def get_monitor(monitor_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return monitor


@router.put("/{monitor_id}", response_model=MonitorOut)
def update_monitor(monitor_id: int, data: MonitorUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(monitor, field, value)
    db.commit()
    db.refresh(monitor)
    return monitor


@router.delete("/{monitor_id}", status_code=204)
def delete_monitor(monitor_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    db.delete(monitor)
    db.commit()


@router.post("/{monitor_id}/pause")
def pause_monitor(monitor_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    monitor.is_paused = not monitor.is_paused
    monitor.current_status = "paused" if monitor.is_paused else "pending"
    db.commit()
    return {"is_paused": monitor.is_paused}


@router.get("/{monitor_id}/logs", response_model=List[MonitorLogOut])
def get_monitor_logs(
    monitor_id: int,
    hours: int = 24,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    monitor = db.query(Monitor).filter(Monitor.id == monitor_id, Monitor.user_id == current_user.id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    logs = (
        db.query(MonitorLog)
        .filter(MonitorLog.monitor_id == monitor_id, MonitorLog.checked_at >= since)
        .order_by(desc(MonitorLog.checked_at))
        .limit(500)
        .all()
    )
    return logs
