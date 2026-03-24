from flask import request, jsonify
from flask_jwt_extended import jwt_required

from app.api.projects import projects_bp
from app.extensions import db
from app.models.project import Project
from app.models.device_connection import DeviceConnection, CONNECTION_TYPES
from app.models.project_device import ProjectDevice
from app.models.user import UserRole
from app.utils.decorators import require_role, get_current_company_id


def _get_project_or_404(project_id, company_id):
    return Project.query.filter_by(
        id=project_id, company_id=company_id, is_archived=False
    ).first()


@projects_bp.get("/<project_id>/connections")
@jwt_required()
def list_connections(project_id):
    company_id = get_current_company_id()
    if not _get_project_or_404(project_id, company_id):
        return jsonify({"error": "Project not found."}), 404

    trade = request.args.get("trade")
    q = DeviceConnection.query.filter_by(project_id=project_id, company_id=company_id)
    if trade:
        q = q.filter_by(trade=trade)
    connections = q.order_by(DeviceConnection.created_at.asc()).all()
    return jsonify({"connections": [c.to_dict() for c in connections]}), 200


@projects_bp.post("/<project_id>/connections")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def create_connection(project_id):
    company_id = get_current_company_id()
    if not _get_project_or_404(project_id, company_id):
        return jsonify({"error": "Project not found."}), 404

    data = request.get_json() or {}
    src_id = data.get("source_device_id")
    dst_id = data.get("destination_device_id")

    if src_id:
        if not ProjectDevice.query.filter_by(
            id=src_id, project_id=project_id, company_id=company_id
        ).first():
            return jsonify({"error": "Source device not found."}), 404
    if dst_id:
        if not ProjectDevice.query.filter_by(
            id=dst_id, project_id=project_id, company_id=company_id
        ).first():
            return jsonify({"error": "Destination device not found."}), 404

    conn = DeviceConnection(
        project_id=project_id,
        company_id=company_id,
        trade=data.get("trade") or None,
        source_device_id=src_id or None,
        source_port=data.get("source_port") or None,
        destination_device_id=dst_id or None,
        destination_port=data.get("destination_port") or None,
        connection_type=data.get("connection_type") or None,
        notes=data.get("notes") or None,
    )
    db.session.add(conn)
    db.session.commit()
    return jsonify({"connection": conn.to_dict()}), 201


@projects_bp.put("/<project_id>/connections/<conn_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def update_connection(project_id, conn_id):
    company_id = get_current_company_id()
    if not _get_project_or_404(project_id, company_id):
        return jsonify({"error": "Project not found."}), 404

    conn = DeviceConnection.query.filter_by(
        id=conn_id, project_id=project_id, company_id=company_id
    ).first()
    if not conn:
        return jsonify({"error": "Connection not found."}), 404

    data = request.get_json() or {}
    for field in ("trade", "source_port", "destination_port", "connection_type", "notes"):
        if field in data:
            setattr(conn, field, data[field] or None)
    db.session.commit()
    return jsonify({"connection": conn.to_dict()}), 200


@projects_bp.delete("/<project_id>/connections/<conn_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def delete_connection(project_id, conn_id):
    company_id = get_current_company_id()
    if not _get_project_or_404(project_id, company_id):
        return jsonify({"error": "Project not found."}), 404

    conn = DeviceConnection.query.filter_by(
        id=conn_id, project_id=project_id, company_id=company_id
    ).first()
    if not conn:
        return jsonify({"error": "Connection not found."}), 404

    db.session.delete(conn)
    db.session.commit()
    return jsonify({"message": "Connection removed."}), 200
