from flask import Blueprint

public_bp = Blueprint("public", __name__)

from . import routes  # noqa: F401, E402
