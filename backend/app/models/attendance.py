import uuid
from datetime import date, datetime
from sqlalchemy.dialects.postgresql import UUID
from app.extensions import db


class Attendance(db.Model):
    """
    One record per user per calendar day.
    Tracks company-wide clock-in / clock-out (separate from per-visit clock-in/out).
    Feature is opt-in: enabled via company.settings['attendance_tracking'] = True.
    """
    __tablename__ = "attendances"

    id         = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    user_id    = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id",    ondelete="CASCADE"), nullable=False)
    date       = db.Column(db.Date, nullable=False)
    clock_in   = db.Column(db.DateTime(timezone=True), nullable=False)
    clock_out  = db.Column(db.DateTime(timezone=True), nullable=True)

    __table_args__ = (
        db.UniqueConstraint("company_id", "user_id", "date", name="uq_attendance_user_date"),
        db.Index("idx_attendance_company_date", "company_id", "date"),
        db.Index("idx_attendance_user", "user_id"),
    )

    user = db.relationship("User", foreign_keys=[user_id])

    @property
    def duration_minutes(self):
        if self.clock_in and self.clock_out:
            return int((self.clock_out - self.clock_in).total_seconds() / 60)
        return None

    @property
    def is_clocked_in(self):
        return self.clock_out is None

    def to_dict(self):
        return {
            "id": str(self.id),
            "company_id": str(self.company_id),
            "user_id": str(self.user_id),
            "user_name": self.user.full_name if self.user else None,
            "date": self.date.isoformat(),
            "clock_in": self.clock_in.isoformat(),
            "clock_out": self.clock_out.isoformat() if self.clock_out else None,
            "duration_minutes": self.duration_minutes,
            "is_clocked_in": self.is_clocked_in,
        }
