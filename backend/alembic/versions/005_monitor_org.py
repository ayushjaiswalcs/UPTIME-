"""Add org_id and created_by columns to monitors

Revision ID: 005
Revises: 004
Create Date: 2026-06-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade():
    dialect = op.get_bind().dialect.name

    if dialect == 'sqlite':
        with op.batch_alter_table('monitors') as batch:
            batch.add_column(
                sa.Column('org_id', sa.Integer(), nullable=True)
            )
            batch.add_column(
                sa.Column('created_by', sa.Integer(), nullable=True)
            )
            batch.create_foreign_key(
                'fk_monitors_org_id',
                'organizations',
                ['org_id'],
                ['id'],
            )
            batch.create_foreign_key(
                'fk_monitors_created_by',
                'users',
                ['created_by'],
                ['id'],
            )
    else:
        # PostgreSQL supports ADD COLUMN directly
        op.add_column(
            'monitors',
            sa.Column('org_id', sa.Integer(), nullable=True),
        )
        op.add_column(
            'monitors',
            sa.Column('created_by', sa.Integer(), nullable=True),
        )
        op.create_foreign_key(
            'fk_monitors_org_id',
            'monitors',
            'organizations',
            ['org_id'],
            ['id'],
            ondelete='SET NULL',
        )
        op.create_foreign_key(
            'fk_monitors_created_by',
            'monitors',
            'users',
            ['created_by'],
            ['id'],
            ondelete='SET NULL',
        )


def downgrade():
    dialect = op.get_bind().dialect.name

    if dialect == 'sqlite':
        with op.batch_alter_table('monitors') as batch:
            batch.drop_constraint('fk_monitors_org_id', type_='foreignkey')
            batch.drop_constraint('fk_monitors_created_by', type_='foreignkey')
            batch.drop_column('org_id')
            batch.drop_column('created_by')
    else:
        op.drop_constraint('fk_monitors_org_id', 'monitors', type_='foreignkey')
        op.drop_constraint('fk_monitors_created_by', 'monitors', type_='foreignkey')
        op.drop_column('monitors', 'org_id')
        op.drop_column('monitors', 'created_by')
