import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.extensions import db


class Project(db.Model):
    """
    Top-level container for a client engagement (install, service contract, event).
    Work orders live under projects. Projects reference a WorkflowStage for status.
    custom_fields stores values for company-defined WorkflowFieldDefinition(module='project').
    """
    __tablename__ = "projects"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)

    # Client info — Phase 1 stores as plain text; Phase 2 links to a clients table
    client_name = db.Column(db.String(255), nullable=True)
    client_email = db.Column(db.String(255), nullable=True)
    client_phone = db.Column(db.String(50), nullable=True)

    # Stage in the company's project workflow
    stage_id = db.Column(UUID(as_uuid=True), db.ForeignKey("workflow_stages.id", ondelete="SET NULL"), nullable=True)

    # Who owns this project
    manager_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Job site location
    site_address = db.Column(db.String(500), nullable=True)
    site_city = db.Column(db.String(100), nullable=True)
    site_state = db.Column(db.String(50), nullable=True)
    site_zip = db.Column(db.String(20), nullable=True)
    # Lat/lng for future map view
    site_lat = db.Column(db.Numeric(10, 7), nullable=True)
    site_lng = db.Column(db.Numeric(10, 7), nullable=True)

    start_date = db.Column(db.Date, nullable=True)
    end_date = db.Column(db.Date, nullable=True)

    # Company-defined custom field values: { "field_key": value, ... }
    custom_fields = db.Column(JSONB, nullable=False, default=dict)

    is_archived = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.Index("idx_projects_company", "company_id"),
        db.Index("idx_projects_stage", "stage_id"),
        db.Index("idx_projects_manager", "manager_id"),
    )

    # Relationships
    company = db.relationship("Company", back_populates="projects")
    stage = db.relationship("WorkflowStage", foreign_keys=[stage_id])
    manager = db.relationship("User", foreign_keys=[manager_id])
    created_by = db.relationship("User", foreign_keys=[created_by_id])
    work_orders = db.relationship("WorkOrder", back_populates="project", lazy="dynamic")
    files = db.relationship("UploadedFile", back_populates="project", lazy="dynamic")

    def to_dict(self, include_work_order_count=False):
        data = {
            "id": str(self.id),
            "company_id": str(self.company_id),
            "name": self.name,
            "description": self.description,
            "client_name": self.client_name,
            "client_email": self.client_email,
            "client_phone": self.client_phone,
            "stage_id": str(self.stage_id) if self.stage_id else None,
            "stage": self.stage.to_dict() if self.stage else None,
            "manager_id": str(self.manager_id) if self.manager_id else None,
            "manager": {"id": str(self.manager.id), "full_name": self.manager.full_name} if self.manager else None,
            "site_address": self.site_address,
            "site_city": self.site_city,
            "site_state": self.site_state,
            "site_zip": self.site_zip,
            "site_lat": float(self.site_lat) if self.site_lat else None,
            "site_lng": float(self.site_lng) if self.site_lng else None,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "custom_fields": self.custom_fields,
            "is_archived": self.is_archived,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
        if include_work_order_count:
            data["work_order_count"] = self.work_orders.count()
        return data

    def __repr__(self):
        return f"<Project {self.name}>"
