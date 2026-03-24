import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.extensions import db


class ProjectDevice(db.Model):
    """
    An instance of a DeviceTemplate attached to a specific project.

    Ports are inherited from DeviceTemplate.ports at read time — not duplicated
    on the instance. If a port is added to the template later it appears on all
    existing instances automatically.

    Capability flags on the linked template drive which fields are populated:
      has_ip      → ip_addresses list required; stream_urls optional
      has_web_gui → username, password required (only valid when has_ip)

    ip_addresses JSONB schema (one entry per network interface):
        [{ "label": str, "ip": str, "mac": str }, ...]
        e.g. [{"label": "Control", "ip": "192.168.1.10", "mac": "AA:BB:CC:DD:EE:FF"},
              {"label": "Dante",   "ip": "192.168.2.10", "mac": ""}]

    rs232_settings JSONB schema:
        { "port": str, "baud_rate": int, "data_bits": int,
          "parity": str, "stop_bits": float }

    node_position JSONB schema (Phase 3C signal flow canvas):
        { "Trade Name": { "x": float, "y": float }, ... }
    """

    __tablename__ = "project_devices"

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
    # Nullable so the instance survives if the template is later deleted
    template_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("device_templates.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Instance identity
    label = db.Column(db.String(255), nullable=True)  # e.g. "Main Display", "Rack AMP-1"

    # Physical location
    room = db.Column(db.String(255), nullable=True)
    rack_position = db.Column(db.String(100), nullable=True)

    # Network (populated when template.has_ip)
    ip_addresses = db.Column(JSONB, nullable=False, default=list)  # [{ label, ip, mac }]
    stream_urls = db.Column(JSONB, nullable=False, default=list)

    # Credentials (populated when template.has_web_gui)
    username = db.Column(db.String(255), nullable=True)
    password = db.Column(db.String(255), nullable=True)

    firmware_version = db.Column(db.String(100), nullable=True)

    # RS232 control settings (shown when template has RS232 control ports)
    rs232_settings = db.Column(JSONB, nullable=True)

    notes = db.Column(db.Text, nullable=True)

    # Phase 3C
    trade = db.Column(db.String(50), nullable=True)   # trade key e.g. "av", "security"
    node_position = db.Column(JSONB, nullable=True)    # { "av": { x, y }, "security": { x, y } }

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False,
        default=datetime.utcnow, onupdate=datetime.utcnow,
    )

    __table_args__ = (
        db.Index("idx_project_devices_project", "project_id"),
        db.Index("idx_project_devices_company", "company_id"),
        db.Index("idx_project_devices_template", "template_id"),
    )

    project = db.relationship("Project", foreign_keys=[project_id])
    company = db.relationship("Company", foreign_keys=[company_id])
    template = db.relationship("DeviceTemplate", foreign_keys=[template_id])

    def to_dict(self):
        t = self.template
        ports = (t.ports or []) if t else []
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "company_id": str(self.company_id),
            "template_id": str(self.template_id) if self.template_id else None,
            "template": t.to_dict() if t else None,
            "port_summary": {
                "inputs":  sum(1 for p in ports if p.get("direction") == "input"),
                "outputs": sum(1 for p in ports if p.get("direction") == "output"),
                "io":      sum(1 for p in ports if p.get("direction") == "io"),
            },
            "label": self.label,
            "room": self.room,
            "rack_position": self.rack_position,
            "ip_addresses": self.ip_addresses or [],
            "stream_urls": self.stream_urls or [],
            "username": self.username,
            "password": self.password,
            "firmware_version": self.firmware_version,
            "rs232_settings": self.rs232_settings,
            "notes": self.notes,
            "trade": self.trade,
            "node_position": self.node_position,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
