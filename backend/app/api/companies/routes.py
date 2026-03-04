from flask import request, jsonify
from flask_jwt_extended import jwt_required

from app.api.companies import companies_bp
from app.extensions import db
from app.models.company import Company, CompanyModule
from app.models.user import UserRole
from app.utils.audit import log_audit
from app.utils.decorators import (
    require_role,
    get_current_user_id,
    get_current_company_id,
    is_superadmin,
)


@companies_bp.get("/")
@jwt_required()
@require_role(UserRole.SUPERADMIN)
def list_companies():
    """Superadmin only: list all companies on the platform."""
    companies = Company.query.order_by(Company.name).all()
    return jsonify({"companies": [c.to_dict() for c in companies]}), 200


@companies_bp.get("/<uuid:company_id>")
@jwt_required()
def get_company(company_id):
    """Returns company info. Users can only fetch their own company."""
    current_company_id = get_current_company_id()

    if not is_superadmin() and str(company_id) != str(current_company_id):
        return jsonify({"error": "Not found"}), 404

    company = Company.query.get_or_404(company_id)
    data = company.to_dict()
    data["modules"] = [m.to_dict() for m in company.modules.order_by(CompanyModule.module_name)]
    return jsonify({"company": data}), 200


@companies_bp.put("/<uuid:company_id>")
@jwt_required()
@require_role(UserRole.SUPERADMIN, UserRole.COMPANY_ADMIN)
def update_company(company_id):
    """Update company name, settings, subscription. Admins can only update their own company."""
    current_company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    if not is_superadmin() and str(company_id) != str(current_company_id):
        return jsonify({"error": "Not found"}), 404

    company = Company.query.get_or_404(company_id)
    data = request.get_json() or {}
    before = company.to_dict()

    if "name" in data:
        company.name = data["name"].strip()
    if "settings" in data and isinstance(data["settings"], dict):
        # Merge settings rather than replacing to avoid clobbering keys
        company.settings = {**company.settings, **data["settings"]}
    # Superadmin only
    if is_superadmin():
        if "subscription_plan" in data:
            company.subscription_plan = data["subscription_plan"]
        if "is_active" in data:
            company.is_active = bool(data["is_active"])

    log_audit("updated", "company", company.id, company.id, current_user_id,
              changes={"before": before, "after": company.to_dict()})
    db.session.commit()

    return jsonify({"company": company.to_dict()}), 200


@companies_bp.put("/<uuid:company_id>/modules/<string:module_name>")
@jwt_required()
@require_role(UserRole.SUPERADMIN, UserRole.COMPANY_ADMIN)
def toggle_module(company_id, module_name):
    """Enable or disable a feature module for a company."""
    current_company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    if not is_superadmin() and str(company_id) != str(current_company_id):
        return jsonify({"error": "Not found"}), 404

    data = request.get_json() or {}
    if "is_enabled" not in data:
        return jsonify({"error": "is_enabled is required"}), 400

    module = CompanyModule.query.filter_by(
        company_id=company_id, module_name=module_name
    ).first_or_404()

    module.is_enabled = bool(data["is_enabled"])
    if "config" in data and isinstance(data["config"], dict):
        module.config = {**module.config, **data["config"]}

    log_audit("updated", "company_module", module.id, company_id, current_user_id,
              changes={"module": module_name, "is_enabled": module.is_enabled})
    db.session.commit()

    return jsonify({"module": module.to_dict()}), 200
