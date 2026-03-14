from flask import request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from app.api.devices import devices_bp
from app.extensions import db
from app.models.device import DeviceTemplate, DeviceCategory
from app.models.user import UserRole
from app.utils.audit import log_audit
from app.utils.decorators import (
    require_role,
    get_current_user_id,
    get_current_company_id,
    get_current_role,
    is_superadmin,
)

VALID_SIGNAL_TYPES = {
    "Video", "Audio", "Control", "Network", "Power",
    "Data", "Security", "Access Control", "Fire", "Other",
}

VALID_CONNECTOR_TYPES = {
    "HDMI", "SDI", "DisplayPort", "RS232", "RS485", "XLR", "TRS", "TS",
    "RCA", "Dante", "AES67", "Cat6", "Fiber", "Relay", "IR", "USB",
    "Wiegand", "OSDP", "RS485 2-Wire", "Dry Contact", "NAC Circuit", "SLC", "Other",
}


def _validate_ports(ports):
    """Returns an error string or None if ports are valid."""
    if not isinstance(ports, list):
        return "ports must be an array"
    for i, p in enumerate(ports):
        if not isinstance(p, dict):
            return f"port[{i}] must be an object"
        if not p.get("id"):
            return f"port[{i}] missing id"
        if not p.get("label", "").strip():
            return f"port[{i}] missing label"
        if p.get("direction") not in ("input", "output"):
            return f"port[{i}] direction must be 'input' or 'output'"
        if p.get("signal_type") not in VALID_SIGNAL_TYPES:
            return f"port[{i}] invalid signal_type"
        ct = p.get("connector_type")
        if ct and ct not in VALID_CONNECTOR_TYPES:
            return f"port[{i}] invalid connector_type"
    return None


def _clean_port(p):
    return {
        "id": str(p["id"]),
        "label": p["label"].strip(),
        "direction": p["direction"],
        "signal_type": p["signal_type"],
        "connector_type": p.get("connector_type") or None,
    }


# ── List ─────────────────────────────────────────────────────────────────────

@devices_bp.get("")
@jwt_required()
def list_devices():
    """
    Returns all global (approved) templates + the current company's private templates.
    Superadmins see all records including other companies' private templates.
    """
    company_id = get_current_company_id()

    if is_superadmin():
        devices = DeviceTemplate.query.filter_by(is_pending=False).order_by(
            DeviceTemplate.make, DeviceTemplate.model
        ).all()
    else:
        devices = DeviceTemplate.query.filter(
            DeviceTemplate.is_pending == False,  # noqa: E712
            or_(
                DeviceTemplate.company_id == None,  # noqa: E711 — global
                DeviceTemplate.company_id == company_id,
            )
        ).order_by(DeviceTemplate.make, DeviceTemplate.model).all()

    return jsonify({"devices": [d.to_dict() for d in devices]}), 200


# ── Pending submissions (superadmin only) ────────────────────────────────────

@devices_bp.get("/pending")
@jwt_required()
@require_role(UserRole.SUPERADMIN)
def list_pending():
    """List all pending global submissions across all tenants."""
    devices = DeviceTemplate.query.filter_by(is_pending=True).order_by(
        DeviceTemplate.make, DeviceTemplate.model
    ).all()
    return jsonify({"devices": [d.to_dict() for d in devices]}), 200


# ── Create ────────────────────────────────────────────────────────────────────

@devices_bp.post("")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def create_device():
    """Creates a company-private device template."""
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    data = request.get_json()

    if not data:
        return jsonify({"error": "JSON body required"}), 400

    make = (data.get("make") or "").strip()
    model = (data.get("model") or "").strip()
    category = data.get("category", DeviceCategory.OTHER)

    if not make or not model:
        return jsonify({"error": "make and model are required"}), 400
    if category not in DeviceCategory.ALL:
        return jsonify({"error": f"Invalid category. Choose from: {DeviceCategory.ALL}"}), 400

    ports = data.get("ports", [])
    err = _validate_ports(ports)
    if err:
        return jsonify({"error": err}), 400

    # Superadmins create global templates directly (no pending step)
    if is_superadmin():
        device = DeviceTemplate(
            company_id=None,
            make=make,
            model=model,
            category=category,
            notes=data.get("notes"),
            is_pending=False,
            ports=[_clean_port(p) for p in ports],
        )
    else:
        device = DeviceTemplate(
            company_id=company_id,
            make=make,
            model=model,
            category=category,
            notes=data.get("notes"),
            is_pending=False,
            ports=[_clean_port(p) for p in ports],
        )

    db.session.add(device)
    db.session.flush()
    log_audit("created", "device_template", device.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"device": device.to_dict()}), 201


# ── Update ────────────────────────────────────────────────────────────────────

@devices_bp.put("/<uuid:device_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def update_device(device_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    device = DeviceTemplate.query.get_or_404(device_id)

    # Non-superadmins can only edit their own private templates
    if not is_superadmin():
        if device.company_id is None:
            return jsonify({"error": "Global templates can only be edited by superadmin"}), 403
        if device.company_id != company_id:
            return jsonify({"error": "Not found"}), 404

    data = request.get_json() or {}

    if "make" in data:
        device.make = data["make"].strip()
    if "model" in data:
        device.model = data["model"].strip()
    if "category" in data:
        if data["category"] not in DeviceCategory.ALL:
            return jsonify({"error": f"Invalid category"}), 400
        device.category = data["category"]
    if "notes" in data:
        device.notes = data["notes"]
    if "ports" in data:
        err = _validate_ports(data["ports"])
        if err:
            return jsonify({"error": err}), 400
        device.ports = [_clean_port(p) for p in data["ports"]]

    log_audit("updated", "device_template", device.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"device": device.to_dict()}), 200


# ── Delete ────────────────────────────────────────────────────────────────────

@devices_bp.delete("/<uuid:device_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def delete_device(device_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    device = DeviceTemplate.query.get_or_404(device_id)

    if not is_superadmin():
        if device.company_id != company_id:
            return jsonify({"error": "Not found"}), 404
        if device.company_id is None:
            return jsonify({"error": "Global templates can only be deleted by superadmin"}), 403

    log_audit("deleted", "device_template", device.id, company_id, current_user_id)
    db.session.delete(device)
    db.session.commit()

    return jsonify({"message": "Device deleted"}), 200


# ── Submit for global approval ────────────────────────────────────────────────

@devices_bp.post("/<uuid:device_id>/submit")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER)
def submit_device(device_id):
    """Submit a company-private template for global approval."""
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    device = DeviceTemplate.query.get_or_404(device_id)

    if device.company_id != company_id:
        return jsonify({"error": "Not found"}), 404
    if device.company_id is None:
        return jsonify({"error": "Already a global template"}), 409
    if device.is_pending:
        return jsonify({"error": "Already submitted for review"}), 409

    device.is_pending = True
    log_audit("submitted", "device_template", device.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"device": device.to_dict()}), 200


# ── Approve pending submission ─────────────────────────────────────────────────

@devices_bp.post("/<uuid:device_id>/approve")
@jwt_required()
@require_role(UserRole.SUPERADMIN)
def approve_device(device_id):
    """Approve a pending submission — promotes it to a global template."""
    device = DeviceTemplate.query.get_or_404(device_id)

    if not device.is_pending:
        return jsonify({"error": "Device is not pending approval"}), 409

    device.company_id = None
    device.is_pending = False
    log_audit("approved", "device_template", device.id, None, get_current_user_id())
    db.session.commit()

    return jsonify({"device": device.to_dict()}), 200


# ── Reject pending submission ─────────────────────────────────────────────────

@devices_bp.post("/<uuid:device_id>/reject")
@jwt_required()
@require_role(UserRole.SUPERADMIN)
def reject_device(device_id):
    """Reject a pending submission — returns it to private status."""
    device = DeviceTemplate.query.get_or_404(device_id)

    if not device.is_pending:
        return jsonify({"error": "Device is not pending approval"}), 409

    device.is_pending = False
    log_audit("rejected", "device_template", device.id, None, get_current_user_id())
    db.session.commit()

    return jsonify({"device": device.to_dict()}), 200
