import os
from datetime import timedelta


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key")
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"connect_args": {"client_encoding": "utf8"}}

    # Public roadmap / suggestions feature — set to "true" in dev, leave unset in prod
    SHOW_PUBLIC_ROADMAP = os.environ.get("SHOW_PUBLIC_ROADMAP", "false").lower() == "true"

    # SMTP settings for suggestion emails (Hostinger: smtp.hostinger.com, port 587)
    SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.hostinger.com")
    SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_USER = os.environ.get("SMTP_USER", "")
    SMTP_PASS = os.environ.get("SMTP_PASS", "")
    SUGGESTIONS_TO_EMAIL = os.environ.get("SUGGESTIONS_TO_EMAIL", "")
    # Plain-text body sent back to the submitter after their suggestion is received.
    # Leave blank to disable auto-reply.
    SUGGESTION_AUTO_REPLY = os.environ.get("SUGGESTION_AUTO_REPLY", "")

    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)

    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "uploads")
    # 50 MB max file size
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024
    ALLOWED_EXTENSIONS = {
        "png", "jpg", "jpeg", "gif", "webp",
        "pdf", "doc", "docx", "xls", "xlsx",
        "mp4", "mov", "avi",
    }


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "postgresql://zappy_user:zappy_pass@localhost:5432/zappy_test"
    JWT_SECRET_KEY = "test-jwt-secret-key"


config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}
