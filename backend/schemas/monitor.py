from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class MonitorCreate(BaseModel):
    monitor_name: str
    target_url: str
    monitor_type: str = "http"
    interval: int = 300
    timeout: int = 10
    http_method: str = "GET"
    expected_status_code: int = 200
    custom_headers: Optional[str] = None
    request_body: Optional[str] = None
    keyword: Optional[str] = None
    dns_record_type: Optional[str] = None
    alert_threshold: int = 1


class MonitorUpdate(BaseModel):
    monitor_name: Optional[str] = None
    target_url: Optional[str] = None
    interval: Optional[int] = None
    timeout: Optional[int] = None
    http_method: Optional[str] = None
    expected_status_code: Optional[int] = None
    custom_headers: Optional[str] = None
    request_body: Optional[str] = None
    is_paused: Optional[bool] = None
    keyword: Optional[str] = None
    dns_record_type: Optional[str] = None
    alert_threshold: Optional[int] = None


class MonitorOut(BaseModel):
    id: int
    user_id: int
    monitor_name: str
    target_url: str
    monitor_type: str
    interval: int
    timeout: int
    http_method: str
    expected_status_code: int
    current_status: str
    is_paused: bool
    uptime_percentage: str
    keyword: Optional[str] = None
    dns_record_type: Optional[str] = None
    alert_threshold: int = 1
    failure_count: int = 0
    created_at: datetime
    last_checked_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MonitorLogOut(BaseModel):
    id: int
    monitor_id: int
    response_time: Optional[float]
    http_status: Optional[int]
    is_up: bool
    error_message: Optional[str]
    checked_at: datetime

    class Config:
        from_attributes = True
