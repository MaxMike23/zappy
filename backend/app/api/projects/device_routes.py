from flask import request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app.api.projects import projects_bp
from app.extensions import db
from app.models.project import Project
from app.models.project_device import ProjectDevice
from app.models.device import DeviceTemplate
from app.models.user import UserRole
from app.utils.decorators import (
    require_role,
    get_current_company_id,
)


def _get_project_or_404(project_id, company_id):
    return Project.query.filter_by(
        id=project_id, company_id=company_id, is_archived=False
    ).first()


def _accessible_template(template_id, company_id):
    """Return template if it's an approved global record or owned by this company."""
    return DeviceTemplate.query.filter(
        DeviceTemplate.id == template_id,
        DeviceTemplate.is_pending == False,  # noqa: E712
        or_(
            DeviceTemplate.company_id == None,  # noqa: E711
            DeviceTemplate.company_id == company_id,
        ),
    ).first()


@projects_bp.get("/<project_id>/devices")
@jwt_required()
def list_project_devices(project_id):
    company_id = get_current_company_id()
    if not _get_project_or_404(project_id, company_id):
        return jsonify({"error": "Project not found."}), 404

    devices = (
        ProjectDevice.query
        .filter_by(project_id=project_id, company_id=company_id)
        .order_by(ProjectDevice.created_at.asc())
        .all()
    )
    return jsonify({"devices": [d.to_dict() for d in devices]}), 200


@projects_bp.post("/<project_id>/devices")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def add_project_device(project_id):
    company_id = get_current_company_id()
    if not _get_project_or_404(project_id, company_id):
        return jsonify({"error": "Project not found."}), 404

    data = request.get_json() or {}
    template_id = data.get("template_id")
    if not template_id:
        return jsonify({"error": "template_id is required."}), 422

    if not _accessible_template(template_id, company_id):
        return jsonify({"error": "Device template not found."}), 404

    device = ProjectDevice(
        project_id=project_id,
        company_id=company_id,
        template_id=template_id,
        trade=data.get("trade") or None,
        extra_trades=data.get("extra_trades") or [],
        label=data.get("label") or None,
        room=data.get("room") or None,
        rack_position=data.get("rack_position") or None,
        ip_addresses=data.get("ip_addresses") or [],
        stream_urls=data.get("stream_urls") or [],
        username=data.get("username") or None,
        password=data.get("password") or None,
        firmware_version=data.get("firmware_version") or None,
        rs232_settings=data.get("rs232_settings") or None,
        notes=data.get("notes") or None,
    )
    db.session.add(device)
    db.session.commit()
    return jsonify({"device": device.to_dict()}), 201


@projects_bp.put("/<project_id>/devices/<device_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def update_project_device(project_id, device_id):
    company_id = get_current_company_id()
    if not _get_project_or_404(project_id, company_id):
        return jsonify({"error": "Project not found."}), 404

    device = ProjectDevice.query.filter_by(
        id=device_id, project_id=project_id, company_id=company_id
    ).first()
    if not device:
        return jsonify({"error": "Device not found."}), 404

    data = request.get_json() or {}
    for field in ("trade", "label", "room", "rack_position", "username", "password", "firmware_version", "notes"):
        if field in data:
            setattr(device, field, data[field] or None)
    if "extra_trades" in data:
        device.extra_trades = data["extra_trades"] or []
    if "ip_addresses" in data:
        device.ip_addresses = data["ip_addresses"] or []
    if "stream_urls" in data:
        device.stream_urls = data["stream_urls"] or []
    if "rs232_settings" in data:
        device.rs232_settings = data["rs232_settings"] or None

    db.session.commit()
    return jsonify({"device": device.to_dict()}), 200


@projects_bp.patch("/<project_id>/devices/<device_id>/position")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def update_device_position(project_id, device_id):
    """Lightweight endpoint — saves canvas node position for a single trade."""
    company_id = get_current_company_id()
    if not _get_project_or_404(project_id, company_id):
        return jsonify({"error": "Project not found."}), 404

    device = ProjectDevice.query.filter_by(
        id=device_id, project_id=project_id, company_id=company_id
    ).first()
    if not device:
        return jsonify({"error": "Device not found."}), 404

    data = request.get_json() or {}
    trade = data.get("trade")
    position = data.get("position")  # { x, y }
    if not trade or not isinstance(position, dict):
        return jsonify({"error": "trade and position are required."}), 422

    current = device.node_position or {}
    current[trade] = {"x": position.get("x", 0), "y": position.get("y", 0)}
    device.node_position = current
    db.session.commit()
    return jsonify({"ok": True}), 200


@projects_bp.patch("/<project_id>/devices/<device_id>/rack-placement")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def update_rack_placement(project_id, device_id):
    """Set or clear which rack slot this device occupies."""
    company_id = get_current_company_id()
    if not _get_project_or_404(project_id, company_id):
        return jsonify({"error": "Project not found."}), 404

    device = ProjectDevice.query.filter_by(
        id=device_id, project_id=project_id, company_id=company_id
    ).first()
    if not device:
        return jsonify({"error": "Device not found."}), 404

    data = request.get_json() or {}
    # Pass rack_id=null to remove from rack
    device.rack_id = data.get("rack_id") or None
    device.rack_slot = data.get("rack_slot") or None
    device.rack_facing = data.get("rack_facing") or None
    db.session.commit()
    return jsonify({"device": device.to_dict()}), 200


@projects_bp.delete("/<project_id>/devices/<device_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def delete_project_device(project_id, device_id):
    company_id = get_current_company_id()
    if not _get_project_or_404(project_id, company_id):
        return jsonify({"error": "Project not found."}), 404

    device = ProjectDevice.query.filter_by(
        id=device_id, project_id=project_id, company_id=company_id
    ).first()
    if not device:
        return jsonify({"error": "Device not found."}), 404

    db.session.delete(device)
    db.session.commit()
    return jsonify({"message": "Device removed."}), 200
