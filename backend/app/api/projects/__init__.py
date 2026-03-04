from flask import Blueprint

projects_bp = Blueprint("projects", __name__)

from app.api.projects import routes  # noqa: F401, E402
