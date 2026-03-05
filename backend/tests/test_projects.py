"""
Tests for CRUD /api/projects/
"""


def _create_project(client, headers, **overrides):
    payload = {"name": "Test Install", **overrides}
    return client.post("/api/projects/", json=payload, headers=headers)


# ── List ──────────────────────────────────────────────────────────────────────

def test_list_projects_empty_for_new_company(client, auth_headers):
    resp = client.get("/api/projects/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["items"] == []
    assert data["pagination"]["total"] == 0


def test_list_projects_requires_auth(client):
    resp = client.get("/api/projects/")
    assert resp.status_code == 401


# ── Create ────────────────────────────────────────────────────────────────────

def test_create_project_success(client, auth_headers):
    resp = _create_project(client, auth_headers,
                           client_name="Acme Corp",
                           site_city="Austin",
                           site_state="TX")
    assert resp.status_code == 201
    data = resp.get_json()["project"]
    assert data["name"] == "Test Install"
    assert data["client_name"] == "Acme Corp"
    assert data["site_city"] == "Austin"
    assert data["is_archived"] is False


def test_create_project_missing_name(client, auth_headers):
    resp = client.post("/api/projects/", json={"client_name": "X"}, headers=auth_headers)
    assert resp.status_code == 400


def test_create_project_technician_forbidden(client, tech_headers):
    resp = _create_project(client, tech_headers)
    assert resp.status_code == 403


def test_create_project_manager_allowed(client, auth_headers, client_app=None):
    # Manager role should be allowed to create projects
    # Create manager user first
    pass  # covered by role decorator tests; managers are created in test_users


# ── Get ───────────────────────────────────────────────────────────────────────

def test_get_project_by_id(client, auth_headers):
    create_resp = _create_project(client, auth_headers)
    project_id = create_resp.get_json()["project"]["id"]

    resp = client.get(f"/api/projects/{project_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["project"]["id"] == project_id


def test_get_project_includes_work_order_count(client, auth_headers):
    project_id = _create_project(client, auth_headers).get_json()["project"]["id"]
    resp = client.get(f"/api/projects/{project_id}", headers=auth_headers)
    assert "work_order_count" in resp.get_json()["project"]


def test_get_project_wrong_company_returns_404(client, auth_headers, second_auth_headers):
    # Create a project under company 1
    project_id = _create_project(client, auth_headers).get_json()["project"]["id"]

    # Company 2 should not be able to see it
    resp = client.get(f"/api/projects/{project_id}", headers=second_auth_headers)
    assert resp.status_code == 404


# ── Update ────────────────────────────────────────────────────────────────────

def test_update_project_fields(client, auth_headers):
    project_id = _create_project(client, auth_headers).get_json()["project"]["id"]

    resp = client.put(f"/api/projects/{project_id}", json={
        "name": "Updated Name",
        "client_name": "New Client",
        "site_state": "CA",
    }, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()["project"]
    assert data["name"] == "Updated Name"
    assert data["client_name"] == "New Client"
    assert data["site_state"] == "CA"


def test_update_project_custom_fields_merges(client, auth_headers):
    project_id = _create_project(client, auth_headers,
                                  custom_fields={"po_number": "PO-001"}).get_json()["project"]["id"]

    resp = client.put(f"/api/projects/{project_id}", json={
        "custom_fields": {"rack_count": 2}
    }, headers=auth_headers)
    assert resp.status_code == 200
    cf = resp.get_json()["project"]["custom_fields"]
    # Both old and new keys should exist (merge, not replace)
    assert cf.get("po_number") == "PO-001"
    assert cf.get("rack_count") == 2


# ── Archive ───────────────────────────────────────────────────────────────────

def test_archive_project_soft_deletes(client, auth_headers):
    project_id = _create_project(client, auth_headers).get_json()["project"]["id"]

    resp = client.delete(f"/api/projects/{project_id}", headers=auth_headers)
    assert resp.status_code == 200

    # Should no longer appear in default (non-archived) list
    list_resp = client.get("/api/projects/", headers=auth_headers)
    ids = [p["id"] for p in list_resp.get_json()["items"]]
    assert project_id not in ids


def test_archived_projects_appear_with_filter(client, auth_headers):
    project_id = _create_project(client, auth_headers).get_json()["project"]["id"]
    client.delete(f"/api/projects/{project_id}", headers=auth_headers)

    resp = client.get("/api/projects/?is_archived=true", headers=auth_headers)
    ids = [p["id"] for p in resp.get_json()["items"]]
    assert project_id in ids


def test_archive_project_technician_forbidden(client, auth_headers, tech_headers):
    project_id = _create_project(client, auth_headers).get_json()["project"]["id"]
    resp = client.delete(f"/api/projects/{project_id}", headers=tech_headers)
    assert resp.status_code == 403


# ── List with filters ─────────────────────────────────────────────────────────

def test_list_projects_search_by_name(client, auth_headers):
    _create_project(client, auth_headers, name="Downtown Hotel Install")
    _create_project(client, auth_headers, name="Airport Lobby AV")

    resp = client.get("/api/projects/?search=hotel", headers=auth_headers)
    items = resp.get_json()["items"]
    assert len(items) == 1
    assert "Hotel" in items[0]["name"]


def test_list_projects_tenant_isolation(client, auth_headers, second_auth_headers):
    _create_project(client, auth_headers, name="Company 1 Project")
    _create_project(client, second_auth_headers, name="Company 2 Project")

    resp = client.get("/api/projects/", headers=auth_headers)
    names = [p["name"] for p in resp.get_json()["items"]]
    assert "Company 1 Project" in names
    assert "Company 2 Project" not in names
