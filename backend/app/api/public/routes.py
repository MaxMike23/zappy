import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from flask import current_app, jsonify, request
from . import public_bp

# ROADMAP.md is four directories above this file: backend/app/api/public/ -> /opt/zappy/
_ROADMAP_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../ROADMAP.md"))


def _feature_enabled():
    return current_app.config.get("SHOW_PUBLIC_ROADMAP", False)


def _smtp_connect():
    host = current_app.config["SMTP_HOST"]
    port = current_app.config["SMTP_PORT"]
    user = current_app.config["SMTP_USER"]
    pw   = current_app.config["SMTP_PASS"]
    server = smtplib.SMTP(host, port, timeout=10)
    server.starttls()
    server.login(user, pw)
    return server, user


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

    data    = request.get_json(silent=True) or {}
    name    = (data.get("name") or "").strip()
    email   = (data.get("email") or "").strip()
    message = (data.get("message") or "").strip()

    if not message:
        return jsonify({"error": "Message is required"}), 400

    to_addr   = current_app.config["SUGGESTIONS_TO_EMAIL"]
    smtp_user = current_app.config["SMTP_USER"]
    auto_reply_text = (current_app.config.get("SUGGESTION_AUTO_REPLY") or "").strip()

    if not to_addr or not smtp_user:
        current_app.logger.warning("Suggestion received but SMTP is not configured.")
        return jsonify({"ok": True})

    # ── Build notification email to inbox ────────────────────────────────────
    subject    = f"Zappy suggestion{f' from {name}' if name else ''}"
    body_lines = []
    if name:
        body_lines.append(f"Name:    {name}")
    if email:
        body_lines.append(f"Email:   {email}")
    body_lines += ["", message]

    notif = MIMEText("\n".join(body_lines), "plain", "utf-8")
    notif["Subject"]  = subject
    notif["From"]     = f"Zappy Feedback <{smtp_user}>"
    notif["To"]       = to_addr
    if email:
        notif["Reply-To"] = f"{name} <{email}>" if name else email

    try:
        server, from_addr = _smtp_connect()
        with server:
            server.sendmail(from_addr, [to_addr], notif.as_string())

            # ── Auto-reply to submitter (only if they gave an email) ──────────
            if email and auto_reply_text:
                greeting = f"Hi {name},\n\n" if name else "Hi,\n\n"
                reply_body = greeting + auto_reply_text

                reply = MIMEText(reply_body, "plain", "utf-8")
                reply["Subject"] = "Re: Your Zappy suggestion"
                reply["From"]    = f"Zappy <{smtp_user}>"
                reply["To"]      = f"{name} <{email}>" if name else email
                server.sendmail(from_addr, [email], reply.as_string())

    except Exception as exc:
        current_app.logger.error("Failed to send suggestion email: %s", exc)
        return jsonify({"error": "Could not send message. Please try again later."}), 500

    return jsonify({"ok": True})
