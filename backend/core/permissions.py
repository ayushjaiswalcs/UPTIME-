"""
RBAC permission system for organization roles.
"""
from typing import Optional
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.deps import get_db, get_current_user
from models.organization import TeamMember
from models.user import User

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "owner": {
        "create_monitor",
        "edit_monitor",
        "delete_monitor",
        "view_reports",
        "export_reports",
        "manage_team",
        "manage_billing",
        "view_monitors",
    },
    "admin": {
        "create_monitor",
        "edit_monitor",
        "delete_monitor",
        "view_reports",
        "export_reports",
        "manage_team",
        "view_monitors",
    },
    "manager": {
        "create_monitor",
        "edit_monitor",
        "view_reports",
        "export_reports",
        "view_monitors",
    },
    "developer": {
        "create_monitor",
        "edit_monitor",
        "view_monitors",
    },
    "viewer": {
        "view_monitors",
    },
}


def get_org_role(user_id: int, org_id: int, db: Session) -> Optional[str]:
    """Return the role string for a user in an org, or None if not a member."""
    member = (
        db.query(TeamMember)
        .filter(TeamMember.org_id == org_id, TeamMember.user_id == user_id)
        .first()
    )
    if member:
        return member.role
    return None


def has_permission(role: Optional[str], permission: str) -> bool:
    """Check whether a given role includes a permission."""
    if role is None:
        return False
    return permission in ROLE_PERMISSIONS.get(role, set())


def require_permission(permission: str, org_id_param: str = "org_id"):
    """
    FastAPI dependency factory.

    Usage in a route:
        @router.get("/{org_id}/resource")
        def my_route(
            org_id: int,
            _: None = Depends(require_permission("view_reports")),
            ...
        ):

    The dependency reads `org_id` from the path by looking at the request's
    path parameters so callers don't have to thread it through manually.
    """

    def _check(
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
        # We receive the raw Request so we can pull any path param by name.
        request: "Request" = None,  # type: ignore[name-defined]  # injected below
    ):
        # Import here to avoid circular at module load time.
        from fastapi import Request  # noqa: PLC0415

        if request is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Permission check misconfigured",
            )

        raw_org_id = request.path_params.get(org_id_param)
        if raw_org_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Path parameter '{org_id_param}' not found",
            )

        try:
            oid = int(raw_org_id)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid org_id: {raw_org_id}",
            )

        role = get_org_role(current_user.id, oid, db)
        if not has_permission(role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: '{permission}' required",
            )

    # FastAPI needs Request to be a proper typed parameter — wire it in.
    import inspect
    from fastapi import Request

    sig = inspect.signature(_check)
    params = list(sig.parameters.values())
    # Replace the placeholder `request: "Request" = None` with a real typed param.
    new_params = []
    for p in params:
        if p.name == "request":
            new_params.append(
                p.replace(annotation=Request, default=inspect.Parameter.empty)
            )
        else:
            new_params.append(p)
    _check.__signature__ = sig.replace(parameters=new_params)

    return _check
