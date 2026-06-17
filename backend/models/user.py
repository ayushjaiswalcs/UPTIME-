from sqlalchemy import Column, Integer, String, DateTime, Boolean, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum

class UserRole(str, enum.Enum):
    admin = "admin"
    owner = "owner"
    member = "member"
    viewer = "viewer"


class SubscriptionPlan(str, enum.Enum):
    free = "free"
    pro = "pro"
    enterprise = "enterprise"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default="owner")
    subscription_plan = Column(String(50), default="free")
    is_verified = Column(Boolean, default=False, server_default="false")
    avatar_url = Column(String(500), nullable=True)
    # 2FA (TOTP)
    totp_secret = Column(String(64), nullable=True)
    totp_enabled = Column(Boolean, default=False, server_default="false")
    # Session tracking
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    monitors = relationship("Monitor", foreign_keys="Monitor.user_id", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    status_pages = relationship("StatusPage", back_populates="user", cascade="all, delete-orphan")
    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user")
    maintenance_windows = relationship("MaintenanceWindow", back_populates="user", cascade="all, delete-orphan")
    alert_rules = relationship("AlertRule", back_populates="user", cascade="all, delete-orphan")
    webhook_endpoints = relationship("WebhookEndpoint", back_populates="user", cascade="all, delete-orphan")
