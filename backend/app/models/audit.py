import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.extensions import db


class AuditLog(db.Model):
    """
    Immutable audit trail for all significant actions.
    Never updated or deleted — append-only.
    changes JSONB stores { "before": {...}, "after": {...} } for update events.
    """
    __tablename__ = "audit_logs"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True)
    # Null if action was taken by the system (e.g., scheduled job)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Action verbs: created, updated, deleted, status_changed, login, logout, file_uploaded
    action = db.Column(db.String(50), nullable=False)
    # Entity types: company, user, project, work_order, time_log, file
    entity_type = db.Column(db.String(50), nullable=False)
    entity_id = db.Column(db.String(36), nullable=True)  # UUID string of affected record

    # { "before": { "stage_id": "abc" }, "after": { "stage_id": "xyz" } }
    changes = db.Column(JSONB, nullable=False, default=dict)

    ip_address = db.Column(db.String(45), nullable=True)  # IPv4 or IPv6
    user_agent = db.Column(db.String(500), nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.Index("idx_audit_company", "company_id"),
        db.Index("idx_audit_entity", "entity_type", "entity_id"),
        db.Index("idx_audit_user", "user_id"),
        db.Index("idx_audit_created", "created_at"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "company_id": str(self.company_id) if self.company_id else None,
            "user_id": str(self.user_id) if self.user_id else None,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "changes": self.changes,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat(),
        }
