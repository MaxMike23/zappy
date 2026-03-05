import re
from flask import request, jsonify
from flask_jwt_extended import jwt_required

from app.api.workflow import workflow_bp
from app.extensions import db
from app.models.workflow import WorkflowStage, WorkflowFieldDefinition, WorkflowModule, FieldType
from app.models.user import UserRole
from app.utils.audit import log_audit
from app.utils.decorators import (
    require_role,
    get_current_user_id,
    get_current_company_id,
)


def _slug_from_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower().strip()).strip("_")


# ── Stages ───────────────────────────────────────────────────────────────────

@workflow_bp.get("/stages")
@jwt_required()
def list_stages():
    """Returns all workflow stages for the company, optionally filtered by module."""
    company_id = get_current_company_id()

    query = WorkflowStage.query.filter_by(company_id=company_id)
    if module := request.args.get("module"):
        if module not in WorkflowModule.ALL:
            return jsonify({"error": f"Invalid module. Choose from: {WorkflowModule.ALL}"}), 400
        query = query.filter_by(module=module)

    stages = query.order_by(WorkflowStage.module, WorkflowStage.sort_order).all()
    return jsonify({"stages": [s.to_dict() for s in stages]}), 200


@workflow_bp.post("/stages")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.SUPERADMIN)
def create_stage():
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    data = request.get_json()

    if not data:
        return jsonify({"error": "JSON body required"}), 400
    if not data.get("name") or not data.get("module"):
        return jsonify({"error": "name and module are required"}), 400
    if data["module"] not in WorkflowModule.ALL:
        return jsonify({"error": f"Invalid module. Choose from: {WorkflowModule.ALL}"}), 400

    slug = data.get("slug") or _slug_from_name(data["name"])

    # Ensure slug uniqueness within company+module
    if WorkflowStage.query.filter_by(company_id=company_id, module=data["module"], slug=slug).first():
        return jsonify({"error": f"A stage with slug '{slug}' already exists for this module"}), 409

    # Determine next sort_order
    max_order = db.session.query(db.func.max(WorkflowStage.sort_order)).filter_by(
        company_id=company_id, module=data["module"]
    ).scalar() or -1

    stage = WorkflowStage(
        company_id=company_id,
        module=data["module"],
        name=data["name"].strip(),
        slug=slug,
        color=data.get("color", "#6B7280"),
        sort_order=data.get("sort_order", max_order + 1),
        is_terminal=data.get("is_terminal", False),
        is_success=data.get("is_success", False),
        stage_requirements=data.get("stage_requirements", {}),
    )
    db.session.add(stage)
    db.session.flush()
    log_audit("created", "workflow_stage", stage.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"stage": stage.to_dict()}), 201


@workflow_bp.put("/stages/<uuid:stage_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.SUPERADMIN)
def update_stage(stage_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    stage = WorkflowStage.query.filter_by(id=stage_id, company_id=company_id).first_or_404()
    data = request.get_json() or {}

    if "name" in data:
        stage.name = data["name"].strip()
    if "color" in data:
        stage.color = data["color"]
    if "sort_order" in data:
        stage.sort_order = int(data["sort_order"])
    if "is_terminal" in data:
        stage.is_terminal = bool(data["is_terminal"])
    if "is_success" in data:
        stage.is_success = bool(data["is_success"])

    log_audit("updated", "workflow_stage", stage.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"stage": stage.to_dict()}), 200


@workflow_bp.put("/stages/reorder")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.SUPERADMIN)
def reorder_stages():
    """
    Bulk reorder stages. Body: { "module": "work_order", "stage_ids": ["id1", "id2", ...] }
    The index position in stage_ids becomes the new sort_order.
    """
    company_id = get_current_company_id()
    data = request.get_json() or {}

    stage_ids = data.get("stage_ids", [])
    if not stage_ids:
        return jsonify({"error": "stage_ids is required"}), 400

    for order, sid in enumerate(stage_ids):
        WorkflowStage.query.filter_by(id=sid, company_id=company_id).update({"sort_order": order})

    db.session.commit()
    return jsonify({"message": "Stages reordered"}), 200


@workflow_bp.delete("/stages/<uuid:stage_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.SUPERADMIN)
def delete_stage(stage_id):
    """
    Deletes a workflow stage. Will fail if any project/work order currently uses this stage.
    Reassign those records first.
    """
    from app.models.project import Project
    from app.models.work_order import WorkOrder

    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    stage = WorkflowStage.query.filter_by(id=stage_id, company_id=company_id).first_or_404()

    in_use_projects = Project.query.filter_by(stage_id=stage_id).count()
    in_use_wos = WorkOrder.query.filter_by(stage_id=stage_id).count()
    if in_use_projects + in_use_wos > 0:
        return jsonify({
            "error": f"Stage is in use by {in_use_projects} project(s) and {in_use_wos} work order(s). Reassign them first."
        }), 409

    log_audit("deleted", "workflow_stage", stage.id, company_id, current_user_id)
    db.session.delete(stage)
    db.session.commit()

    return jsonify({"message": "Stage deleted"}), 200


# ── Field Definitions ─────────────────────────────────────────────────────────

@workflow_bp.get("/fields")
@jwt_required()
def list_field_definitions():
    company_id = get_current_company_id()

    query = WorkflowFieldDefinition.query.filter_by(company_id=company_id)
    if module := request.args.get("module"):
        query = query.filter_by(module=module)

    fields = query.order_by(WorkflowFieldDefinition.module, WorkflowFieldDefinition.sort_order).all()
    return jsonify({"fields": [f.to_dict() for f in fields]}), 200


@workflow_bp.post("/fields")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.SUPERADMIN)
def create_field_definition():
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    data = request.get_json()

    if not data:
        return jsonify({"error": "JSON body required"}), 400
    required = ["field_label", "module", "field_type"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing: {', '.join(missing)}"}), 400
    if data["module"] not in WorkflowModule.ALL:
        return jsonify({"error": f"Invalid module"}), 400
    if data["field_type"] not in FieldType.ALL:
        return jsonify({"error": f"Invalid field_type. Choose from: {FieldType.ALL}"}), 400

    # Auto-generate field_key from label
    field_key = data.get("field_key") or _slug_from_name(data["field_label"])

    if WorkflowFieldDefinition.query.filter_by(
        company_id=company_id, module=data["module"], field_key=field_key
    ).first():
        return jsonify({"error": f"Field key '{field_key}' already exists for this module"}), 409

    max_order = db.session.query(db.func.max(WorkflowFieldDefinition.sort_order)).filter_by(
        company_id=company_id, module=data["module"]
    ).scalar() or -1

    field = WorkflowFieldDefinition(
        company_id=company_id,
        module=data["module"],
        field_key=field_key,
        field_label=data["field_label"].strip(),
        field_type=data["field_type"],
        field_config=data.get("field_config", {}),
        is_required=data.get("is_required", False),
        sort_order=data.get("sort_order", max_order + 1),
    )
    db.session.add(field)
    db.session.flush()
    log_audit("created", "workflow_field", field.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"field": field.to_dict()}), 201


@workflow_bp.put("/fields/<uuid:field_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.SUPERADMIN)
def update_field_definition(field_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    field = WorkflowFieldDefinition.query.filter_by(id=field_id, company_id=company_id).first_or_404()
    data = request.get_json() or {}

    if "field_label" in data:
        field.field_label = data["field_label"].strip()
    if "field_config" in data and isinstance(data["field_config"], dict):
        field.field_config = data["field_config"]
    if "is_required" in data:
        field.is_required = bool(data["is_required"])
    if "sort_order" in data:
        field.sort_order = int(data["sort_order"])

    log_audit("updated", "workflow_field", field.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"field": field.to_dict()}), 200


@workflow_bp.delete("/fields/<uuid:field_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.SUPERADMIN)
def delete_field_definition(field_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    field = WorkflowFieldDefinition.query.filter_by(id=field_id, company_id=company_id).first_or_404()

    log_audit("deleted", "workflow_field", field.id, company_id, current_user_id)
    db.session.delete(field)
    db.session.commit()

    return jsonify({"message": "Field deleted"}), 200
