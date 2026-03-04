from flask import request
from app.extensions import db
from app.models.audit import AuditLog


def log_audit(
    action: str,
    entity_type: str,
    entity_id=None,
    company_id=None,
    user_id=None,
    changes: dict = None,
):
    """
    Records an audit log entry. Does NOT commit — caller must commit the session.

    action:      'created' | 'updated' | 'deleted' | 'status_changed' | 'login' | 'logout' | 'file_uploaded'
    entity_type: 'project' | 'work_order' | 'user' | 'time_log' | 'file' | etc.
    changes:     { "before": {...}, "after": {...} } for update events

    Usage:
        log_audit("created", "project", entity_id=project.id, company_id=..., user_id=...)
        db.session.commit()
    """
    log = AuditLog(
        company_id=company_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        changes=changes or {},
        ip_address=request.remote_addr if request else None,
        user_agent=request.headers.get("User-Agent", "")[:500] if request else None,
    )
    db.session.add(log)
