import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.extensions import db


# Association table: multiple technicians can be assigned to one work order
work_order_assignments = db.Table(
    "work_order_assignments",
    db.Column(
        "work_order_id",
        UUID(as_uuid=True),
        db.ForeignKey("work_orders.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    db.Column(
        "user_id",
        UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Priority:
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"
    ALL = [LOW, MEDIUM, HIGH, URGENT]


class WorkOrder(db.Model):
    """
    The core field-work entity. A work order is a specific job task under a project.
    Multiple techs can be assigned. Stage drives the Kanban/status view.
    custom_fields holds values for this company's WorkflowFieldDefinition(module='work_order').
    """
    __tablename__ = "work_orders"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    # Work orders can exist without a project (standalone service calls)
    project_id = db.Column(UUID(as_uuid=True), db.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)

    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)

    stage_id = db.Column(UUID(as_uuid=True), db.ForeignKey("workflow_stages.id", ondelete="SET NULL"), nullable=True)
    priority = db.Column(db.String(20), nullable=False, default=Priority.MEDIUM)

    created_by_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Scheduling
    scheduled_start = db.Column(db.DateTime(timezone=True), nullable=True)
    scheduled_end = db.Column(db.DateTime(timezone=True), nullable=True)

    # Site location (may differ from project location for multi-site jobs)
    site_address = db.Column(db.String(500), nullable=True)
    site_city = db.Column(db.String(100), nullable=True)
    site_state = db.Column(db.String(50), nullable=True)
    site_zip = db.Column(db.String(20), nullable=True)
    site_lat = db.Column(db.Numeric(10, 7), nullable=True)
    site_lng = db.Column(db.Numeric(10, 7), nullable=True)

    # Company-defined custom field values: { "site_contact": "John", "po_number": "PO-123" }
    custom_fields = db.Column(JSONB, nullable=False, default=dict)

    is_archived = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.Index("idx_wo_company", "company_id"),
        db.Index("idx_wo_project", "project_id"),
        db.Index("idx_wo_stage", "stage_id"),
        db.Index("idx_wo_scheduled", "scheduled_start"),
    )

    # Relationships
    company = db.relationship("Company", back_populates="work_orders")
    project = db.relationship("Project", back_populates="work_orders")
    stage = db.relationship("WorkflowStage", foreign_keys=[stage_id])
    created_by = db.relationship("User", foreign_keys=[created_by_id])
    # Many-to-many assigned technicians
    assignees = db.relationship(
        "User",
        secondary=work_order_assignments,
        lazy="joined",
        backref=db.backref("assigned_work_orders", lazy="dynamic"),
    )
    notes = db.relationship(
        "WorkOrderNote",
        back_populates="work_order",
        lazy="dynamic",
        cascade="all, delete-orphan",
        order_by="WorkOrderNote.created_at.asc()",
    )
    time_logs = db.relationship("TimeLog", back_populates="work_order", lazy="dynamic")
    files = db.relationship("UploadedFile", back_populates="work_order", lazy="dynamic")

    def to_dict(self, include_notes=False, include_time_summary=False):
        data = {
            "id": str(self.id),
            "company_id": str(self.company_id),
            "project_id": str(self.project_id) if self.project_id else None,
            "title": self.title,
            "description": self.description,
            "stage_id": str(self.stage_id) if self.stage_id else None,
            "stage": self.stage.to_dict() if self.stage else None,
            "priority": self.priority,
            "created_by_id": str(self.created_by_id) if self.created_by_id else None,
            "assignees": [
                {"id": str(u.id), "full_name": u.full_name, "role": u.role}
                for u in self.assignees
            ],
            "scheduled_start": self.scheduled_start.isoformat() if self.scheduled_start else None,
            "scheduled_end": self.scheduled_end.isoformat() if self.scheduled_end else None,
            "site_address": self.site_address,
            "site_city": self.site_city,
            "site_state": self.site_state,
            "site_zip": self.site_zip,
            "site_lat": float(self.site_lat) if self.site_lat else None,
            "site_lng": float(self.site_lng) if self.site_lng else None,
            "custom_fields": self.custom_fields,
            "is_archived": self.is_archived,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
        if include_notes:
            data["notes"] = [n.to_dict() for n in self.notes]
        if include_time_summary:
            total = sum(t.duration_minutes or 0 for t in self.time_logs)
            data["total_time_minutes"] = total
        return data


class WorkOrderNote(db.Model):
    """
    Field notes, status updates, and internal comments attached to a work order.
    is_internal=True notes are hidden from any future client portal.
    """
    __tablename__ = "work_order_notes"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_order_id = db.Column(UUID(as_uuid=True), db.ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False)
    author_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content = db.Column(db.Text, nullable=False)
    # Internal notes visible only to staff (not clients in Phase 2 portal)
    is_internal = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    work_order = db.relationship("WorkOrder", back_populates="notes")
    author = db.relationship("User")

    def to_dict(self):
        return {
            "id": str(self.id),
            "work_order_id": str(self.work_order_id),
            "author_id": str(self.author_id) if self.author_id else None,
            "author_name": self.author.full_name if self.author else "Unknown",
            "content": self.content,
            "is_internal": self.is_internal,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
