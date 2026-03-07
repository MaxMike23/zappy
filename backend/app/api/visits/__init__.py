from flask import Blueprint

visits_bp = Blueprint("visits", __name__)

from app.api.visits import routes  # noqa: F401, E402
