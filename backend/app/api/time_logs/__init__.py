from flask import Blueprint

time_logs_bp = Blueprint("time_logs", __name__)

from app.api.time_logs import routes  # noqa: F401, E402
