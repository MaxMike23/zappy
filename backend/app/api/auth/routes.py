from datetime import datetime
from flask import request, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)

from app.api.auth import auth_bp
from app.extensions import db
from app.models.company import Company
from app.models.user import User, UserRole, TokenBlocklist
from app.utils.audit import log_audit
from app.utils.seed import seed_company_defaults


def _make_tokens(user: User) -> dict:
    """Creates access + refresh tokens with role/company embedded in claims."""
    additional_claims = {
        "company_id": str(user.company_id) if user.company_id else None,
        "role": user.role,
    }
    access_token = create_access_token(
        identity=str(user.id),
        additional_claims=additional_claims,
    )
    refresh_token = create_refresh_token(
        identity=str(user.id),
        additional_claims=additional_claims,
    )
    return {"access_token": access_token, "refresh_token": refresh_token}


@auth_bp.post("/register")
def register():
    """
    Company onboarding endpoint — creates a new Company + Company Admin user in one shot.
    Called once per AV company during self-service signup.
    Subsequent users are created by the company admin via POST /api/users.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    required = ["company_name", "email", "password", "first_name", "last_name"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    # Enforce password strength (minimum 8 chars)
    if len(data["password"]) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    # Check email uniqueness
    if User.query.filter_by(email=data["email"].lower().strip()).first():
        return jsonify({"error": "Email already registered"}), 409

    # Build company slug from name
    import re
    slug = re.sub(r"[^a-z0-9]+", "-", data["company_name"].lower().strip()).strip("-")
    base_slug = slug
    counter = 1
    while Company.query.filter_by(slug=slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    try:
        company = Company(
            name=data["company_name"].strip(),
            slug=slug,
            settings={},
        )
        db.session.add(company)
        db.session.flush()  # Get company.id before seeding

        seed_company_defaults(company.id)

        user = User(
            company_id=company.id,
            email=data["email"].lower().strip(),
            first_name=data["first_name"].strip(),
            last_name=data["last_name"].strip(),
            phone=data.get("phone", "").strip() or None,
            role=UserRole.COMPANY_ADMIN,
        )
        user.set_password(data["password"])
        db.session.add(user)
        db.session.flush()

        log_audit("created", "company", company.id, company.id, user.id)
        log_audit("created", "user", user.id, company.id, user.id)

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Registration failed", "detail": str(e)}), 500

    tokens = _make_tokens(user)
    return jsonify({
        "message": "Company registered successfully",
        "company": company.to_dict(),
        "user": user.to_dict(),
        **tokens,
    }), 201


@auth_bp.post("/login")
def login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    email = data.get("email", "").lower().strip()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401

    if not user.is_active:
        return jsonify({"error": "Account is disabled. Contact your administrator."}), 403

    user.last_login_at = datetime.utcnow()

    log_audit("login", "user", user.id, user.company_id, user.id)
    db.session.commit()

    tokens = _make_tokens(user)
    return jsonify({
        "user": user.to_dict(),
        **tokens,
    }), 200


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    """Issues a new access token using a valid refresh token."""
    identity = get_jwt_identity()
    claims = get_jwt()

    additional_claims = {
        "company_id": claims.get("company_id"),
        "role": claims.get("role"),
    }
    access_token = create_access_token(
        identity=identity,
        additional_claims=additional_claims,
    )
    return jsonify({"access_token": access_token}), 200


@auth_bp.post("/logout")
@jwt_required(verify_type=False)
def logout():
    """Blacklists the current token (works for both access and refresh tokens)."""
    jti = get_jwt()["jti"]
    db.session.add(TokenBlocklist(jti=jti))
    db.session.commit()
    return jsonify({"message": "Logged out successfully"}), 200


@auth_bp.get("/me")
@jwt_required()
def me():
    """Returns the current authenticated user's profile."""
    from app.utils.decorators import get_current_user_id
    user = User.query.get(get_current_user_id())
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": user.to_dict()}), 200
