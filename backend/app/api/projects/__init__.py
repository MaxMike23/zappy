from flask import Blueprint

projects_bp = Blueprint("projects", __name__)

from app.api.projects import routes             # noqa: F401, E402
from app.api.projects import device_routes      # noqa: F401, E402
from app.api.projects import connection_routes  # noqa: F401, E402
from app.api.projects import diagram_routes     # noqa: F401, E402
