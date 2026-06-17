import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.audit import log_action
from core.deps import get_db, get_current_user
from models.audit_log import AuditLog
from models.incident import Incident
from models.monitor import Monitor
from models.monitor_log import MonitorLog
from models.organization import Organization, TeamMember
from models.user import User
from schemas.organization import OrgCreate, OrgOut, OrgUpdate, MemberOut, InviteMember, UpdateMemberRole

router = APIRouter(prefix="/organizations", tags=["organizations"])

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{1,98}[a-z0-9]$")


def _validate_slug(slug: str) -> None:
    if not _SLUG_RE.match(slug):
        raise HTTPException(status_code=422, detail="Slug must be lowercase alphanumeric with hyphens")


@router.get("", response_model=List[OrgOut])
def list_orgs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    owned = db.query(Organization).filter(Organization.owner_id == current_user.id).all()
    member_org_ids = [m.org_id for m in db.query(TeamMember).filter(TeamMember.user_id == current_user.id).all()]
    member_orgs = db.query(Organization).filter(Organization.id.in_(member_org_ids)).all() if member_org_ids else []
    seen = {o.id for o in owned}
    return owned + [o for o in member_orgs if o.id not in seen]


@router.post("", response_model=OrgOut, status_code=201)
def create_org(data: OrgCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _validate_slug(data.slug)
    if db.query(Organization).filter(Organization.slug == data.slug).first():
        raise HTTPException(status_code=400, detail="Slug already taken")
    org = Organization(name=data.name, slug=data.slug, owner_id=current_user.id, logo_url=data.logo_url)
    db.add(org)
    db.flush()
    db.add(TeamMember(org_id=org.id, user_id=current_user.id, role="owner"))
    log_action(db, user_id=current_user.id, action="org.create", resource_type="organization",
               resource_id=org.id, details={"name": data.name, "slug": data.slug})
    db.commit()
    db.refresh(org)
    return org


@router.get("/{org_id}", response_model=OrgOut)
def get_org(org_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    org = _get_accessible_org(org_id, current_user.id, db)
    return org


@router.put("/{org_id}", response_model=OrgOut)
def update_org(org_id: int, data: OrgUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    org = _get_owned_org(org_id, current_user.id, db)
    if data.name:
        org.name = data.name
    if data.logo_url is not None:
        org.logo_url = data.logo_url
    db.commit()
    db.refresh(org)
    return org


@router.delete("/{org_id}", status_code=204)
def delete_org(org_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    org = _get_owned_org(org_id, current_user.id, db)
    log_action(db, user_id=current_user.id, action="org.delete", resource_type="organization",
               resource_id=org.id, details={"name": org.name})
    db.delete(org)
    db.commit()


@router.get("/{org_id}/members", response_model=List[MemberOut])
def list_members(org_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_accessible_org(org_id, current_user.id, db)
    members = db.query(TeamMember).filter(TeamMember.org_id == org_id).all()
    result = []
    for m in members:
        user = db.query(User).filter(User.id == m.user_id).first()
        out = MemberOut.model_validate(m)
        if user:
            out.user_name = user.name
            out.user_email = user.email
        result.append(out)
    return result


@router.post("/{org_id}/members", status_code=201)
def invite_member(org_id: int, data: InviteMember, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_owned_or_admin_org(org_id, current_user.id, db)
    target = db.query(User).filter(User.email == data.email).first()
    if not target:
        raise HTTPException(status_code=404, detail="No user found with that email")
    exists = db.query(TeamMember).filter(TeamMember.org_id == org_id, TeamMember.user_id == target.id).first()
    if exists:
        raise HTTPException(status_code=400, detail="User is already a member")
    db.add(TeamMember(org_id=org_id, user_id=target.id, role=data.role, invited_by=current_user.id))
    log_action(db, user_id=current_user.id, action="org.member.invite", resource_type="organization",
               resource_id=org_id, details={"invited_email": data.email, "role": data.role, "invited_user_id": target.id})
    db.commit()
    return {"message": f"{target.name} added to organization"}


@router.put("/{org_id}/members/{member_id}")
def update_member_role(org_id: int, member_id: int, data: UpdateMemberRole, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_owned_org(org_id, current_user.id, db)
    member = db.query(TeamMember).filter(TeamMember.id == member_id, TeamMember.org_id == org_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    old_role = member.role
    member.role = data.role
    log_action(db, user_id=current_user.id, action="org.member.role_change", resource_type="team_member",
               resource_id=member_id, details={"old_role": old_role, "new_role": data.role})
    db.commit()
    return {"role": member.role}


@router.delete("/{org_id}/members/{member_id}", status_code=204)
def remove_member(org_id: int, member_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_owned_or_admin_org(org_id, current_user.id, db)
    member = db.query(TeamMember).filter(TeamMember.id == member_id, TeamMember.org_id == org_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    log_action(db, user_id=current_user.id, action="org.member.remove", resource_type="team_member",
               resource_id=member_id, details={"removed_user_id": member.user_id})
    db.delete(member)
    db.commit()


# ── Analytics endpoints ────────────────────────────────────────────────────────

@router.get("/{org_id}/stats")
def get_org_stats(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    High-level stats for an organisation:
    total_monitors, active_monitors, down_monitors, total_members,
    monthly_incidents, sla_score (avg uptime last 30d), avg_response_time.
    """
    _get_accessible_org(org_id, current_user.id, db)

    member_user_ids = [
        m.user_id
        for m in db.query(TeamMember).filter(TeamMember.org_id == org_id).all()
    ]

    # Monitors in scope: org-assigned OR user-owned by org members
    monitors = (
        db.query(Monitor)
        .filter(
            (Monitor.org_id == org_id)
            | (
                (Monitor.org_id.is_(None))
                & (Monitor.user_id.in_(member_user_ids))
            )
        )
        .all()
    )

    total_monitors = len(monitors)
    active_monitors = sum(1 for m in monitors if not m.is_paused and m.current_status != "paused")
    down_monitors = sum(1 for m in monitors if m.current_status == "down")
    total_members = len(member_user_ids)

    since_30 = datetime.now(timezone.utc) - timedelta(days=30)
    monitor_ids = [m.id for m in monitors]

    monthly_incidents = (
        db.query(Incident)
        .filter(
            Incident.monitor_id.in_(monitor_ids),
            Incident.outage_start_time >= since_30,
        )
        .count()
        if monitor_ids
        else 0
    )

    # SLA score — average uptime over last 30 days across all monitors
    sla_scores: list[float] = []
    for mon in monitors:
        logs = (
            db.query(MonitorLog)
            .filter(MonitorLog.monitor_id == mon.id, MonitorLog.checked_at >= since_30)
            .all()
        )
        if logs:
            up = sum(1 for l in logs if l.is_up)
            sla_scores.append(up / len(logs) * 100)

    sla_score = round(sum(sla_scores) / len(sla_scores), 4) if sla_scores else 100.0

    # Avg response time
    all_rt: list[float] = []
    for mon in monitors:
        logs = (
            db.query(MonitorLog)
            .filter(MonitorLog.monitor_id == mon.id, MonitorLog.checked_at >= since_30)
            .all()
        )
        all_rt.extend(l.response_time for l in logs if l.response_time is not None)

    avg_response_time = round(sum(all_rt) / len(all_rt), 2) if all_rt else 0.0

    return {
        "total_monitors": total_monitors,
        "active_monitors": active_monitors,
        "down_monitors": down_monitors,
        "total_members": total_members,
        "monthly_incidents": monthly_incidents,
        "sla_score": sla_score,
        "avg_response_time": avg_response_time,
    }


@router.get("/{org_id}/analytics")
def get_org_analytics(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Detailed analytics for the last 30 days:
    - uptime_trend: daily uptime % per day
    - incident_trend: daily incident count
    - top_failing: top 5 monitors by incident count
    - member_activity: audit log action count per member
    """
    _get_accessible_org(org_id, current_user.id, db)

    member_user_ids = [
        m.user_id
        for m in db.query(TeamMember).filter(TeamMember.org_id == org_id).all()
    ]

    monitors = (
        db.query(Monitor)
        .filter(
            (Monitor.org_id == org_id)
            | (
                (Monitor.org_id.is_(None))
                & (Monitor.user_id.in_(member_user_ids))
            )
        )
        .all()
    )
    monitor_ids = [m.id for m in monitors]
    monitor_name_map = {m.id: m.monitor_name for m in monitors}

    since_30 = datetime.now(timezone.utc) - timedelta(days=30)
    now = datetime.now(timezone.utc)

    # ── uptime_trend: last 30 days, one data point per day ─────────────────
    uptime_trend: list[dict] = []
    for day_offset in range(29, -1, -1):
        day_start = (now - timedelta(days=day_offset)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        day_end = day_start + timedelta(days=1)
        day_logs = []
        for mid in monitor_ids:
            day_logs += (
                db.query(MonitorLog)
                .filter(
                    MonitorLog.monitor_id == mid,
                    MonitorLog.checked_at >= day_start,
                    MonitorLog.checked_at < day_end,
                )
                .all()
            )
        total = len(day_logs)
        up = sum(1 for l in day_logs if l.is_up)
        uptime_pct = round((up / total * 100) if total else 100.0, 2)
        uptime_trend.append(
            {
                "date": day_start.strftime("%Y-%m-%d"),
                "uptime_pct": uptime_pct,
                "total_checks": total,
            }
        )

    # ── incident_trend: last 30 days, one count per day ────────────────────
    incident_trend: list[dict] = []
    if monitor_ids:
        incidents_30 = (
            db.query(Incident)
            .filter(
                Incident.monitor_id.in_(monitor_ids),
                Incident.outage_start_time >= since_30,
            )
            .all()
        )
        day_counts: dict[str, int] = {}
        for inc in incidents_30:
            start = inc.outage_start_time
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            day_key = start.strftime("%Y-%m-%d")
            day_counts[day_key] = day_counts.get(day_key, 0) + 1
        for day_offset in range(29, -1, -1):
            day_label = (now - timedelta(days=day_offset)).strftime("%Y-%m-%d")
            incident_trend.append(
                {"date": day_label, "incident_count": day_counts.get(day_label, 0)}
            )
    else:
        for day_offset in range(29, -1, -1):
            day_label = (now - timedelta(days=day_offset)).strftime("%Y-%m-%d")
            incident_trend.append({"date": day_label, "incident_count": 0})

    # ── top_failing: top 5 monitors by incident count in last 30 days ──────
    top_failing: list[dict] = []
    if monitor_ids:
        inc_counts: dict[int, int] = {}
        for inc in incidents_30:  # type: ignore[possibly-undefined]
            inc_counts[inc.monitor_id] = inc_counts.get(inc.monitor_id, 0) + 1
        sorted_ids = sorted(inc_counts, key=lambda mid: inc_counts[mid], reverse=True)[:5]
        for mid in sorted_ids:
            top_failing.append(
                {
                    "monitor_id": mid,
                    "monitor_name": monitor_name_map.get(mid, "Unknown"),
                    "incident_count": inc_counts[mid],
                }
            )

    # ── member_activity: audit log count per user in last 30 days ──────────
    member_activity: list[dict] = []
    if member_user_ids:
        activity_logs = (
            db.query(AuditLog)
            .filter(
                AuditLog.user_id.in_(member_user_ids),
                AuditLog.created_at >= since_30,
            )
            .all()
        )
        user_counts: dict[int, int] = {}
        for log in activity_logs:
            if log.user_id:
                user_counts[log.user_id] = user_counts.get(log.user_id, 0) + 1
        for uid in member_user_ids:
            u = db.query(User).filter(User.id == uid).first()
            member_activity.append(
                {
                    "user_id": uid,
                    "user_name": u.name if u else "Unknown",
                    "action_count": user_counts.get(uid, 0),
                }
            )
        member_activity.sort(key=lambda x: x["action_count"], reverse=True)

    return {
        "uptime_trend": uptime_trend,
        "incident_trend": incident_trend,
        "top_failing": top_failing,
        "member_activity": member_activity,
    }


# ── helpers ─────────────────────────────────────────────────────────────────
def _get_accessible_org(org_id: int, user_id: int, db: Session) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    is_member = db.query(TeamMember).filter(TeamMember.org_id == org_id, TeamMember.user_id == user_id).first()
    if not is_member and org.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return org


def _get_owned_org(org_id: int, user_id: int, db: Session) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id, Organization.owner_id == user_id).first()
    if not org:
        raise HTTPException(status_code=403, detail="Organization not found or access denied")
    return org


def _get_owned_or_admin_org(org_id: int, user_id: int, db: Session) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    member = db.query(TeamMember).filter(TeamMember.org_id == org_id, TeamMember.user_id == user_id).first()
    if not member or member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return org
