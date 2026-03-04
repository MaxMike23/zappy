import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.extensions import db


class WorkflowModule:
    """Which entity type a workflow stage or field applies to."""
    PROJECT = "project"
    WORK_ORDER = "work_order"
    ALL = [PROJECT, WORK_ORDER]


class FieldType:
    """Supported custom field types."""
    TEXT = "text"
    TEXTAREA = "textarea"
    NUMBER = "number"
    DATE = "date"
    SELECT = "select"
    MULTI_SELECT = "multi_select"
    CHECKBOX = "checkbox"
    CHECKLIST = "checklist"  # Ordered list of items, each with an individual checked state
    FILE = "file"
    URL = "url"
    ALL = [TEXT, TEXTAREA, NUMBER, DATE, SELECT, MULTI_SELECT, CHECKBOX, CHECKLIST, FILE, URL]


class WorkflowStage(db.Model):
    """
    Company-defined status stages (e.g., 'New', 'Scheduled', 'In Progress').
    Each company fully controls its own pipeline for each module.
    sort_order drives Kanban column ordering.
    """
    __tablename__ = "workflow_stages"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    module = db.Column(db.String(20), nullable=False)  # 'project' or 'work_order'
    name = db.Column(db.String(100), nullable=False)
    # URL-safe key used in code (never changes after creation)
    slug = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(20), nullable=False, default="#6B7280")  # Tailwind gray-500
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    # Terminal stages end the workflow (completed, cancelled). Used for reporting.
    is_terminal = db.Column(db.Boolean, nullable=False, default=False)
    # Marks the "done" / success terminal (vs cancelled)
    is_success = db.Column(db.Boolean, nullable=False, default=False)
    # Gate rules enforced before a work order/project can move INTO this stage.
    # Example: { "min_files": 1, "required_field_keys": ["rack_photo", "cable_label_photo"] }
    # Empty dict means no requirements. Enforcement logic added in Phase 2E.
    stage_requirements = db.Column(JSONB, nullable=False, default=dict)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("company_id", "module", "slug", name="uq_stage_company_module_slug"),
        db.Index("idx_stages_company_module", "company_id", "module"),
    )

    company = db.relationship("Company", back_populates="workflow_stages")

    def to_dict(self):
        return {
            "id": str(self.id),
            "company_id": str(self.company_id),
            "module": self.module,
            "name": self.name,
            "slug": self.slug,
            "color": self.color,
            "sort_order": self.sort_order,
            "is_terminal": self.is_terminal,
            "is_success": self.is_success,
            "stage_requirements": self.stage_requirements,
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self):
        return f"<WorkflowStage {self.module}:{self.name}>"


class WorkflowFieldDefinition(db.Model):
    """
    Company-defined custom fields for projects or work orders.
    The actual values are stored as JSONB on the entity (e.g., WorkOrder.custom_fields).

    Example: company defines a 'Site Contact Phone' text field for work orders.
    Each work order then stores: custom_fields = { "site_contact_phone": "555-1234" }
    """
    __tablename__ = "workflow_field_definitions"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    module = db.Column(db.String(20), nullable=False)  # 'project' or 'work_order'
    # Internal key used in custom_fields dict (snake_case, never changes)
    field_key = db.Column(db.String(100), nullable=False)
    # Display label shown to users
    field_label = db.Column(db.String(200), nullable=False)
    field_type = db.Column(db.String(30), nullable=False, default=FieldType.TEXT)
    # For SELECT/MULTI_SELECT: { "options": ["Option A", "Option B"] }
    # For NUMBER: { "unit": "hours", "min": 0 }
    field_config = db.Column(JSONB, nullable=False, default=dict)
    is_required = db.Column(db.Boolean, nullable=False, default=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("company_id", "module", "field_key", name="uq_field_company_module_key"),
        db.Index("idx_fields_company_module", "company_id", "module"),
    )

    company = db.relationship("Company", back_populates="workflow_fields")

    def to_dict(self):
        return {
            "id": str(self.id),
            "company_id": str(self.company_id),
            "module": self.module,
            "field_key": self.field_key,
            "field_label": self.field_label,
            "field_type": self.field_type,
            "field_config": self.field_config,
            "is_required": self.is_required,
            "sort_order": self.sort_order,
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self):
        return f"<WorkflowFieldDefinition {self.module}:{self.field_key}>"
