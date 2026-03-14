import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.extensions import db


class DeviceCategory:
    DISPLAY = "display"
    PROCESSOR = "processor"
    MATRIX_SWITCHER = "matrix_switcher"
    AMPLIFIER = "amplifier"
    CAMERA = "camera"
    DSP = "dsp"
    CONTROL_PROCESSOR = "control_processor"
    NETWORK_SWITCH = "network_switch"
    OTHER = "other"

    ALL = [
        DISPLAY, PROCESSOR, MATRIX_SWITCHER, AMPLIFIER, CAMERA,
        DSP, CONTROL_PROCESSOR, NETWORK_SWITCH, OTHER,
    ]

    LABELS = {
        DISPLAY: "Display",
        PROCESSOR: "Processor / Scaler",
        MATRIX_SWITCHER: "Matrix Switcher",
        AMPLIFIER: "Amplifier",
        CAMERA: "Camera",
        DSP: "DSP / Audio Processor",
        CONTROL_PROCESSOR: "Control Processor",
        NETWORK_SWITCH: "Network Switch",
        OTHER: "Other",
    }


class DeviceTemplate(db.Model):
    """
    Company-contributed or globally shared device definitions.

    company_id = NULL  → global/shared record, visible to all tenants.
    company_id = <uuid> → company-private, visible only to that company.
    is_pending = True  → submitted for global approval, awaiting superadmin review.

    ports JSONB schema (array of objects):
        [
          {
            "id": str,           # client-generated UUID for stable React keys
            "label": str,        # e.g. "HDMI Out 1", "RS232 Port"
            "direction": str,    # "input" | "output"
            "signal_type": str,  # "Video" | "Audio" | "Control" | "Network" |
                                 # "Power" | "Data" | "Security" |
                                 # "Access Control" | "Fire" | "Other"
            "connector_type": str | null  # "HDMI" | "RS232" | "Dante" | etc.
          },
          ...
        ]
    """
    __tablename__ = "device_templates"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=True,  # NULL = global shared
    )
    make = db.Column(db.String(255), nullable=False)
    model = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(100), nullable=False, default=DeviceCategory.OTHER)
    notes = db.Column(db.Text, nullable=True)
    is_pending = db.Column(db.Boolean, nullable=False, default=False)
    ports = db.Column(JSONB, nullable=False, default=list)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.Index("idx_device_templates_company", "company_id"),
        db.Index("idx_device_templates_make_model", "make", "model"),
    )

    company = db.relationship("Company", foreign_keys=[company_id])

    def to_dict(self):
        return {
            "id": str(self.id),
            "company_id": str(self.company_id) if self.company_id else None,
            "make": self.make,
            "model": self.model,
            "category": self.category,
            "category_label": DeviceCategory.LABELS.get(self.category, self.category),
            "notes": self.notes,
            "is_pending": self.is_pending,
            "is_global": self.company_id is None and not self.is_pending,
            "ports": self.ports or [],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    def __repr__(self):
        return f"<DeviceTemplate {self.make} {self.model}>"
