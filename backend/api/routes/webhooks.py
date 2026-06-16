import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.deps import get_db, get_current_user
from models.webhook import WebhookEndpoint, WebhookDelivery
from models.user import User
from schemas.webhook import WebhookCreate, WebhookUpdate, WebhookOut, DeliveryOut, VALID_EVENTS

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("", response_model=List[WebhookOut])
def list_webhooks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(WebhookEndpoint).filter(WebhookEndpoint.user_id == current_user.id).all()


@router.post("", response_model=WebhookOut, status_code=201)
def create_webhook(data: WebhookCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if data.events:
        invalid = [e for e in data.events if e not in VALID_EVENTS]
        if invalid:
            raise HTTPException(status_code=422, detail=f"Invalid events: {invalid}")
    wh = WebhookEndpoint(
        user_id=current_user.id,
        name=data.name,
        url=data.url,
        secret=data.secret,
        events=json.dumps(data.events) if data.events else json.dumps(VALID_EVENTS),
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


@router.get("/{wh_id}", response_model=WebhookOut)
def get_webhook(wh_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _get_wh(wh_id, current_user.id, db)


@router.put("/{wh_id}", response_model=WebhookOut)
def update_webhook(wh_id: int, data: WebhookUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wh = _get_wh(wh_id, current_user.id, db)
    for field, value in data.model_dump(exclude_none=True).items():
        if field == "events":
            invalid = [e for e in value if e not in VALID_EVENTS]
            if invalid:
                raise HTTPException(status_code=422, detail=f"Invalid events: {invalid}")
            wh.events = json.dumps(value)
        else:
            setattr(wh, field, value)
    db.commit()
    db.refresh(wh)
    return wh


@router.delete("/{wh_id}", status_code=204)
def delete_webhook(wh_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wh = _get_wh(wh_id, current_user.id, db)
    db.delete(wh)
    db.commit()


@router.get("/{wh_id}/deliveries", response_model=List[DeliveryOut])
def list_deliveries(wh_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_wh(wh_id, current_user.id, db)
    return (
        db.query(WebhookDelivery)
        .filter(WebhookDelivery.endpoint_id == wh_id)
        .order_by(WebhookDelivery.delivered_at.desc())
        .limit(100)
        .all()
    )


def _get_wh(wh_id: int, user_id: int, db: Session) -> WebhookEndpoint:
    wh = db.query(WebhookEndpoint).filter(WebhookEndpoint.id == wh_id, WebhookEndpoint.user_id == user_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return wh
