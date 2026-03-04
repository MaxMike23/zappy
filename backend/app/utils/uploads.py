import os
import uuid
from flask import current_app
from werkzeug.utils import secure_filename


def allowed_file(filename: str) -> bool:
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in current_app.config["ALLOWED_EXTENSIONS"]
    )


def save_upload(file, company_id: str, subfolder: str) -> dict:
    """
    Saves a file to disk under UPLOAD_FOLDER/<company_id>/<subfolder>/<uuid>.<ext>.
    Returns a dict with storage_path, original_filename, file_size, mime_type.

    subfolder: typically 'work_orders/<work_order_id>' or 'projects/<project_id>'
    """
    if not file or file.filename == "":
        raise ValueError("No file provided")

    if not allowed_file(file.filename):
        raise ValueError(f"File type not allowed: {file.filename}")

    original_filename = secure_filename(file.filename)
    ext = original_filename.rsplit(".", 1)[1].lower()
    stored_name = f"{uuid.uuid4()}.{ext}"

    # Build directory path
    dir_path = os.path.join(
        current_app.config["UPLOAD_FOLDER"],
        str(company_id),
        subfolder,
    )
    os.makedirs(dir_path, exist_ok=True)

    file_path = os.path.join(dir_path, stored_name)
    file.save(file_path)

    file_size = os.path.getsize(file_path)
    # Relative path stored in DB
    storage_path = os.path.join(str(company_id), subfolder, stored_name)

    return {
        "original_filename": original_filename,
        "storage_path": storage_path,
        "file_size": file_size,
        "mime_type": file.content_type,
    }


def delete_upload(storage_path: str) -> bool:
    """Deletes a file from disk. Returns True if deleted, False if not found."""
    full_path = os.path.join(current_app.config["UPLOAD_FOLDER"], storage_path)
    if os.path.exists(full_path):
        os.remove(full_path)
        return True
    return False


def get_full_path(storage_path: str) -> str:
    """Returns the absolute path for serving a file."""
    return os.path.join(current_app.config["UPLOAD_FOLDER"], storage_path)
