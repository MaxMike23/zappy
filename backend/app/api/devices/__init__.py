from flask import Blueprint

devices_bp = Blueprint("devices", __name__)

from app.api.devices import routes  # noqa: F401, E402
