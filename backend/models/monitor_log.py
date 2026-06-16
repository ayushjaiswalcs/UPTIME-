from sqlalchemy import Column, Integer, Float, Boolean, DateTime, ForeignKey, String, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class MonitorLog(Base):
    __tablename__ = "monitor_logs"

    # Almost every read filters by monitor_id and a checked_at time window
    # (dashboard charts, uptime recalculation, log views). A composite index on
    # (monitor_id, checked_at) turns those table scans into index range scans.
    __table_args__ = (
        Index("ix_monitor_logs_monitor_checked", "monitor_id", "checked_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    monitor_id = Column(Integer, ForeignKey("monitors.id", ondelete="CASCADE"), nullable=False)
    response_time = Column(Float, nullable=True)  # ms
    http_status = Column(Integer, nullable=True)
    is_up = Column(Boolean, nullable=False)
    error_message = Column(String(500), nullable=True)
    checked_at = Column(DateTime(timezone=True), server_default=func.now())

    monitor = relationship("Monitor", back_populates="logs")
