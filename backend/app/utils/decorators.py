import uuid
from functools import wraps
from flask import jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from app.models.user import UserRole


def require_role(*roles):
    """
    Decorator to enforce role-based access control.
    Usage: @require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER)
    Also validates the JWT is present (wraps jwt_required).
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            if claims.get("role") not in roles:
                return jsonify({"error": "Insufficient permissions"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def get_current_user_id() -> uuid.UUID:
    """Returns the current user's UUID from the JWT identity."""
    return uuid.UUID(get_jwt_identity())


def get_current_company_id():
    """
    Returns the current user's company UUID, or None for superadmins.
    Superadmins bypass tenant isolation — use get_target_company_id() in routes
    that accept a company_id parameter.
    """
    claims = get_jwt()
    cid = claims.get("company_id")
    return uuid.UUID(cid) if cid else None


def get_current_role() -> str:
    return get_jwt().get("role")


def is_superadmin() -> bool:
    return get_current_role() == UserRole.SUPERADMIN


def company_id_for_query():
    """
    Returns company_id to use for DB filtering.
    Superadmins get None (no filter). All others get their company_id.
    Routes that handle superadmin cross-tenant access should use this.
    """
    if is_superadmin():
        return None
    return get_current_company_id()
