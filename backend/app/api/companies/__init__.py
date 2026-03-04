from flask import Blueprint

companies_bp = Blueprint("companies", __name__)

from app.api.companies import routes  # noqa: F401, E402
