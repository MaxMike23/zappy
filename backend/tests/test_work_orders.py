"""
Tests for CRUD /api/work-orders/ and /api/work-orders/<id>/notes
"""


def _create_wo(client, headers, **overrides):
    payload = {"title": "Cable Pull - Main Conference", "priority": "medium", **overrides}
    return client.post("/api/work-orders/", json=payload, headers=headers)


# ── Create ────────────────────────────────────────────────────────────────────

def test_create_work_order_success(client, auth_headers):
    resp = _create_wo(client, auth_headers,
                      description="Run CAT6 to all drops",
                      site_city="Austin",
                      site_state="TX")
    assert resp.status_code == 201
    data = resp.get_json()["work_order"]
    assert data["title"] == "Cable Pull - Main Conference"
    assert data["priority"] == "medium"
    assert data["is_archived"] is False


def test_create_work_order_missing_title(client, auth_headers):
    resp = client.post("/api/work-orders/", json={"priority": "high"}, headers=auth_headers)
    assert resp.status_code == 400


def test_create_work_order_technician_forbidden(client, tech_headers):
    resp = _create_wo(client, tech_headers)
    assert resp.status_code == 403


def test_create_standalone_work_order_no_project(client, auth_headers):
    # Work orders can exist without a parent project
    resp = _create_wo(client, auth_headers)
    assert resp.status_code == 201
    assert resp.get_json()["work_order"]["project_id"] is None


# ── List ──────────────────────────────────────────────────────────────────────

def test_list_work_orders_returns_company_wos(client, auth_headers):
    _create_wo(client, auth_headers, title="WO One")
    _create_wo(client, auth_headers, title="WO Two")

    resp = client.get("/api/work-orders/", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["pagination"]["total"] == 2


def test_list_work_orders_tenant_isolation(client, auth_headers, second_auth_headers):
    _create_wo(client, auth_headers, title="Company 1 WO")
    _create_wo(client, second_auth_headers, title="Company 2 WO")

    resp = client.get("/api/work-orders/", headers=auth_headers)
    titles = [w["title"] for w in resp.get_json()["items"]]
    assert "Company 1 WO" in titles
    assert "Company 2 WO" not in titles


def test_technician_sees_only_assigned_work_orders(client, auth_headers, tech_headers):
    # Create two WOs as admin; assign tech to only one
    wo1_id = _create_wo(client, auth_headers, title="Assigned WO").get_json()["work_order"]["id"]
    _create_wo(client, auth_headers, title="Unassigned WO")

    # Get tech user ID
    me_resp = client.get("/api/auth/me", headers=tech_headers)
    tech_id = me_resp.get_json()["user"]["id"]

    # Assign tech to wo1
    client.put(f"/api/work-orders/{wo1_id}", json={"assignee_ids": [tech_id]}, headers=auth_headers)

    resp = client.get("/api/work-orders/", headers=tech_headers)
    titles = [w["title"] for w in resp.get_json()["items"]]
    assert "Assigned WO" in titles
    assert "Unassigned WO" not in titles


def test_list_work_orders_filter_by_priority(client, auth_headers):
    _create_wo(client, auth_headers, title="Urgent WO", priority="urgent")
    _create_wo(client, auth_headers, title="Low WO", priority="low")

    resp = client.get("/api/work-orders/?priority=urgent", headers=auth_headers)
    items = resp.get_json()["items"]
    assert len(items) == 1
    assert items[0]["priority"] == "urgent"


# ── Get ───────────────────────────────────────────────────────────────────────

def test_get_work_order_by_id(client, auth_headers):
    wo_id = _create_wo(client, auth_headers).get_json()["work_order"]["id"]
    resp = client.get(f"/api/work-orders/{wo_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["work_order"]["id"] == wo_id


def test_get_work_order_wrong_company_returns_404(client, auth_headers, second_auth_headers):
    wo_id = _create_wo(client, auth_headers).get_json()["work_order"]["id"]
    resp = client.get(f"/api/work-orders/{wo_id}", headers=second_auth_headers)
    assert resp.status_code == 404


# ── Update ────────────────────────────────────────────────────────────────────

def test_update_work_order_priority(client, auth_headers):
    wo_id = _create_wo(client, auth_headers, priority="low").get_json()["work_order"]["id"]
    resp = client.put(f"/api/work-orders/{wo_id}", json={"priority": "urgent"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["work_order"]["priority"] == "urgent"


def test_archive_work_order(client, auth_headers):
    wo_id = _create_wo(client, auth_headers).get_json()["work_order"]["id"]
    resp = client.delete(f"/api/work-orders/{wo_id}", headers=auth_headers)
    assert resp.status_code == 200

    list_resp = client.get("/api/work-orders/", headers=auth_headers)
    ids = [w["id"] for w in list_resp.get_json()["items"]]
    assert wo_id not in ids


# ── Notes ─────────────────────────────────────────────────────────────────────

def test_add_note_to_work_order(client, auth_headers):
    wo_id = _create_wo(client, auth_headers).get_json()["work_order"]["id"]

    resp = client.post(f"/api/work-orders/{wo_id}/notes", json={
        "content": "Pulled 12 runs of CAT6 to conference room.",
        "is_internal": True,
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.get_json()["note"]
    assert data["content"] == "Pulled 12 runs of CAT6 to conference room."
    assert data["is_internal"] is True


def test_add_note_missing_content(client, auth_headers):
    wo_id = _create_wo(client, auth_headers).get_json()["work_order"]["id"]
    resp = client.post(f"/api/work-orders/{wo_id}/notes", json={}, headers=auth_headers)
    assert resp.status_code == 400


def test_list_notes_for_work_order(client, auth_headers):
    wo_id = _create_wo(client, auth_headers).get_json()["work_order"]["id"]

    client.post(f"/api/work-orders/{wo_id}/notes", json={"content": "Note 1"}, headers=auth_headers)
    client.post(f"/api/work-orders/{wo_id}/notes", json={"content": "Note 2"}, headers=auth_headers)

    resp = client.get(f"/api/work-orders/{wo_id}/notes", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.get_json()["notes"]) == 2
