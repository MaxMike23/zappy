import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.extensions import db


class Company(db.Model):
    """
    The tenant anchor. Every piece of company data is isolated by company_id.
    Settings JSONB stores module toggles and UI preferences without schema changes.
    """
    __tablename__ = "companies"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = db.Column(db.String(255), nullable=False)
    # URL-safe identifier used in subdomains / slugs
    slug = db.Column(db.String(100), unique=True, nullable=False)
    subscription_plan = db.Column(db.String(50), nullable=False, default="starter")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    # Stores: { "timezone": "America/New_York", "date_format": "MM/DD/YYYY", ... }
    settings = db.Column(JSONB, nullable=False, default=dict)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    users = db.relationship("User", back_populates="company", lazy="dynamic")
    projects = db.relationship("Project", back_populates="company", lazy="dynamic")
    work_orders = db.relationship("WorkOrder", back_populates="company", lazy="dynamic")
    workflow_stages = db.relationship("WorkflowStage", back_populates="company", lazy="dynamic")
    workflow_fields = db.relationship("WorkflowFieldDefinition", back_populates="company", lazy="dynamic")
    modules = db.relationship("CompanyModule", back_populates="company", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "slug": self.slug,
            "subscription_plan": self.subscription_plan,
            "is_active": self.is_active,
            "settings": self.settings,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    def __repr__(self):
        return f"<Company {self.name}>"


class CompanyModule(db.Model):
    """
    Tracks which feature modules are enabled per company.
    Allows enabling/disabling CRM, invoicing, equipment, scheduling, etc.
    """
    __tablename__ = "company_modules"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    # Module keys: projects, work_orders, time_tracking, file_uploads, crm, invoicing, equipment, scheduling
    module_name = db.Column(db.String(50), nullable=False)
    is_enabled = db.Column(db.Boolean, nullable=False, default=False)
    # Optional per-module config (e.g., which fields are visible)
    config = db.Column(JSONB, nullable=False, default=dict)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("company_id", "module_name", name="uq_company_module"),
    )

    company = db.relationship("Company", back_populates="modules")

    def to_dict(self):
        return {
            "id": str(self.id),
            "company_id": str(self.company_id),
            "module_name": self.module_name,
            "is_enabled": self.is_enabled,
            "config": self.config,
        }
