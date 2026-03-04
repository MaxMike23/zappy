from flask import Blueprint

workflow_bp = Blueprint("workflow", __name__)

from app.api.workflow import routes  # noqa: F401, E402
