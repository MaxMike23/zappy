"""
Tests for CRUD /api/users/
"""


def _create_user(client, headers, **overrides):
    payload = {
        "email": "newuser@testavco.com",
        "password": "password123",
        "first_name": "New",
        "last_name": "User",
        "role": "technician",
        **overrides,
    }
    return client.post("/api/users/", json=payload, headers=headers)


# ── List ──────────────────────────────────────────────────────────────────────

def test_list_users_returns_company_users(client, auth_headers):
    resp = client.get("/api/users/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    # The company admin created during registration should be present
    assert data["pagination"]["total"] >= 1
    emails = [u["email"] for u in data["items"]]
    assert "admin@testavco.com" in emails


def test_list_users_tenant_isolated(client, auth_headers, second_auth_headers):
    _create_user(client, auth_headers, email="tech@company1.com")
    _create_user(client, second_auth_headers, email="tech@company2.com")

    resp = client.get("/api/users/", headers=auth_headers)
    emails = [u["email"] for u in resp.get_json()["items"]]
    assert "tech@company1.com" in emails
    assert "tech@company2.com" not in emails


def test_list_users_requires_admin_role(client, tech_headers):
    resp = client.get("/api/users/", headers=tech_headers)
    assert resp.status_code == 403


# ── Create ────────────────────────────────────────────────────────────────────

def test_create_user_success(client, auth_headers):
    resp = _create_user(client, auth_headers)
    assert resp.status_code == 201
    data = resp.get_json()["user"]
    assert data["email"] == "newuser@testavco.com"
    assert data["role"] == "technician"
    assert data["is_active"] is True
    # Password hash must never appear in the response
    assert "password" not in data
    assert "password_hash" not in data


def test_create_user_missing_required_fields(client, auth_headers):
    resp = client.post("/api/users/", json={"email": "x@x.com"}, headers=auth_headers)
    assert resp.status_code == 400


def test_create_user_duplicate_email(client, auth_headers):
    _create_user(client, auth_headers)
    resp = _create_user(client, auth_headers)
    assert resp.status_code == 409


def test_create_user_technician_forbidden(client, tech_headers):
    resp = _create_user(client, tech_headers, email="another@testavco.com")
    assert resp.status_code == 403


def test_create_manager_user(client, auth_headers):
    resp = _create_user(client, auth_headers, email="mgr@testavco.com", role="manager")
    assert resp.status_code == 201
    assert resp.get_json()["user"]["role"] == "manager"


# ── Get ───────────────────────────────────────────────────────────────────────

def test_get_user_by_id(client, auth_headers):
    user_id = _create_user(client, auth_headers).get_json()["user"]["id"]
    resp = client.get(f"/api/users/{user_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["user"]["id"] == user_id


def test_get_user_wrong_company_returns_404(client, auth_headers, second_auth_headers):
    user_id = _create_user(client, auth_headers).get_json()["user"]["id"]
    resp = client.get(f"/api/users/{user_id}", headers=second_auth_headers)
    assert resp.status_code == 404


# ── Update ────────────────────────────────────────────────────────────────────

def test_update_user_role(client, auth_headers):
    user_id = _create_user(client, auth_headers).get_json()["user"]["id"]
    resp = client.put(f"/api/users/{user_id}", json={"role": "manager"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["user"]["role"] == "manager"


def test_deactivate_user(client, auth_headers):
    user_id = _create_user(client, auth_headers).get_json()["user"]["id"]
    resp = client.put(f"/api/users/{user_id}", json={"is_active": False}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["user"]["is_active"] is False


def test_technician_can_update_own_profile(client, auth_headers, tech_headers):
    # Tech should be able to update their own first/last name
    me_resp = client.get("/api/auth/me", headers=tech_headers)
    tech_id = me_resp.get_json()["user"]["id"]

    resp = client.put(f"/api/users/{tech_id}", json={"first_name": "Updated"}, headers=tech_headers)
    assert resp.status_code == 200
    assert resp.get_json()["user"]["first_name"] == "Updated"


def test_technician_cannot_change_own_role(client, auth_headers, tech_headers):
    # Techs should not be able to elevate their own role
    me_resp = client.get("/api/auth/me", headers=tech_headers)
    tech_id = me_resp.get_json()["user"]["id"]

    resp = client.put(f"/api/users/{tech_id}", json={"role": "company_admin"}, headers=tech_headers)
    # Either forbidden or the role change is silently ignored
    if resp.status_code == 200:
        assert resp.get_json()["user"]["role"] == "technician"
    else:
        assert resp.status_code == 403


# ── List filters ──────────────────────────────────────────────────────────────

def test_list_users_filter_by_role(client, auth_headers):
    _create_user(client, auth_headers, email="tech1@testavco.com", role="technician")
    _create_user(client, auth_headers, email="mgr@testavco.com", role="manager")

    resp = client.get("/api/users/?role=technician", headers=auth_headers)
    roles = [u["role"] for u in resp.get_json()["items"]]
    assert all(r == "technician" for r in roles)


def test_list_users_filter_active(client, auth_headers):
    user_id = _create_user(client, auth_headers).get_json()["user"]["id"]
    client.put(f"/api/users/{user_id}", json={"is_active": False}, headers=auth_headers)

    resp = client.get("/api/users/?is_active=true", headers=auth_headers)
    active_emails = [u["email"] for u in resp.get_json()["items"]]
    assert "newuser@testavco.com" not in active_emails
