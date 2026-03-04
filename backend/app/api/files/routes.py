import os
from flask import request, jsonify, send_file
from flask_jwt_extended import jwt_required

from app.api.files import files_bp
from app.extensions import db
from app.models.file import UploadedFile
from app.models.user import UserRole
from app.utils.uploads import save_upload, delete_upload, get_full_path
from app.utils.decorators import (
    require_role,
    get_current_user_id,
    get_current_company_id,
    is_superadmin,
)


@files_bp.post("/upload")
@jwt_required()
def upload_file():
    """
    Multipart upload. Attach to a work_order or project.
    Form fields: work_order_id (or project_id), caption (optional).
    File field: file
    """
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    if "file" not in request.files:
        return jsonify({"error": "No file field in request"}), 400

    file = request.files["file"]
    work_order_id = request.form.get("work_order_id")
    project_id = request.form.get("project_id")
    caption = request.form.get("caption", "")

    if not work_order_id and not project_id:
        return jsonify({"error": "work_order_id or project_id is required"}), 400

    # Build subfolder path
    if work_order_id:
        subfolder = f"work_orders/{work_order_id}"
    else:
        subfolder = f"projects/{project_id}"

    try:
        upload_data = save_upload(file, str(company_id), subfolder)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    uploaded = UploadedFile(
        company_id=company_id,
        work_order_id=work_order_id or None,
        project_id=project_id or None,
        uploaded_by_id=current_user_id,
        caption=caption.strip() or None,
        **upload_data,
    )
    db.session.add(uploaded)
    db.session.commit()

    return jsonify({"file": uploaded.to_dict(include_url=True)}), 201


@files_bp.get("/<uuid:file_id>/download")
@jwt_required()
def download_file(file_id):
    """Serves the file for download. Validates company access."""
    company_id = get_current_company_id()

    uploaded = UploadedFile.query.get_or_404(file_id)
    if not is_superadmin() and str(uploaded.company_id) != str(company_id):
        return jsonify({"error": "Not found"}), 404

    full_path = get_full_path(uploaded.storage_path)
    if not os.path.exists(full_path):
        return jsonify({"error": "File not found on disk"}), 404

    return send_file(
        full_path,
        download_name=uploaded.original_filename,
        as_attachment=True,
    )


@files_bp.get("/")
@jwt_required()
def list_files():
    """Lists files for a given work_order_id or project_id."""
    company_id = get_current_company_id()

    work_order_id = request.args.get("work_order_id")
    project_id = request.args.get("project_id")

    if not work_order_id and not project_id:
        return jsonify({"error": "work_order_id or project_id is required"}), 400

    query = UploadedFile.query.filter_by(company_id=company_id)
    if work_order_id:
        query = query.filter_by(work_order_id=work_order_id)
    if project_id:
        query = query.filter_by(project_id=project_id)

    files = query.order_by(UploadedFile.created_at.desc()).all()
    return jsonify({"files": [f.to_dict(include_url=True) for f in files]}), 200


@files_bp.delete("/<uuid:file_id>")
@jwt_required()
@require_role(UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.SUPERADMIN)
def delete_file(file_id):
    company_id = get_current_company_id()
    current_user_id = get_current_user_id()

    uploaded = UploadedFile.query.get_or_404(file_id)
    if not is_superadmin() and str(uploaded.company_id) != str(company_id):
        return jsonify({"error": "Not found"}), 404

    delete_upload(uploaded.storage_path)
    db.session.delete(uploaded)
    db.session.commit()

    return jsonify({"message": "File deleted"}), 200
