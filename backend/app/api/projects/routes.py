from datetime import date as _date
from flask import request, jsonify
from flask_jwt_extended import jwt_required

from app.api.projects import projects_bp
from app.extensions import db
from app.models.project import Project
from app.models.user import UserRole
from app.utils.audit import log_audit
from app.utils.decorators import (
    require_role,
    get_current_user_id,
    get_current_company_id,
    is_superadmin,
)
from app.utils.pagination import paginate


@projects_bp.get("/")
@jwt_required()
def list_projects():
    """
    Returns paginated projects for the current company.
    Supports filtering by: stage_id, manager_id, is_archived, search (name/client).
    """
    company_id = get_current_company_id()

    query = Project.query.filter_by(company_id=company_id)

    # Filters
    if stage_id := request.args.get("stage_id"):
        query = query.filter_by(stage_id=stage_id)
    if manager_id := request.args.get("manager_id"):
        query = query.filter_by(manager_id=manager_id)
    archived = request.args.get("is_archived", "false").lower() == "true"
    query = query.filter_by(is_archived=archived)
    if trade := request.args.get("trade"):
        query = query.filter(Project.trades.contains([trade]))
    if search := request.args.get("search"):
        pattern = f"%{search}%"
        query = query.filter(
            db.or_(Project.name.ilike(pattern), Project.client_name.ilike(pattern))
        )

    query = query.order_by(Project.created_at.desc())

    result = paginate(query)
    result["items"] = [p.to_dict(include_work_order_count=True) for p in result["items"]]
    return jsonify(result), 200


@projects_bp.post("/")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def create_project():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400
    if not data.get("name"):
        return jsonify({"error": "Project name is required"}), 400

    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    project = Project(
        company_id=company_id,
        name=data["name"].strip(),
        description=data.get("description"),
        client_name=data.get("client_name"),
        client_email=data.get("client_email"),
        client_phone=data.get("client_phone"),
        stage_id=data.get("stage_id"),
        manager_id=data.get("manager_id"),
        created_by_id=current_user_id,
        site_address=data.get("site_address"),
        site_city=data.get("site_city"),
        site_state=data.get("site_state"),
        site_zip=data.get("site_zip"),
        site_lat=data.get("site_lat"),
        site_lng=data.get("site_lng"),
        start_date=data.get("start_date"),
        end_date=data.get("end_date"),
        trades=data.get("trades", []),
        custom_fields=data.get("custom_fields", {}),
    )
    db.session.add(project)
    db.session.flush()

    log_audit("created", "project", project.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"project": project.to_dict()}), 201


@projects_bp.get("/<uuid:project_id>")
@jwt_required()
def get_project(project_id):
    company_id = get_current_company_id()
    project = Project.query.get_or_404(project_id)

    if not is_superadmin() and str(project.company_id) != str(company_id):
        return jsonify({"error": "Not found"}), 404

    return jsonify({"project": project.to_dict(include_work_order_count=True)}), 200


@projects_bp.put("/<uuid:project_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def update_project(project_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    project = Project.query.get_or_404(project_id)
    if not is_superadmin() and str(project.company_id) != str(company_id):
        return jsonify({"error": "Not found"}), 404

    data = request.get_json() or {}
    before = project.to_dict()

    updatable = [
        "name", "description", "client_name", "client_email", "client_phone",
        "stage_id", "manager_id", "site_address", "site_city", "site_state",
        "site_zip", "site_lat", "site_lng", "trades", "is_archived",
    ]
    for field in updatable:
        if field in data:
            setattr(project, field, data[field])

    if "start_date" in data:
        project.start_date = _date.fromisoformat(data["start_date"]) if data["start_date"] else None
    if "end_date" in data:
        project.end_date = _date.fromisoformat(data["end_date"]) if data["end_date"] else None

    if "custom_fields" in data and isinstance(data["custom_fields"], dict):
        project.custom_fields = {**project.custom_fields, **data["custom_fields"]}

    log_audit("updated", "project", project.id, company_id, current_user_id,
              changes={"before": before, "after": project.to_dict()})
    db.session.commit()

    return jsonify({"project": project.to_dict()}), 200


@projects_bp.delete("/<uuid:project_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.SUPERADMIN)
def archive_project(project_id):
    """Archives a project (soft delete). Hard delete not supported."""
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    project = Project.query.get_or_404(project_id)
    if not is_superadmin() and str(project.company_id) != str(company_id):
        return jsonify({"error": "Not found"}), 404

    project.is_archived = True
    log_audit("deleted", "project", project.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"message": "Project archived"}), 200
