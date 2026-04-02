import os
import smtplib
from email.mime.text import MIMEText
from flask import current_app, jsonify, request
from . import public_bp

# ROADMAP.md is four directories above this file: backend/app/api/public/ -> /opt/zappy/
_ROADMAP_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../ROADMAP.md"))


def _feature_enabled():
    return current_app.config.get("SHOW_PUBLIC_ROADMAP", False)


@public_bp.get("/roadmap")
def get_roadmap():
    if not _feature_enabled():
        return jsonify({"error": "Not found"}), 404
    try:
        with open(_ROADMAP_PATH, "r", encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        return jsonify({"error": "Roadmap not available"}), 404
    return jsonify({"content": content})


@public_bp.post("/suggestion")
def post_suggestion():
    if not _feature_enabled():
        return jsonify({"error": "Not found"}), 404

    data = request.get_json(silent=True) or {}
    name    = (data.get("name") or "").strip()
    email   = (data.get("email") or "").strip()
    message = (data.get("message") or "").strip()

    if not message:
        return jsonify({"error": "Message is required"}), 400

    to_addr   = current_app.config["SUGGESTIONS_TO_EMAIL"]
    smtp_user = current_app.config["SMTP_USER"]
    smtp_pass = current_app.config["SMTP_PASS"]
    smtp_host = current_app.config["SMTP_HOST"]
    smtp_port = current_app.config["SMTP_PORT"]

    if not to_addr or not smtp_user:
        # Config incomplete — log and acknowledge without sending
        current_app.logger.warning("Suggestion received but SMTP is not configured.")
        return jsonify({"ok": True})

    from_label = f"{name} via Zappy Feedback" if name else "Zappy Feedback"
    reply_to   = email if email else smtp_user
    subject    = f"Zappy suggestion{f' from {name}' if name else ''}"
    body_lines = []
    if name:
        body_lines.append(f"Name: {name}")
    if email:
        body_lines.append(f"Email: {email}")
    body_lines += ["", message]

    msg = MIMEText("\n".join(body_lines), "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"]    = f"{from_label} <{smtp_user}>"
    msg["To"]      = to_addr
    msg["Reply-To"] = reply_to

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [to_addr], msg.as_string())
    except Exception as exc:
        current_app.logger.error("Failed to send suggestion email: %s", exc)
        return jsonify({"error": "Could not send message. Please try again later."}), 500

    return jsonify({"ok": True})
