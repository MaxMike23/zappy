from datetime import datetime
from flask import request, jsonify
from flask_jwt_extended import jwt_required

from app.api.projects import projects_bp
from app.extensions import db
from app.models.project import Project
from app.models.signal_diagram import SignalDiagram
from app.models.user import UserRole
from app.utils.decorators import require_role, get_current_company_id


def _get_project_or_404(project_id, company_id):
    return Project.query.filter_by(
        id=project_id, company_id=company_id, is_archived=False
    ).first()


@projects_bp.get("/<project_id>/diagrams/<trade>")
@jwt_required()
def get_diagram(project_id, trade):
    company_id = get_current_company_id()
    if not _get_project_or_404(project_id, company_id):
        return jsonify({"error": "Project not found."}), 404

    diagram = SignalDiagram.query.filter_by(
        project_id=project_id, company_id=company_id, trade=trade
    ).first()
    return jsonify({"diagram": diagram.to_dict() if diagram else None}), 200


@projects_bp.put("/<project_id>/diagrams/<trade>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def upsert_diagram(project_id, trade):
    company_id = get_current_company_id()
    if not _get_project_or_404(project_id, company_id):
        return jsonify({"error": "Project not found."}), 404

    data = request.get_json() or {}
    diagram = SignalDiagram.query.filter_by(
        project_id=project_id, company_id=company_id, trade=trade
    ).first()

    if not diagram:
        diagram = SignalDiagram(project_id=project_id, company_id=company_id, trade=trade)
        db.session.add(diagram)

    for field in ("drawing_title", "location", "company_name_override", "revision", "drawn_by"):
        if field in data:
            setattr(diagram, field, data[field] or None)

    if "drawing_date" in data:
        try:
            diagram.drawing_date = (
                datetime.strptime(data["drawing_date"], "%Y-%m-%d").date()
                if data["drawing_date"] else None
            )
        except ValueError:
            diagram.drawing_date = None

    db.session.commit()
    return jsonify({"diagram": diagram.to_dict()}), 200
