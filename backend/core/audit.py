"""
Lightweight audit-log helper.

Usage:
    from core.audit import log_action
    log_action(db, user_id=current_user.id, action="monitor.create",
               resource_type="monitor", resource_id=monitor.id,
               details={"name": monitor.monitor_name})
"""
import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from models.audit_log import AuditLog


def log_action(
    db: Session,
    user_id: int,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[int] = None,
    details: Optional[Any] = None,
) -> AuditLog:
    """
    Insert an audit log row and flush (but do NOT commit — the caller owns
    the transaction so multiple writes can be batched in one commit).

    :param db:            Active SQLAlchemy session.
    :param user_id:       ID of the acting user.
    :param action:        Dot-namespaced action string, e.g. "monitor.create".
    :param resource_type: Optional resource category, e.g. "monitor".
    :param resource_id:   Optional PK of the affected row.
    :param details:       Optional dict / string with extra context (stored as JSON).
    :returns:             The newly created AuditLog ORM object (flushed, not committed).
    """
    details_str: Optional[str] = None
    if details is not None:
        if isinstance(details, str):
            details_str = details
        else:
            try:
                details_str = json.dumps(details)
            except (TypeError, ValueError):
                details_str = str(details)

    entry = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details_str,
    )
    db.add(entry)
    db.flush()
    return entry
