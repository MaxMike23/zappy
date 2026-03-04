import uuid
from flask import request, jsonify
from flask_jwt_extended import jwt_required

from app.api.work_orders import work_orders_bp
from app.extensions import db
from app.models.work_order import WorkOrder, WorkOrderNote
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


def _assert_wo_access(work_order: WorkOrder, company_id) -> bool:
    """Returns True if the work order belongs to the company."""
    return is_superadmin() or str(work_order.company_id) == str(company_id)


@work_orders_bp.get("/")
@jwt_required()
def list_work_orders():
    """
    Returns paginated work orders for the current company.
    Technicians see only work orders assigned to them.
    Filters: project_id, stage_id, priority, assignee_id, search, scheduled_after/before.
    """
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    query = WorkOrder.query.filter_by(company_id=company_id)

    # Techs can only see their own work orders
    if current_role == UserRole.TECHNICIAN:
        query = query.filter(
            WorkOrder.assignees.any(User.id == current_user_id)
        )

    # Optional filters
    if project_id := request.args.get("project_id"):
        query = query.filter_by(project_id=project_id)
    if stage_id := request.args.get("stage_id"):
        query = query.filter_by(stage_id=stage_id)
    if priority := request.args.get("priority"):
        query = query.filter_by(priority=priority)
    if assignee_id := request.args.get("assignee_id"):
        query = query.filter(WorkOrder.assignees.any(User.id == uuid.UUID(assignee_id)))
    if search := request.args.get("search"):
        query = query.filter(WorkOrder.title.ilike(f"%{search}%"))

    archived = request.args.get("is_archived", "false").lower() == "true"
    query = query.filter_by(is_archived=archived)

    query = query.order_by(WorkOrder.created_at.desc())

    result = paginate(query)
    result["items"] = [wo.to_dict() for wo in result["items"]]
    return jsonify(result), 200


@work_orders_bp.post("/")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def create_work_order():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400
    if not data.get("title"):
        return jsonify({"error": "Work order title is required"}), 400

    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    work_order = WorkOrder(
        company_id=company_id,
        project_id=data.get("project_id"),
        title=data["title"].strip(),
        description=data.get("description"),
        stage_id=data.get("stage_id"),
        priority=data.get("priority", "medium"),
        created_by_id=current_user_id,
        scheduled_start=data.get("scheduled_start"),
        scheduled_end=data.get("scheduled_end"),
        site_address=data.get("site_address"),
        site_city=data.get("site_city"),
        site_state=data.get("site_state"),
        site_zip=data.get("site_zip"),
        site_lat=data.get("site_lat"),
        site_lng=data.get("site_lng"),
        custom_fields=data.get("custom_fields", {}),
    )
    db.session.add(work_order)
    db.session.flush()

    # Assign technicians if provided
    if assignee_ids := data.get("assignee_ids", []):
        assignees = User.query.filter(
            User.id.in_([uuid.UUID(aid) for aid in assignee_ids]),
            User.company_id == company_id,
        ).all()
        work_order.assignees = assignees

    log_audit("created", "work_order", work_order.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"work_order": work_order.to_dict()}), 201


@work_orders_bp.get("/<uuid:wo_id>")
@jwt_required()
def get_work_order(wo_id):
    company_id = get_current_company_id()
    wo = WorkOrder.query.get_or_404(wo_id)

    if not _assert_wo_access(wo, company_id):
        return jsonify({"error": "Not found"}), 404

    return jsonify({"work_order": wo.to_dict(include_notes=True, include_time_summary=True)}), 200


@work_orders_bp.put("/<uuid:wo_id>")
@jwt_required()
def update_work_order(wo_id):
    """
    Managers/admins can update all fields.
    Technicians can only update stage, notes, and custom_fields on their assigned WOs.
    """
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    wo = WorkOrder.query.get_or_404(wo_id)
    if not _assert_wo_access(wo, company_id):
        return jsonify({"error": "Not found"}), 404

    # Technicians can only update their own assigned work orders
    if current_role == UserRole.TECHNICIAN:
        if current_user_id not in [u.id for u in wo.assignees]:
            return jsonify({"error": "Not assigned to this work order"}), 403

    data = request.get_json() or {}
    before = wo.to_dict()

    # Fields anyone assigned can update
    if "stage_id" in data:
        before_stage = str(wo.stage_id) if wo.stage_id else None
        wo.stage_id = data["stage_id"]
        log_audit("status_changed", "work_order", wo.id, company_id, current_user_id,
                  changes={"before": {"stage_id": before_stage}, "after": {"stage_id": data["stage_id"]}})

    if "custom_fields" in data and isinstance(data["custom_fields"], dict):
        wo.custom_fields = {**wo.custom_fields, **data["custom_fields"]}

    # Manager/admin-only fields
    if current_role in [UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN]:
        admin_fields = [
            "title", "description", "priority", "project_id",
            "scheduled_start", "scheduled_end", "site_address", "site_city",
            "site_state", "site_zip", "site_lat", "site_lng", "is_archived",
        ]
        for field in admin_fields:
            if field in data:
                setattr(wo, field, data[field])

        if "assignee_ids" in data:
            assignees = User.query.filter(
                User.id.in_([uuid.UUID(aid) for aid in data["assignee_ids"]]),
                User.company_id == company_id,
            ).all()
            wo.assignees = assignees

    log_audit("updated", "work_order", wo.id, company_id, current_user_id,
              changes={"before": before, "after": wo.to_dict()})
    db.session.commit()

    return jsonify({"work_order": wo.to_dict()}), 200


@work_orders_bp.delete("/<uuid:wo_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.SUPERADMIN)
def archive_work_order(wo_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    wo = WorkOrder.query.get_or_404(wo_id)
    if not _assert_wo_access(wo, company_id):
        return jsonify({"error": "Not found"}), 404

    wo.is_archived = True
    log_audit("deleted", "work_order", wo.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"message": "Work order archived"}), 200


# ── Notes ────────────────────────────────────────────────────────────────────

@work_orders_bp.get("/<uuid:wo_id>/notes")
@jwt_required()
def list_notes(wo_id):
    company_id = get_current_company_id()
    wo = WorkOrder.query.get_or_404(wo_id)
    if not _assert_wo_access(wo, company_id):
        return jsonify({"error": "Not found"}), 404

    notes = wo.notes.order_by(WorkOrderNote.created_at.asc()).all()
    return jsonify({"notes": [n.to_dict() for n in notes]}), 200


@work_orders_bp.post("/<uuid:wo_id>/notes")
@jwt_required()
def add_note(wo_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    wo = WorkOrder.query.get_or_404(wo_id)
    if not _assert_wo_access(wo, company_id):
        return jsonify({"error": "Not found"}), 404

    data = request.get_json() or {}
    if not data.get("content"):
        return jsonify({"error": "Note content is required"}), 400

    note = WorkOrderNote(
        work_order_id=wo.id,
        author_id=current_user_id,
        content=data["content"].strip(),
        is_internal=data.get("is_internal", True),
    )
    db.session.add(note)
    db.session.commit()

    return jsonify({"note": note.to_dict()}), 201


@work_orders_bp.delete("/<uuid:wo_id>/notes/<uuid:note_id>")
@jwt_required()
def delete_note(wo_id, note_id):
    """Authors can delete their own notes. Admins can delete any."""
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    wo = WorkOrder.query.get_or_404(wo_id)
    if not _assert_wo_access(wo, company_id):
        return jsonify({"error": "Not found"}), 404

    note = WorkOrderNote.query.get_or_404(note_id)
    if str(note.work_order_id) != str(wo_id):
        return jsonify({"error": "Not found"}), 404

    if current_role not in UserRole.ADMIN_ROLES and note.author_id != current_user_id:
        return jsonify({"error": "Cannot delete another user's note"}), 403

    db.session.delete(note)
    db.session.commit()

    return jsonify({"message": "Note deleted"}), 200
