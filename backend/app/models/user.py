import uuid
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy.dialects.postgresql import UUID
from app.extensions import db


class UserRole:
    SUPERADMIN = "superadmin"      # Zappy platform admin — cross-tenant
    COMPANY_ADMIN = "company_admin" # Full company access
    MANAGER = "manager"             # Project/WO management
    TECHNICIAN = "technician"       # Field tech — limited write access
    SALES = "sales"                 # CRM/sales module access

    ALL = [SUPERADMIN, COMPANY_ADMIN, MANAGER, TECHNICIAN, SALES]
    STAFF = [COMPANY_ADMIN, MANAGER, TECHNICIAN, SALES]
    ADMIN_ROLES = [SUPERADMIN, COMPANY_ADMIN]


class User(db.Model):
    """
    Platform users. Superadmins have company_id=None and bypass tenant filters.
    All other roles are scoped to exactly one company.
    """
    __tablename__ = "users"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Null only for superadmins
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(50), nullable=False, default=UserRole.TECHNICIAN)
    phone = db.Column(db.String(30), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    company = db.relationship("Company", back_populates="users")
    # foreign_keys must be specified because TimeLog has two FKs to users
    # (user_id and approved_by_id) — SQLAlchemy can't infer which one to use.
    time_logs = db.relationship(
        "TimeLog",
        back_populates="user",
        lazy="dynamic",
        foreign_keys="TimeLog.user_id",
    )

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    def to_dict(self, include_sensitive=False):
        data = {
            "id": str(self.id),
            "company_id": str(self.company_id) if self.company_id else None,
            "email": self.email,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": self.full_name,
            "role": self.role,
            "phone": self.phone,
            "is_active": self.is_active,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "created_at": self.created_at.isoformat(),
        }
        return data

    def __repr__(self):
        return f"<User {self.email}>"


class TokenBlocklist(db.Model):
    """
    Stores revoked JWT JTIs so logout is enforced.
    Clean up entries older than the max token TTL via a scheduled job.
    """
    __tablename__ = "token_blocklist"

    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(36), nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f"<TokenBlocklist {self.jti}>"
