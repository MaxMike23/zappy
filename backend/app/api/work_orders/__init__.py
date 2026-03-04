from flask import Blueprint

work_orders_bp = Blueprint("work_orders", __name__)

from app.api.work_orders import routes  # noqa: F401, E402
