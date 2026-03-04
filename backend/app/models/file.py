import uuid
from datetime import datetime
from sqlalchemy.dialects.postgresql import UUID
from app.extensions import db


class UploadedFile(db.Model):
    """
    File/image attachments for work orders and projects.
    storage_path is relative to UPLOAD_FOLDER.
    Phase 2: swap storage_path for an S3 key and add a storage_backend column.
    """
    __tablename__ = "uploaded_files"

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = db.Column(UUID(as_uuid=True), db.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    # At least one of work_order_id or project_id must be set
    work_order_id = db.Column(UUID(as_uuid=True), db.ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=True)
    project_id = db.Column(UUID(as_uuid=True), db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)

    uploaded_by_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Original filename from the uploader
    original_filename = db.Column(db.String(255), nullable=False)
    # Path on disk relative to UPLOAD_FOLDER: "<company_id>/<entity>/<uuid>.<ext>"
    storage_path = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.Integer, nullable=True)  # bytes
    mime_type = db.Column(db.String(100), nullable=True)
    # Optional caption/description added by uploader
    caption = db.Column(db.String(500), nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.Index("idx_files_work_order", "work_order_id"),
        db.Index("idx_files_project", "project_id"),
    )

    # Relationships
    work_order = db.relationship("WorkOrder", back_populates="files")
    project = db.relationship("Project", back_populates="files")
    uploaded_by = db.relationship("User")

    def to_dict(self, include_url=False):
        data = {
            "id": str(self.id),
            "company_id": str(self.company_id),
            "work_order_id": str(self.work_order_id) if self.work_order_id else None,
            "project_id": str(self.project_id) if self.project_id else None,
            "uploaded_by_id": str(self.uploaded_by_id) if self.uploaded_by_id else None,
            "uploaded_by_name": self.uploaded_by.full_name if self.uploaded_by else None,
            "original_filename": self.original_filename,
            "file_size": self.file_size,
            "mime_type": self.mime_type,
            "caption": self.caption,
            "created_at": self.created_at.isoformat(),
        }
        if include_url:
            data["url"] = f"/api/files/{self.id}/download"
        return data
