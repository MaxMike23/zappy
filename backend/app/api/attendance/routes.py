from datetime import datetime, date as date_type
from flask import request, jsonify
from flask_jwt_extended import jwt_required

from app.api.attendance import attendance_bp
from app.extensions import db
from app.models.attendance import Attendance
from app.models.user import UserRole
from app.utils.decorators import (
    get_current_user_id,
    get_current_company_id,
    get_current_role,
)
from app.utils.pagination import paginate


@attendance_bp.get("/")
@jwt_required()
def list_attendance():
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    current_role = get_current_role()

    query = Attendance.query.filter_by(company_id=company_id)

    if current_role == UserRole.TECHNICIAN:
        query = query.filter_by(user_id=current_user_id)
    elif user_id := request.args.get("user_id"):
        query = query.filter_by(user_id=user_id)

    if date_after := request.args.get("date_after"):
        query = query.filter(Attendance.date >= date_after)
    if date_before := request.args.get("date_before"):
        query = query.filter(Attendance.date <= date_before)

    query = query.order_by(Attendance.date.desc(), Attendance.clock_in.desc())
    result = paginate(query)
    result["items"] = [a.to_dict() for a in result["items"]]
    return jsonify(result), 200


@attendance_bp.get("/today")
@jwt_required()
def today_attendance():
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    today = date_type.today()

    record = Attendance.query.filter_by(
        company_id=company_id, user_id=current_user_id, date=today
    ).first()

    return jsonify({"attendance": record.to_dict() if record else None}), 200


@attendance_bp.post("/clock-in")
@jwt_required()
def clock_in():
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    today = date_type.today()

    existing = Attendance.query.filter_by(
        company_id=company_id, user_id=current_user_id, date=today
    ).first()

    if existing:
        return jsonify({"error": "Already clocked in today"}), 409

    record = Attendance(
        company_id=company_id,
        user_id=current_user_id,
        date=today,
        clock_in=datetime.utcnow(),
    )
    db.session.add(record)
    db.session.commit()
    return jsonify({"attendance": record.to_dict()}), 201


@attendance_bp.post("/clock-out")
@jwt_required()
def clock_out():
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()
    today = date_type.today()

    record = Attendance.query.filter_by(
        company_id=company_id, user_id=current_user_id, date=today
    ).first()

    if not record:
        return jsonify({"error": "Not clocked in today"}), 400
    if record.clock_out:
        return jsonify({"error": "Already clocked out today"}), 400

    record.clock_out = datetime.utcnow()
    db.session.commit()
    return jsonify({"attendance": record.to_dict()}), 200
