import os
from flask import Flask, jsonify
from app.config import config
from app.extensions import db, migrate, jwt, cors


def create_app(config_name: str = None) -> Flask:
    app = Flask(__name__)

    # Load config
    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "development")
    app.config.from_object(config.get(config_name, config["default"]))

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": os.environ.get("CORS_ORIGINS", "*")}},
        # Do NOT set supports_credentials=True with a wildcard origin —
        # browsers reject that combination. JWT is sent in the Authorization
        # header, not cookies, so credential support is not needed.
    )

    # Ensure upload directory exists
    os.makedirs(app.config.get("UPLOAD_FOLDER", "uploads"), exist_ok=True)

    # Import models so Alembic/Flask-Migrate sees them.
    # Must use `as` alias — plain `import app.models` would bind the name `app`
    # in this local scope, overwriting the Flask instance above.
    with app.app_context():
        import app.models as _models  # noqa: F401

    # JWT token blocklist check
    from app.models.user import TokenBlocklist

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        jti = jwt_payload["jti"]
        return db.session.query(TokenBlocklist).filter_by(jti=jti).first() is not None

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has expired", "code": "token_expired"}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return jsonify({"error": "Invalid token", "code": "invalid_token"}), 401

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return jsonify({"error": "Authorization required", "code": "authorization_required"}), 401

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has been revoked", "code": "token_revoked"}), 401

    # Register blueprints
    from app.api.auth import auth_bp
    from app.api.users import users_bp
    from app.api.companies import companies_bp
    from app.api.projects import projects_bp
    from app.api.work_orders import work_orders_bp
    from app.api.workflow import workflow_bp
    from app.api.time_logs import time_logs_bp
    from app.api.files import files_bp
    from app.api.visits import visits_bp
    from app.api.attendance import attendance_bp
    from app.api.devices import devices_bp

    app.register_blueprint(auth_bp,        url_prefix="/api/auth")
    app.register_blueprint(users_bp,       url_prefix="/api/users")
    app.register_blueprint(companies_bp,   url_prefix="/api/companies")
    app.register_blueprint(projects_bp,    url_prefix="/api/projects")
    app.register_blueprint(work_orders_bp, url_prefix="/api/work-orders")
    app.register_blueprint(workflow_bp,    url_prefix="/api/workflow")
    app.register_blueprint(time_logs_bp,   url_prefix="/api/time-logs")
    app.register_blueprint(files_bp,       url_prefix="/api/files")
    app.register_blueprint(visits_bp,      url_prefix="/api/visits")
    app.register_blueprint(attendance_bp,  url_prefix="/api/attendance")
    app.register_blueprint(devices_bp,     url_prefix="/api/devices/library")

    # Health check
    @app.get("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    return app
