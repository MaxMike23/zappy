import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID
from app.extensions import db

visit_assignments = db.Table(
    "visit_assignments",
    db.Column("visit_id", UUID(as_uuid=True), db.ForeignKey("visits.id", ondelete="CASCADE"), primary_key=True),
    db.Column("user_id",  UUID(as_uuid=True), db.ForeignKey("users.id",  ondelete="CASCADE"), primary_key=True),
)


class VisitStatus:
    SCHEDULED   = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED   = "completed"
    CANCELLED   = "cancelled"
    ALL = [SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED]


class Visit(db.Model):
    __tablename__ = "visits"

    id            = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id    = db.Column(UUID(as_uuid=True), db.ForeignKey("companies.id",   ondelete="CASCADE"),  nullable=False)
    work_order_id = db.Column(UUID(as_uuid=True), db.ForeignKey("work_orders.id", ondelete="CASCADE"),  nullable=True)
    project_id    = db.Column(UUID(as_uuid=True), db.ForeignKey("projects.id",    ondelete="CASCADE"),  nullable=True)
    created_by_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id",       ondelete="SET NULL"), nullable=True)

    title           = db.Column(db.String(255), nullable=False)
    scheduled_start = db.Column(db.DateTime(timezone=True), nullable=False)
    scheduled_end   = db.Column(db.DateTime(timezone=True), nullable=False)
    actual_start    = db.Column(db.DateTime(timezone=True), nullable=True)
    actual_end      = db.Column(db.DateTime(timezone=True), nullable=True)
    status          = db.Column(db.String(20), nullable=False, default=VisitStatus.SCHEDULED)
    notes           = db.Column(db.Text, nullable=True)
    created_at      = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.Index("idx_visits_company",    "company_id"),
        db.Index("idx_visits_work_order", "work_order_id"),
        db.Index("idx_visits_project",    "project_id"),
        db.Index("idx_visits_status",     "status"),
        db.Index("idx_visits_scheduled",  "scheduled_start"),
    )

    company    = db.relationship("Company",   foreign_keys=[company_id])
    work_order = db.relationship("WorkOrder", foreign_keys=[work_order_id], backref=db.backref("visits", lazy="dynamic"))
    project    = db.relationship("Project",   foreign_keys=[project_id],    backref=db.backref("visits", lazy="dynamic"))
    created_by = db.relationship("User",      foreign_keys=[created_by_id])
    assignees  = db.relationship("User", secondary="visit_assignments", lazy="joined",
                                 backref=db.backref("assigned_visits", lazy="dynamic"))

    @property
    def duration_minutes(self):
        if self.actual_start and self.actual_end:
            return int((self.actual_end - self.actual_start).total_seconds() / 60)
        return None

    @property
    def is_running(self):
        return self.actual_start is not None and self.actual_end is None

    def to_dict(self):
        return {
            "id": str(self.id),
            "company_id": str(self.company_id),
            "work_order_id": str(self.work_order_id) if self.work_order_id else None,
            "project_id":    str(self.project_id)    if self.project_id    else None,
            "created_by_id": str(self.created_by_id) if self.created_by_id else None,
            "title": self.title,
            "status": self.status,
            "notes": self.notes,
            "scheduled_start": self.scheduled_start.isoformat(),
            "scheduled_end":   self.scheduled_end.isoformat(),
            "actual_start":    self.actual_start.isoformat() if self.actual_start else None,
            "actual_end":      self.actual_end.isoformat()   if self.actual_end   else None,
            "duration_minutes": self.duration_minutes,
            "is_running": self.is_running,
            "assignees": [{"id": str(u.id), "full_name": u.full_name, "role": u.role} for u in self.assignees],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
