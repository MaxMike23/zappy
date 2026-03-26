import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.extensions import db


class SignalDiagram(db.Model):
    """
    Per-trade, per-project drawing metadata for the signal flow diagram.

    One record per (project_id, trade) pair — upserted via PUT endpoint.
    company_name_override is optional; when null the company's actual name is used.
    drawing_date defaults to today when first created.
    """

    __tablename__ = "signal_diagrams"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    company_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )
    trade = db.Column(db.String(50), nullable=False)

    drawing_title = db.Column(db.String(255), nullable=True)
    location = db.Column(db.String(255), nullable=True)
    company_name_override = db.Column(db.String(255), nullable=True)
    revision = db.Column(db.String(50), nullable=True)
    drawn_by = db.Column(db.String(255), nullable=True)
    drawing_date = db.Column(db.Date, nullable=True)

    # Stub/floating endpoint nodes (Features 4 & 8)
    # [{ "id": str, "label": str, "note": str|null, "position": { "x": float, "y": float } }, ...]
    stub_nodes = db.Column(JSONB, nullable=False, default=list)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False,
        default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    __table_args__ = (
        db.UniqueConstraint("project_id", "trade", name="uq_signal_diagram_project_trade"),
        db.Index("idx_signal_diagrams_project", "project_id"),
    )

    def to_dict(self):
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "trade": self.trade,
            "drawing_title": self.drawing_title,
            "location": self.location,
            "company_name_override": self.company_name_override,
            "revision": self.revision,
            "drawn_by": self.drawn_by,
            "drawing_date": self.drawing_date.isoformat() if self.drawing_date else None,
            "stub_nodes": self.stub_nodes or [],
        }
