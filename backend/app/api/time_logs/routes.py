from datetime import datetime
from flask import request, jsonify
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app.api.time_logs import time_logs_bp
from app.extensions import db
from app.models.time_log import TimeLog
from app.models.user import UserRole
from app.utils.audit import log_audit
from app.utils.decorators import (
    require_role,
    get_current_user_id,
    get_current_company_id,
    get_current_role,
    is_superadmin,
)
from app.utils.pagination import paginate


def _parse_dt(value):
    """Parse ISO 8601 datetime string to datetime object."""
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@time_logs_bp.get("/")
@jwt_required()
def list_time_logs():
    """
    Returns paginated time logs.
    Technicians see only their own logs.
    Filters: work_order_id, user_id, is_approved, date_after, date_before.
    """
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    query = TimeLog.query.filter_by(company_id=company_id)

    # Technicians can only see their own time logs
    if current_role == UserRole.TECHNICIAN:
        query = query.filter_by(user_id=current_user_id)
    elif user_id := request.args.get("user_id"):
        query = query.filter_by(user_id=user_id)

    if wo_id := request.args.get("work_order_id"):
        query = query.filter_by(work_order_id=wo_id)
    if request.args.get("is_approved") is not None:
        approved = request.args.get("is_approved").lower() == "true"
        query = query.filter_by(is_approved=approved)
    if date_after := request.args.get("date_after"):
        query = query.filter(TimeLog.start_time >= _parse_dt(date_after))
    if date_before := request.args.get("date_before"):
        query = query.filter(TimeLog.start_time <= _parse_dt(date_before))

    query = query.order_by(TimeLog.start_time.desc())

    result = paginate(query)
    result["items"] = [t.to_dict() for t in result["items"]]
    return jsonify(result), 200


@time_logs_bp.post("/")
@jwt_required()
def create_time_log():
    """
    Any staff member can log time.
    Managers/admins can log on behalf of any user in the company.
    Technicians can only log for themselves.
    """
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400
    if not data.get("work_order_id") or not data.get("start_time"):
        return jsonify({"error": "work_order_id and start_time are required"}), 400

    # Resolve who the log is for
    target_user_id = data.get("user_id") or str(current_user_id)

    if current_role == UserRole.TECHNICIAN and str(target_user_id) != str(current_user_id):
        return jsonify({"error": "Technicians can only log time for themselves"}), 403

    start_time = _parse_dt(data["start_time"])
    end_time = _parse_dt(data.get("end_time"))

    if end_time and end_time <= start_time:
        return jsonify({"error": "end_time must be after start_time"}), 400

    log = TimeLog(
        company_id=company_id,
        work_order_id=data["work_order_id"],
        user_id=target_user_id,
        start_time=start_time,
        end_time=end_time,
        notes=data.get("notes"),
    )
    if end_time:
        log.compute_duration()

    db.session.add(log)
    db.session.flush()
    log_audit("created", "time_log", log.id, company_id, current_user_id)
    db.session.commit()

    return jsonify({"time_log": log.to_dict()}), 201


@time_logs_bp.get("/<uuid:log_id>")
@jwt_required()
def get_time_log(log_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    log = TimeLog.query.filter_by(id=log_id, company_id=company_id).first_or_404()

    if current_role == UserRole.TECHNICIAN and log.user_id != current_user_id:
        return jsonify({"error": "Not found"}), 404

    return jsonify({"time_log": log.to_dict()}), 200


@time_logs_bp.put("/<uuid:log_id>")
@jwt_required()
def update_time_log(log_id):
    """
    Technicians can update their own unapproved logs.
    Managers/admins can update any log and toggle approval.
    """
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    log = TimeLog.query.filter_by(id=log_id, company_id=company_id).first_or_404()

    if current_role == UserRole.TECHNICIAN:
        if log.user_id != current_user_id:
            return jsonify({"error": "Not found"}), 404
        if log.is_approved:
            return jsonify({"error": "Cannot modify an approved time log"}), 403

    data = request.get_json() or {}
    before = log.to_dict()

    if "start_time" in data:
        log.start_time = _parse_dt(data["start_time"])
    if "end_time" in data:
        log.end_time = _parse_dt(data["end_time"])
    if "notes" in data:
        log.notes = data["notes"]

    # Recompute duration if times changed
    if log.end_time:
        if log.end_time <= log.start_time:
            db.session.rollback()
            return jsonify({"error": "end_time must be after start_time"}), 400
        log.compute_duration()

    # Approval — managers/admins only
    if current_role in [UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN]:
        if "is_approved" in data:
            log.is_approved = bool(data["is_approved"])
            if log.is_approved:
                log.approved_by_id = current_user_id
                log.approved_at = datetime.utcnow()
            else:
                log.approved_by_id = None
                log.approved_at = None

    log_audit("updated", "time_log", log.id, company_id, current_user_id,
              changes={"before": before, "after": log.to_dict()})
    db.session.commit()

    return jsonify({"time_log": log.to_dict()}), 200


@time_logs_bp.delete("/<uuid:log_id>")
@jwt_required()
def delete_time_log(log_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    log = TimeLog.query.filter_by(id=log_id, company_id=company_id).first_or_404()

    if current_role == UserRole.TECHNICIAN:
        if log.user_id != current_user_id:
            return jsonify({"error": "Not found"}), 404
        if log.is_approved:
            return jsonify({"error": "Cannot delete an approved time log"}), 403

    log_audit("deleted", "time_log", log.id, company_id, current_user_id)
    db.session.delete(log)
    db.session.commit()

    return jsonify({"message": "Time log deleted"}), 200


@time_logs_bp.get("/summary")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def time_summary():
    """
    Aggregated time totals grouped by user for the company.
    Filters: work_order_id, date_after, date_before.
    Returns: [{ user_id, user_name, total_minutes, total_logs }]
    """
    from app.models.user import User

    company_id = get_current_company_id()
    query = db.session.query(
        TimeLog.user_id,
        User.first_name,
        User.last_name,
        func.sum(TimeLog.duration_minutes).label("total_minutes"),
        func.count(TimeLog.id).label("total_logs"),
    ).join(User, TimeLog.user_id == User.id).filter(
        TimeLog.company_id == company_id
    )

    if wo_id := request.args.get("work_order_id"):
        query = query.filter(TimeLog.work_order_id == wo_id)
    if date_after := request.args.get("date_after"):
        query = query.filter(TimeLog.start_time >= _parse_dt(date_after))
    if date_before := request.args.get("date_before"):
        query = query.filter(TimeLog.start_time <= _parse_dt(date_before))

    results = query.group_by(TimeLog.user_id, User.first_name, User.last_name).all()

    return jsonify({
        "summary": [
            {
                "user_id": str(r.user_id),
                "user_name": f"{r.first_name} {r.last_name}",
                "total_minutes": r.total_minutes or 0,
                "total_hours": round((r.total_minutes or 0) / 60, 2),
                "total_logs": r.total_logs,
            }
            for r in results
        ]
    }), 200
