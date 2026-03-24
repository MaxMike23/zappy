import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID
from app.extensions import db


CONNECTION_TYPES = [
    "HDMI", "SDI", "DisplayPort", "VGA", "DVI",
    "RS232", "RS485", "RS422",
    "RCA", "XLR", "TRS", "TS",
    "Dante", "AES67",
    "Cat6", "Cat6A", "Fiber",
    "Relay", "IR", "USB", "Other",
]


class DeviceConnection(db.Model):
    """
    A signal connection between two project device instances.

    source_port / destination_port store the port id from DeviceTemplate.ports.
    If the template had no ports, these can be null (generic connection).

    trade scopes the connection to a particular signal-flow canvas tab.
    When a source or destination device is deleted the FK is SET NULL
    so the connection record survives and can be cleaned up manually.
    """

    __tablename__ = "device_connections"

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
    trade = db.Column(db.String(50), nullable=True)

    source_device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("project_devices.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_port = db.Column(db.String(255), nullable=True)   # port id from template.ports

    destination_device_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("project_devices.id", ondelete="SET NULL"),
        nullable=True,
    )
    destination_port = db.Column(db.String(255), nullable=True)

    connection_type = db.Column(db.String(50), nullable=True)
    notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False,
        default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    __table_args__ = (
        db.Index("idx_device_connections_project", "project_id"),
        db.Index("idx_device_connections_company", "company_id"),
    )

    source_device = db.relationship("ProjectDevice", foreign_keys=[source_device_id])
    destination_device = db.relationship("ProjectDevice", foreign_keys=[destination_device_id])

    def to_dict(self):
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "company_id": str(self.company_id),
            "trade": self.trade,
            "source_device_id": str(self.source_device_id) if self.source_device_id else None,
            "source_port": self.source_port,
            "destination_device_id": str(self.destination_device_id) if self.destination_device_id else None,
            "destination_port": self.destination_port,
            "connection_type": self.connection_type,
            "notes": self.notes,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
