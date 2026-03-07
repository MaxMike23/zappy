import uuid
from datetime import datetime
from flask import request, jsonify
from flask_jwt_extended import jwt_required

from app.api.visits import visits_bp
from app.extensions import db
from app.models.visit import Visit, VisitStatus
from app.models.work_order import WorkOrder
from app.models.project import Project
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


def _assert_visit_access(visit: Visit, company_id) -> bool:
    return is_superadmin() or str(visit.company_id) == str(company_id)


@visits_bp.get("/")
@jwt_required()
def list_visits():
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    query = Visit.query.filter_by(company_id=company_id)

    if current_role == UserRole.TECHNICIAN:
        query = query.filter(Visit.assignees.any(User.id == current_user_id))

    if wo_id := request.args.get("work_order_id"):
        query = query.filter_by(work_order_id=wo_id)
    if proj_id := request.args.get("project_id"):
        query = query.filter_by(project_id=proj_id)
    if status := request.args.get("status"):
        query = query.filter_by(status=status)
    if assignee_id := request.args.get("assignee_id"):
        query = query.filter(Visit.assignees.any(User.id == uuid.UUID(assignee_id)))
    if after := request.args.get("scheduled_after"):
        query = query.filter(Visit.scheduled_start >= after)
    if before := request.args.get("scheduled_before"):
        query = query.filter(Visit.scheduled_start <= before)

    query = query.order_by(Visit.scheduled_start.asc())

    result = paginate(query)
    result["items"] = [v.to_dict() for v in result["items"]]
    return jsonify(result), 200


@visits_bp.post("/")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def create_visit():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400
    if not data.get("title"):
        return jsonify({"error": "Visit title is required"}), 400
    if not data.get("scheduled_start"):
        return jsonify({"error": "scheduled_start is required"}), 400
    if not data.get("scheduled_end"):
        return jsonify({"error": "scheduled_end is required"}), 400

    wo_id = data.get("work_order_id")
    proj_id = data.get("project_id")
    if bool(wo_id) == bool(proj_id):
        return jsonify({"error": "Exactly one of work_order_id or project_id is required"}), 400

    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    # Verify parent belongs to this company
    if wo_id:
        wo = WorkOrder.query.filter_by(id=wo_id, company_id=company_id).first()
        if not wo:
            return jsonify({"error": "Work order not found"}), 404
    else:
        proj = Project.query.filter_by(id=proj_id, company_id=company_id).first()
        if not proj:
            return jsonify({"error": "Project not found"}), 404

    visit = Visit(
        company_id=company_id,
        work_order_id=wo_id or None,
        project_id=proj_id or None,
        created_by_id=current_user_id,
        title=data["title"].strip(),
        scheduled_start=data["scheduled_start"],
        scheduled_end=data["scheduled_end"],
        notes=data.get("notes"),
    )
    db.session.add(visit)
    db.session.flush()

    if assignee_ids := data.get("assignee_ids", []):
        assignees = User.query.filter(
            User.id.in_([uuid.UUID(aid) for aid in assignee_ids]),
            User.company_id == company_id,
        ).all()
        visit.assignees = assignees

    log_audit("created", "visit", visit.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"visit": visit.to_dict()}), 201


@visits_bp.get("/<uuid:visit_id>")
@jwt_required()
def get_visit(visit_id):
    company_id = get_current_company_id()
    visit = Visit.query.get_or_404(visit_id)

    if not _assert_visit_access(visit, company_id):
        return jsonify({"error": "Not found"}), 404

    return jsonify({"visit": visit.to_dict()}), 200


@visits_bp.put("/<uuid:visit_id>")
@jwt_required()
def update_visit(visit_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    visit = Visit.query.get_or_404(visit_id)
    if not _assert_visit_access(visit, company_id):
        return jsonify({"error": "Not found"}), 404

    if current_role == UserRole.TECHNICIAN:
        if current_user_id not in [u.id for u in visit.assignees]:
            return jsonify({"error": "Not assigned to this visit"}), 403

    data = request.get_json() or {}

    if current_role in [UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN]:
        for field in ["title", "scheduled_start", "scheduled_end", "status"]:
            if field in data:
                setattr(visit, field, data[field])

        if "assignee_ids" in data:
            assignees = User.query.filter(
                User.id.in_([uuid.UUID(aid) for aid in data["assignee_ids"]]),
                User.company_id == company_id,
            ).all()
            visit.assignees = assignees

    # Techs can update notes on their assigned visits
    if "notes" in data:
        visit.notes = data["notes"]

    log_audit("updated", "visit", visit.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"visit": visit.to_dict()}), 200


@visits_bp.delete("/<uuid:visit_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def cancel_visit(visit_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    visit = Visit.query.get_or_404(visit_id)
    if not _assert_visit_access(visit, company_id):
        return jsonify({"error": "Not found"}), 404

    visit.status = VisitStatus.CANCELLED
    log_audit("deleted", "visit", visit.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"message": "Visit cancelled"}), 200


@visits_bp.post("/<uuid:visit_id>/clock-in")
@jwt_required()
def clock_in(visit_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    visit = Visit.query.get_or_404(visit_id)
    if not _assert_visit_access(visit, company_id):
        return jsonify({"error": "Not found"}), 404

    if current_role == UserRole.TECHNICIAN:
        if current_user_id not in [u.id for u in visit.assignees]:
            return jsonify({"error": "Not assigned to this visit"}), 403

    if visit.actual_start is not None:
        return jsonify({"error": "Already clocked in"}), 400

    visit.actual_start = datetime.utcnow()
    visit.status = VisitStatus.IN_PROGRESS
    log_audit("clock_in", "visit", visit.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"visit": visit.to_dict()}), 200


@visits_bp.post("/<uuid:visit_id>/clock-out")
@jwt_required()
def clock_out(visit_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    visit = Visit.query.get_or_404(visit_id)
    if not _assert_visit_access(visit, company_id):
        return jsonify({"error": "Not found"}), 404

    if current_role == UserRole.TECHNICIAN:
        if current_user_id not in [u.id for u in visit.assignees]:
            return jsonify({"error": "Not assigned to this visit"}), 403

    if visit.status != VisitStatus.IN_PROGRESS or visit.actual_start is None:
        return jsonify({"error": "Visit is not currently in progress"}), 400

    visit.actual_end = datetime.utcnow()
    visit.status = VisitStatus.COMPLETED
    log_audit("clock_out", "visit", visit.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"visit": visit.to_dict()}), 200
