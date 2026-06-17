from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Monitor(Base):
    __tablename__ = "monitors"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    monitor_name = Column(String(255), nullable=False)
    target_url = Column(Text, nullable=False)
    monitor_type = Column(String(50), default="http")  # http, tcp, ping, ssl
    interval = Column(Integer, default=300)  # seconds
    timeout = Column(Integer, default=10)  # seconds
    http_method = Column(String(10), default="GET")
    expected_status_code = Column(Integer, default=200)
    custom_headers = Column(Text, nullable=True)
    request_body = Column(Text, nullable=True)
    current_status = Column(String(20), default="pending")  # up, down, pending, paused
    is_paused = Column(Boolean, default=False)
    uptime_percentage = Column(String(10), default="100.00")
    # Extended monitoring options
    keyword = Column(String(255), nullable=True)         # keyword presence check
    dns_record_type = Column(String(10), nullable=True, server_default="A")  # A, AAAA, CNAME, MX
    failure_count = Column(Integer, default=0, server_default="0")  # consecutive failures
    alert_threshold = Column(Integer, default=1, server_default="1")  # alert after N failures
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_checked_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", foreign_keys=[user_id], back_populates="monitors")
    logs = relationship("MonitorLog", back_populates="monitor", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="monitor", cascade="all, delete-orphan")
