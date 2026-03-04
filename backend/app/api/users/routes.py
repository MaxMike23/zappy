from flask import request, jsonify
from flask_jwt_extended import jwt_required

from app.api.users import users_bp
from app.extensions import db
from app.models.user import User, UserRole
from app.utils.audit import log_audit
from app.utils.decorators import (
    require_role,
    get_current_user_id,
    get_current_company_id,
    get_current_role,
    is_superadmin,
)
from app.utils.pagination import paginate


@users_bp.get("/")
@jwt_required()
@require_role(*UserRole.ADMIN_ROLES, UserRole.MANAGER)
def list_users():
    """Lists all users in the current company. Superadmins can pass ?company_id=."""
    company_id = get_current_company_id()
    if is_superadmin():
        company_id = request.args.get("company_id") or None

    query = User.query
    if company_id:
        query = query.filter_by(company_id=company_id)

    # Optional filters
    role_filter = request.args.get("role")
    if role_filter:
        query = query.filter_by(role=role_filter)

    active_filter = request.args.get("is_active")
    if active_filter is not None:
        query = query.filter_by(is_active=active_filter.lower() == "true")

    query = query.order_by(User.last_name, User.first_name)

    result = paginate(query)
    result["items"] = [u.to_dict() for u in result["items"]]
    return jsonify(result), 200


@users_bp.post("/")
@jwt_required()
@require_role(*UserRole.ADMIN_ROLES)
def create_user():
    """Creates a new user in the current company. Only admins can do this."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    required = ["email", "password", "first_name", "last_name", "role"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    if data["role"] not in UserRole.ALL:
        return jsonify({"error": f"Invalid role. Choose from: {UserRole.ALL}"}), 400

    # Non-superadmins cannot create superadmins
    if data["role"] == UserRole.SUPERADMIN and not is_superadmin():
        return jsonify({"error": "Cannot create superadmin users"}), 403

    if len(data["password"]) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    if User.query.filter_by(email=data["email"].lower().strip()).first():
        return jsonify({"error": "Email already registered"}), 409

    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    user = User(
        company_id=company_id,
        email=data["email"].lower().strip(),
        first_name=data["first_name"].strip(),
        last_name=data["last_name"].strip(),
        role=data["role"],
        phone=data.get("phone", "").strip() or None,
    )
    user.set_password(data["password"])
    db.session.add(user)
    db.session.flush()

    log_audit("created", "user", user.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"user": user.to_dict()}), 201


@users_bp.get("/<uuid:user_id>")
@jwt_required()
def get_user(user_id):
    """
    Any authenticated user can view their own profile.
    Admins/managers can view any user in their company.
    """
    current_user_id = get_current_user_id()
    current_role = get_current_role()
    company_id = get_current_company_id()

    user = User.query.get_or_404(user_id)

    # Ensure user belongs to the same company (superadmin bypasses)
    if not is_superadmin() and str(user.company_id) != str(company_id):
        return jsonify({"error": "Not found"}), 404

    # Technicians and sales can only view their own profile
    if current_role in [UserRole.TECHNICIAN, UserRole.SALES] and user_id != current_user_id:
        return jsonify({"error": "Insufficient permissions"}), 403

    return jsonify({"user": user.to_dict()}), 200


@users_bp.put("/<uuid:user_id>")
@jwt_required()
def update_user(user_id):
    """Admins can update any user in company. Users can update their own profile (limited fields)."""
    current_user_id = get_current_user_id()
    current_role = get_current_role()
    company_id = get_current_company_id()

    user = User.query.get_or_404(user_id)

    if not is_superadmin() and str(user.company_id) != str(company_id):
        return jsonify({"error": "Not found"}), 404

    is_self = user_id == current_user_id
    is_admin = current_role in UserRole.ADMIN_ROLES

    # Non-admins can only update their own profile
    if not is_admin and not is_self:
        return jsonify({"error": "Insufficient permissions"}), 403

    data = request.get_json() or {}
    before = user.to_dict()

    # Fields any user can update on their own profile
    if is_self or is_admin:
        if "first_name" in data:
            user.first_name = data["first_name"].strip()
        if "last_name" in data:
            user.last_name = data["last_name"].strip()
        if "phone" in data:
            user.phone = data["phone"].strip() or None
        if "password" in data:
            if len(data["password"]) < 8:
                return jsonify({"error": "Password must be at least 8 characters"}), 400
            user.set_password(data["password"])

    # Admin-only fields
    if is_admin:
        if "role" in data:
            if data["role"] not in UserRole.ALL:
                return jsonify({"error": f"Invalid role"}), 400
            if data["role"] == UserRole.SUPERADMIN and not is_superadmin():
                return jsonify({"error": "Cannot assign superadmin role"}), 403
            user.role = data["role"]
        if "is_active" in data:
            user.is_active = bool(data["is_active"])
        if "email" in data:
            new_email = data["email"].lower().strip()
            if new_email != user.email:
                if User.query.filter_by(email=new_email).first():
                    return jsonify({"error": "Email already in use"}), 409
                user.email = new_email

    log_audit("updated", "user", user.id, company_id, current_user_id,
              changes={"before": before, "after": user.to_dict()})
    db.session.commit()

    return jsonify({"user": user.to_dict()}), 200


@users_bp.delete("/<uuid:user_id>")
@jwt_required()
@require_role(*UserRole.ADMIN_ROLES)
def deactivate_user(user_id):
    """Soft-deletes a user by setting is_active=False. Admins only."""
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    user = User.query.get_or_404(user_id)

    if not is_superadmin() and str(user.company_id) != str(company_id):
        return jsonify({"error": "Not found"}), 404

    if user_id == current_user_id:
        return jsonify({"error": "Cannot deactivate your own account"}), 400

    user.is_active = False
    log_audit("deleted", "user", user.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"message": "User deactivated"}), 200
