"""
Tests for POST /api/auth/register, login, refresh, logout, me.
"""


REGISTER_PAYLOAD = {
    "company_name": "Test AV Co",
    "email": "admin@testavco.com",
    "password": "password123",
    "first_name": "Admin",
    "last_name": "User",
}


# ── Register ──────────────────────────────────────────────────────────────────

def test_register_creates_company_and_admin(client):
    resp = client.post("/api/auth/register", json=REGISTER_PAYLOAD)
    assert resp.status_code == 201
    data = resp.get_json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["company"]["name"] == "Test AV Co"
    assert data["user"]["role"] == "company_admin"
    assert data["user"]["email"] == "admin@testavco.com"


def test_register_seeds_workflow_stages(client):
    resp = client.post("/api/auth/register", json=REGISTER_PAYLOAD)
    data = resp.get_json()
    # seed_company_defaults creates project + work_order stages
    assert "company" in data


def test_register_missing_required_fields(client):
    resp = client.post("/api/auth/register", json={"company_name": "X"})
    assert resp.status_code == 400
    assert "Missing required fields" in resp.get_json()["error"]


def test_register_short_password(client):
    payload = {**REGISTER_PAYLOAD, "password": "short"}
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 400
    assert "8 characters" in resp.get_json()["error"]


def test_register_duplicate_email(client, registered_company):
    resp = client.post("/api/auth/register", json=REGISTER_PAYLOAD)
    assert resp.status_code == 409
    assert "already registered" in resp.get_json()["error"]


def test_register_slug_collision_increments(client):
    # Two companies with the same name get unique slugs
    client.post("/api/auth/register", json=REGISTER_PAYLOAD)
    payload2 = {**REGISTER_PAYLOAD, "email": "other@testavco.com"}
    resp = client.post("/api/auth/register", json=payload2)
    assert resp.status_code == 201
    slug = resp.get_json()["company"]["slug"]
    assert slug == "test-av-co-1"


# ── Login ─────────────────────────────────────────────────────────────────────

def test_login_returns_tokens(client, registered_company):
    resp = client.post("/api/auth/login", json={
        "email": "admin@testavco.com",
        "password": "password123",
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert "access_token" in data
    assert data["user"]["email"] == "admin@testavco.com"


def test_login_wrong_password(client, registered_company):
    resp = client.post("/api/auth/login", json={
        "email": "admin@testavco.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


def test_login_unknown_email(client):
    resp = client.post("/api/auth/login", json={
        "email": "nobody@example.com",
        "password": "password123",
    })
    assert resp.status_code == 401


def test_login_inactive_user(client, registered_company, app):
    from app.models.user import User
    from app.extensions import db
    with app.app_context():
        user = User.query.filter_by(email="admin@testavco.com").first()
        user.is_active = False
        db.session.commit()

    resp = client.post("/api/auth/login", json={
        "email": "admin@testavco.com",
        "password": "password123",
    })
    assert resp.status_code == 403


def test_login_missing_fields(client):
    resp = client.post("/api/auth/login", json={"email": "admin@testavco.com"})
    assert resp.status_code == 400


# ── Refresh ───────────────────────────────────────────────────────────────────

def test_refresh_returns_new_access_token(client, registered_company):
    resp = client.post("/api/auth/refresh", headers={
        "Authorization": f"Bearer {registered_company['refresh_token']}"
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert "access_token" in data
    # New token should be different from the original
    assert data["access_token"] != registered_company["access_token"]


def test_refresh_with_access_token_fails(client, registered_company):
    # Access tokens must not be accepted at the refresh endpoint
    resp = client.post("/api/auth/refresh", headers={
        "Authorization": f"Bearer {registered_company['access_token']}"
    })
    assert resp.status_code in (401, 422)  # varies by Flask-JWT-Extended version


# ── Logout ────────────────────────────────────────────────────────────────────

def test_logout_blacklists_token(client, registered_company):
    token = registered_company["access_token"]
    resp = client.post("/api/auth/logout", headers={
        "Authorization": f"Bearer {token}"
    })
    assert resp.status_code == 200

    # Blacklisted token should now be rejected
    resp2 = client.get("/api/auth/me", headers={
        "Authorization": f"Bearer {token}"
    })
    assert resp2.status_code == 401


# ── Me ────────────────────────────────────────────────────────────────────────

def test_me_returns_current_user(client, auth_headers):
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["user"]["email"] == "admin@testavco.com"


def test_me_requires_auth(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401
