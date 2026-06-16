"""Performance indexes for hot query paths

Revision ID: 003
Revises: 002
Create Date: 2026-06-16 00:00:00.000000

Adds composite indexes that back the dashboard charts, uptime recalculation,
log views, recent-incident listings and the open-incident lookup. Without
these, every dashboard load and every monitoring tick table-scans monitor_logs
and incidents, which collapses under real check volume.
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def _index_exists(table, name):
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return any(ix["name"] == name for ix in insp.get_indexes(table))


def _create(table, name, cols):
    if not _index_exists(table, name):
        op.create_index(name, table, cols)


def upgrade():
    _create("monitor_logs", "ix_monitor_logs_monitor_checked", ["monitor_id", "checked_at"])
    _create("incidents", "ix_incidents_monitor_start", ["monitor_id", "outage_start_time"])
    _create("incidents", "ix_incidents_monitor_status", ["monitor_id", "incident_status"])
    # API-key auth (when wired up) looks keys up by their prefix.
    _create("api_keys", "ix_api_keys_key_prefix", ["key_prefix"])
    # Per-user audit log listing, newest first.
    _create("audit_logs", "ix_audit_logs_user_created", ["user_id", "created_at"])


def downgrade():
    for table, name in [
        ("audit_logs", "ix_audit_logs_user_created"),
        ("api_keys", "ix_api_keys_key_prefix"),
        ("incidents", "ix_incidents_monitor_status"),
        ("incidents", "ix_incidents_monitor_start"),
        ("monitor_logs", "ix_monitor_logs_monitor_checked"),
    ]:
        if _index_exists(table, name):
            op.drop_index(name, table_name=table)
