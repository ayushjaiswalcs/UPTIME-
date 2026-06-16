"""In-process monitoring engine.

Runs real uptime checks without Celery/Redis so the app is fully functional in
local/single-process deployments. A background asyncio loop periodically checks
monitors that are due; new monitors are also checked immediately on creation.

Each check runs in a worker thread (via asyncio.to_thread) using synchronous
network + DB calls, which avoids mixing async DB sessions.

Supported monitor types: http, tcp, ssl, ping, dns, keyword
"""
import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import socket
import ssl
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlparse

import httpx

from core.config import settings
from database import SessionLocal
from models.monitor import Monitor
from models.monitor_log import MonitorLog
from models.incident import Incident
from models.notification import Notification
from models.webhook import WebhookEndpoint, WebhookDelivery
from models.maintenance_window import MaintenanceWindow

logger = logging.getLogger("uptime.monitoring")

TICK_SECONDS = 15
MAX_CONCURRENCY = 10
UPTIME_WINDOW_DAYS = 30


# --------------------------------------------------------------------------- #
# Network checks (synchronous, run inside a thread)
# --------------------------------------------------------------------------- #
def _check_http(monitor: Monitor):
    headers = {}
    if monitor.custom_headers:
        try:
            headers = json.loads(monitor.custom_headers)
        except (ValueError, TypeError):
            headers = {}
    start = time.monotonic()
    try:
        with httpx.Client(verify=False, follow_redirects=True, timeout=monitor.timeout) as client:
            kwargs = {"headers": headers}
            if monitor.request_body and monitor.http_method in ("POST", "PUT", "PATCH"):
                kwargs["content"] = monitor.request_body
            resp = client.request(monitor.http_method or "GET", monitor.target_url, **kwargs)
        elapsed = round((time.monotonic() - start) * 1000, 2)
        is_up = resp.status_code == monitor.expected_status_code
        error = None if is_up else f"Expected {monitor.expected_status_code}, got {resp.status_code}"
        return is_up, elapsed, resp.status_code, error
    except httpx.TimeoutException:
        return False, round((time.monotonic() - start) * 1000, 2), None, f"Timeout after {monitor.timeout}s"
    except Exception as exc:  # noqa: BLE001
        return False, round((time.monotonic() - start) * 1000, 2), None, str(exc)[:200]


def _check_keyword(monitor: Monitor):
    """HTTP check that additionally verifies a keyword is present in the response body."""
    headers = {}
    if monitor.custom_headers:
        try:
            headers = json.loads(monitor.custom_headers)
        except (ValueError, TypeError):
            headers = {}
    start = time.monotonic()
    keyword = monitor.keyword or ""
    try:
        with httpx.Client(verify=False, follow_redirects=True, timeout=monitor.timeout) as client:
            resp = client.get(monitor.target_url, headers=headers)
        elapsed = round((time.monotonic() - start) * 1000, 2)
        if resp.status_code != monitor.expected_status_code:
            return False, elapsed, resp.status_code, f"Status {resp.status_code} != expected {monitor.expected_status_code}"
        if keyword and keyword not in resp.text:
            return False, elapsed, resp.status_code, f"Keyword '{keyword}' not found in response"
        return True, elapsed, resp.status_code, None
    except httpx.TimeoutException:
        return False, round((time.monotonic() - start) * 1000, 2), None, f"Timeout after {monitor.timeout}s"
    except Exception as exc:  # noqa: BLE001
        return False, round((time.monotonic() - start) * 1000, 2), None, str(exc)[:200]


def _host_port(target: str, default_port: int):
    parsed = urlparse(target if "//" in target else f"//{target}")
    host = parsed.hostname or target
    return host, (parsed.port or default_port)


def _check_tcp(monitor: Monitor):
    host, port = _host_port(monitor.target_url, 80)
    start = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=monitor.timeout):
            elapsed = round((time.monotonic() - start) * 1000, 2)
            return True, elapsed, None, None
    except Exception as exc:  # noqa: BLE001
        return False, round((time.monotonic() - start) * 1000, 2), None, f"TCP connect failed: {str(exc)[:160]}"


def _check_ping(monitor: Monitor):
    """TCP-based connectivity check (ICMP requires root; TCP port 80/443 is a reliable proxy)."""
    target = monitor.target_url.strip()
    # Strip scheme for plain host checks
    parsed = urlparse(target if "//" in target else f"//{target}")
    host = parsed.hostname or target
    port = parsed.port or 80
    start = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=monitor.timeout):
            elapsed = round((time.monotonic() - start) * 1000, 2)
            return True, elapsed, None, None
    except socket.timeout:
        return False, round((time.monotonic() - start) * 1000, 2), None, f"Host unreachable (timeout {monitor.timeout}s)"
    except Exception as exc:  # noqa: BLE001
        return False, round((time.monotonic() - start) * 1000, 2), None, f"Ping failed: {str(exc)[:160]}"


def _check_ssl(monitor: Monitor):
    host, port = _host_port(monitor.target_url, 443)
    start = time.monotonic()
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((host, port), timeout=monitor.timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
        elapsed = round((time.monotonic() - start) * 1000, 2)
        not_after = cert.get("notAfter") if cert else None
        if not_after:
            expires = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
            days_left = (expires - datetime.now(timezone.utc)).days
            if days_left < 0:
                return False, elapsed, None, "SSL certificate has expired"
            if days_left <= 14:
                return True, elapsed, None, f"SSL certificate expires in {days_left} days"
        return True, elapsed, None, None
    except ssl.SSLError as exc:
        return False, round((time.monotonic() - start) * 1000, 2), None, f"SSL error: {str(exc)[:160]}"
    except Exception as exc:  # noqa: BLE001
        return False, round((time.monotonic() - start) * 1000, 2), None, f"SSL check failed: {str(exc)[:160]}"


def _check_dns(monitor: Monitor):
    """Resolve a hostname via DNS and verify it returns at least one result."""
    target = monitor.target_url.strip()
    # Strip scheme/path — keep only hostname
    parsed = urlparse(target if "//" in target else f"//{target}")
    host = parsed.hostname or target
    record_type = (monitor.dns_record_type or "A").upper()
    start = time.monotonic()
    try:
        if record_type in ("A", "AAAA"):
            family = socket.AF_INET6 if record_type == "AAAA" else socket.AF_INET
            results = socket.getaddrinfo(host, None, family)
            elapsed = round((time.monotonic() - start) * 1000, 2)
            if not results:
                return False, elapsed, None, f"DNS: no {record_type} records for {host}"
            return True, elapsed, None, None
        else:
            # For MX/CNAME/TXT we fall back to a plain A-record lookup as a connectivity proxy
            results = socket.getaddrinfo(host, None)
            elapsed = round((time.monotonic() - start) * 1000, 2)
            if not results:
                return False, elapsed, None, f"DNS resolution failed for {host}"
            return True, elapsed, None, None
    except socket.gaierror as exc:
        return False, round((time.monotonic() - start) * 1000, 2), None, f"DNS failed: {str(exc)[:160]}"
    except Exception as exc:  # noqa: BLE001
        return False, round((time.monotonic() - start) * 1000, 2), None, f"DNS check error: {str(exc)[:160]}"


def _is_private_target(target: str) -> bool:
    """Best-effort SSRF guard: resolve the host and flag private/loopback/
    link-local/reserved addresses (e.g. 127.0.0.1, 10.x, 169.254.169.254)."""
    parsed = urlparse(target if "//" in target else f"//{target}")
    host = parsed.hostname or target
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        # Unresolvable — let the actual check report the failure normally.
        return False
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return True
    return False


def run_check(monitor: Monitor):
    """Return (is_up, response_time_ms, http_status, error_message)."""
    if not settings.ALLOW_PRIVATE_TARGETS and _is_private_target(monitor.target_url):
        return False, 0.0, None, "Target resolves to a private/internal address (blocked)"
    mtype = (monitor.monitor_type or "http").lower()
    if mtype == "tcp":
        return _check_tcp(monitor)
    if mtype == "ssl":
        return _check_ssl(monitor)
    if mtype == "ping":
        return _check_ping(monitor)
    if mtype == "dns":
        return _check_dns(monitor)
    if mtype == "keyword":
        return _check_keyword(monitor)
    return _check_http(monitor)


# --------------------------------------------------------------------------- #
# Maintenance window check (synchronous)
# --------------------------------------------------------------------------- #
def _in_maintenance(db, monitor_id: int) -> bool:
    now = datetime.now(timezone.utc)
    windows = db.query(MaintenanceWindow).filter(
        MaintenanceWindow.starts_at <= now,
        MaintenanceWindow.ends_at >= now,
    ).all()
    for w in windows:
        if w.affected_monitors:
            try:
                ids = json.loads(w.affected_monitors)
                if monitor_id in ids:
                    return True
            except (ValueError, TypeError):
                pass
    return False


# --------------------------------------------------------------------------- #
# Webhook delivery (synchronous)
# --------------------------------------------------------------------------- #
def _deliver_webhooks(db, user_id: int, event: str, payload: dict) -> None:
    endpoints = db.query(WebhookEndpoint).filter(
        WebhookEndpoint.user_id == user_id,
        WebhookEndpoint.is_active.is_(True),
    ).all()
    payload_json = json.dumps(payload)
    for ep in endpoints:
        # Filter by subscribed events
        if ep.events:
            try:
                subscribed = json.loads(ep.events)
                if event not in subscribed:
                    continue
            except (ValueError, TypeError):
                pass
        headers = {"Content-Type": "application/json", "X-Uptime-Event": event}
        if ep.secret:
            sig = hmac.new(ep.secret.encode(), payload_json.encode(), hashlib.sha256).hexdigest()
            headers["X-Uptime-Signature"] = f"sha256={sig}"
        success = False
        resp_status = None
        resp_body = None
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.post(ep.url, content=payload_json, headers=headers)
            resp_status = resp.status_code
            resp_body = resp.text[:500]
            success = 200 <= resp.status_code < 300
        except Exception as exc:  # noqa: BLE001
            resp_body = str(exc)[:500]
        db.add(WebhookDelivery(
            endpoint_id=ep.id, event=event, payload=payload_json,
            response_status=resp_status, response_body=resp_body, success=success,
        ))
        ep.last_triggered_at = datetime.now(timezone.utc)
    db.commit()


# --------------------------------------------------------------------------- #
# Persisting a check result + incident lifecycle (synchronous, own DB session)
# --------------------------------------------------------------------------- #
def _recalculate_uptime(db, monitor):
    since = datetime.now(timezone.utc) - timedelta(days=UPTIME_WINDOW_DAYS)
    total = db.query(MonitorLog).filter(MonitorLog.monitor_id == monitor.id, MonitorLog.checked_at >= since).count()
    up = db.query(MonitorLog).filter(
        MonitorLog.monitor_id == monitor.id, MonitorLog.checked_at >= since, MonitorLog.is_up.is_(True)
    ).count()
    if total > 0:
        monitor.uptime_percentage = f"{(up / total * 100):.2f}"


def _get_alert_threshold(monitor: Monitor) -> int:
    return max(1, monitor.alert_threshold or 1)


def check_monitor(monitor_id: int) -> None:
    """Run a single check and persist its result. Safe to call from a thread."""
    db = SessionLocal()
    try:
        monitor = db.query(Monitor).filter(Monitor.id == monitor_id).first()
        if not monitor or monitor.is_paused:
            return

        # Skip checks during active maintenance windows
        if _in_maintenance(db, monitor_id):
            logger.debug("Monitor %s skipped (maintenance window)", monitor_id)
            return

        is_up, response_time, http_status, error = run_check(monitor)
        now = datetime.now(timezone.utc)

        db.add(MonitorLog(
            monitor_id=monitor.id,
            response_time=response_time,
            http_status=http_status,
            is_up=is_up,
            error_message=error,
            checked_at=now,
        ))

        previous_status = monitor.current_status
        monitor.current_status = "up" if is_up else "down"
        monitor.last_checked_at = now

        # Track consecutive failure count
        if not is_up:
            monitor.failure_count = (monitor.failure_count or 0) + 1
        else:
            monitor.failure_count = 0

        _recalculate_uptime(db, monitor)

        threshold = _get_alert_threshold(monitor)

        # Trigger a new incident exactly when consecutive failures hit the threshold.
        # Using == (not >=) means we fire once per outage: on the N-th failure.
        # On subsequent failures failure_count > threshold so the condition stays False
        # until the monitor recovers (resetting failure_count to 0).
        if not is_up and monitor.failure_count == threshold:
            db.add(Incident(monitor_id=monitor.id, error_message=error, incident_status="ongoing", outage_start_time=now))
            db.flush()
            _send_alerts(db, monitor, "down", error)
            _deliver_webhooks(db, monitor.user_id, "monitor.down", {
                "event": "monitor.down",
                "monitor_id": monitor.id,
                "monitor_name": monitor.monitor_name,
                "error": error,
                "timestamp": now.isoformat(),
            })
        elif previous_status == "down" and is_up:
            open_incident = db.query(Incident).filter(
                Incident.monitor_id == monitor.id, Incident.incident_status == "ongoing"
            ).first()
            if open_incident:
                open_incident.incident_status = "resolved"
                open_incident.recovery_time = now
            _send_alerts(db, monitor, "up", None)
            _deliver_webhooks(db, monitor.user_id, "monitor.up", {
                "event": "monitor.up",
                "monitor_id": monitor.id,
                "monitor_name": monitor.monitor_name,
                "timestamp": now.isoformat(),
            })

        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.warning("Check failed for monitor %s: %s", monitor_id, exc)
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Alert dispatching (synchronous, called within check_monitor's DB session)
# --------------------------------------------------------------------------- #
def _send_alerts(db, monitor: Monitor, status: str, error: Optional[str]) -> None:
    from core.email import send_email, smtp_configured
    notifications = db.query(Notification).filter(
        Notification.user_id == monitor.user_id,
        Notification.enabled.is_(True),
    ).all()
    subject = f"[Uptime] {monitor.monitor_name} is {'DOWN' if status == 'down' else 'back UP'}"
    body_lines = [
        f"Monitor: {monitor.monitor_name}",
        f"URL: {monitor.target_url}",
        f"Status: {'DOWN' if status == 'down' else 'UP'}",
    ]
    if error:
        body_lines.append(f"Error: {error}")
    body = "\n".join(body_lines)

    for n in notifications:
        try:
            ntype = n.notification_type.lower()
            if ntype == "email" and smtp_configured():
                send_email(n.destination, subject, body)
            elif ntype == "telegram":
                _send_telegram(n.destination, body)
            elif ntype in ("slack", "discord"):
                _send_slack_discord(n.destination, body)
            elif ntype == "webhook":
                _send_custom_webhook(n.destination, {
                    "monitor_name": monitor.monitor_name,
                    "status": status,
                    "error": error,
                })
        except Exception as exc:  # noqa: BLE001
            logger.warning("Alert send failed (%s) for monitor %s: %s", n.notification_type, monitor.id, exc)


def _send_telegram(chat_id: str, text: str) -> None:
    from core.config import settings
    if not settings.TELEGRAM_BOT_TOKEN:
        return
    with httpx.Client(timeout=10) as client:
        client.post(
            f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": text},
        )


def _send_slack_discord(webhook_url: str, text: str) -> None:
    with httpx.Client(timeout=10) as client:
        client.post(webhook_url, json={"text": text})


def _send_custom_webhook(url: str, payload: dict) -> None:
    with httpx.Client(timeout=10) as client:
        client.post(url, json=payload)


# --------------------------------------------------------------------------- #
# Background loop
# --------------------------------------------------------------------------- #
def _due_monitor_ids():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due = []
        for m in db.query(Monitor).filter(Monitor.is_paused.is_(False)).all():
            if m.last_checked_at is None:
                due.append(m.id)
                continue
            last = m.last_checked_at
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if (now - last).total_seconds() >= m.interval:
                due.append(m.id)
        return due
    finally:
        db.close()


async def _run_due_checks():
    due = await asyncio.to_thread(_due_monitor_ids)
    if not due:
        return
    sem = asyncio.Semaphore(MAX_CONCURRENCY)

    async def guarded(mid):
        async with sem:
            await asyncio.to_thread(check_monitor, mid)

    await asyncio.gather(*(guarded(mid) for mid in due))


async def monitoring_loop():
    logger.info("Monitoring engine started (tick=%ss)", TICK_SECONDS)
    while True:
        try:
            await _run_due_checks()
        except asyncio.CancelledError:
            logger.info("Monitoring engine stopped")
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("Monitoring loop error: %s", exc)
        await asyncio.sleep(TICK_SECONDS)
