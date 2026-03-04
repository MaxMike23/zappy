import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID
from app.extensions import db


class TimeLog(db.Model):
    """
    Technician time tracking per work order.
    duration_minutes is computed from start/end but also stored for quick queries
    (handles edge case where end_time is added after the fact).
    """
    __tablename__ = "time_logs"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    work_order_id = db.Column(UUID(as_uuid=True), db.ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    start_time = db.Column(db.DateTime(timezone=True), nullable=False)
    # Null means clock is still running
    end_time = db.Column(db.DateTime(timezone=True), nullable=True)
    # Stored redundantly for fast aggregation queries
    duration_minutes = db.Column(db.Integer, nullable=True)

    notes = db.Column(db.Text, nullable=True)
    # Manager/admin approval workflow for payroll
    is_approved = db.Column(db.Boolean, nullable=False, default=False)
    approved_by_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = db.Column(db.DateTime(timezone=True), nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.Index("idx_time_logs_company", "company_id"),
        db.Index("idx_time_logs_work_order", "work_order_id"),
        db.Index("idx_time_logs_user", "user_id"),
        db.Index("idx_time_logs_start", "start_time"),
    )

    # Relationships
    work_order = db.relationship("WorkOrder", back_populates="time_logs")
    user = db.relationship("User", foreign_keys=[user_id], back_populates="time_logs")
    approved_by = db.relationship("User", foreign_keys=[approved_by_id])

    @property
    def is_running(self) -> bool:
        return self.end_time is None

    def compute_duration(self):
        """Compute and store duration in minutes. Call before committing when end_time is set."""
        if self.start_time and self.end_time:
            delta = self.end_time - self.start_time
            self.duration_minutes = int(delta.total_seconds() / 60)

    def to_dict(self):
        return {
            "id": str(self.id),
            "company_id": str(self.company_id),
            "work_order_id": str(self.work_order_id),
            "user_id": str(self.user_id),
            "user_name": self.user.full_name if self.user else None,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_minutes": self.duration_minutes,
            "is_running": self.is_running,
            "notes": self.notes,
            "is_approved": self.is_approved,
            "approved_by_id": str(self.approved_by_id) if self.approved_by_id else None,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "created_at": self.created_at.isoformat(),
        }
