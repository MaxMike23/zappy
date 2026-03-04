from flask import Blueprint

files_bp = Blueprint("files", __name__)

from app.api.files import routes  # noqa: F401, E402
