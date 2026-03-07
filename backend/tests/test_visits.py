"""
Tests for CRUD /api/visits/ + clock-in / clock-out
"""
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _create_project(client, headers, name="Test Project"):
    resp = client.post("/api/projects/", json={"name": name}, headers=headers)
    assert resp.status_code == 201
    return resp.get_json()["project"]["id"]


def _create_wo(client, headers, title="Cable Pull"):
    resp = client.post("/api/work-orders/", json={"title": title, "priority": "medium"}, headers=headers)
    assert resp.status_code == 201
    return resp.get_json()["work_order"]["id"]


def _create_visit(client, headers, **overrides):
    payload = {
        "title": "Site Survey",
        "scheduled_start": "2026-04-01T09:00:00",
        "scheduled_end":   "2026-04-01T11:00:00",
        **overrides,
    }
    return client.post("/api/visits/", json=payload, headers=headers)


# ── Create ────────────────────────────────────────────────────────────────────

def test_create_visit_under_work_order(client, auth_headers):
    wo_id = _create_wo(client, auth_headers)
    resp = _create_visit(client, auth_headers, work_order_id=wo_id)
    assert resp.status_code == 201
    data = resp.get_json()["visit"]
    assert data["title"] == "Site Survey"
    assert data["work_order_id"] == wo_id
    assert data["project_id"] is None
    assert data["status"] == "scheduled"


def test_create_visit_under_project(client, auth_headers):
    proj_id = _create_project(client, auth_headers)
    resp = _create_visit(client, auth_headers, project_id=proj_id)
    assert resp.status_code == 201
    data = resp.get_json()["visit"]
    assert data["project_id"] == proj_id
    assert data["work_order_id"] is None


def test_create_visit_missing_title(client, auth_headers):
    wo_id = _create_wo(client, auth_headers)
    resp = client.post("/api/visits/", json={
        "work_order_id": wo_id,
        "scheduled_start": "2026-04-01T09:00:00",
        "scheduled_end": "2026-04-01T11:00:00",
    }, headers=auth_headers)
    assert resp.status_code == 400


def test_create_visit_missing_schedule(client, auth_headers):
    wo_id = _create_wo(client, auth_headers)
    resp = client.post("/api/visits/", json={
        "title": "Survey",
        "work_order_id": wo_id,
    }, headers=auth_headers)
    assert resp.status_code == 400


def test_create_visit_both_parents_rejected(client, auth_headers):
    wo_id = _create_wo(client, auth_headers)
    proj_id = _create_project(client, auth_headers)
    resp = _create_visit(client, auth_headers, work_order_id=wo_id, project_id=proj_id)
    assert resp.status_code == 400


def test_create_visit_no_parent_rejected(client, auth_headers):
    resp = _create_visit(client, auth_headers)
    assert resp.status_code == 400


def test_create_visit_technician_forbidden(client, tech_headers):
    resp = _create_visit(client, tech_headers)
    assert resp.status_code == 403


def test_create_visit_wrong_company_work_order(client, auth_headers, second_auth_headers):
    wo_id = _create_wo(client, second_auth_headers, title="Other Co WO")
    resp = _create_visit(client, auth_headers, work_order_id=wo_id)
    assert resp.status_code == 404


def test_create_visit_wrong_company_project(client, auth_headers, second_auth_headers):
    proj_id = _create_project(client, second_auth_headers, name="Other Co Project")
    resp = _create_visit(client, auth_headers, project_id=proj_id)
    assert resp.status_code == 404


# ── List ──────────────────────────────────────────────────────────────────────

def test_list_visits_filter_by_work_order(client, auth_headers):
    wo1 = _create_wo(client, auth_headers, title="WO 1")
    wo2 = _create_wo(client, auth_headers, title="WO 2")
    _create_visit(client, auth_headers, work_order_id=wo1, title="Visit A")
    _create_visit(client, auth_headers, work_order_id=wo2, title="Visit B")

    resp = client.get(f"/api/visits/?work_order_id={wo1}", headers=auth_headers)
    assert resp.status_code == 200
    titles = [v["title"] for v in resp.get_json()["items"]]
    assert "Visit A" in titles
    assert "Visit B" not in titles


def test_list_visits_filter_by_project(client, auth_headers):
    proj1 = _create_project(client, auth_headers, name="Proj 1")
    proj2 = _create_project(client, auth_headers, name="Proj 2")
    _create_visit(client, auth_headers, project_id=proj1, title="Visit P1")
    _create_visit(client, auth_headers, project_id=proj2, title="Visit P2")

    resp = client.get(f"/api/visits/?project_id={proj1}", headers=auth_headers)
    titles = [v["title"] for v in resp.get_json()["items"]]
    assert "Visit P1" in titles
    assert "Visit P2" not in titles


def test_list_visits_filter_by_status(client, auth_headers):
    wo_id = _create_wo(client, auth_headers)
    _create_visit(client, auth_headers, work_order_id=wo_id, title="Sched")
    # Create and clock in a second visit
    v2_id = _create_visit(client, auth_headers, work_order_id=wo_id, title="InProg").get_json()["visit"]["id"]
    # Assign admin to visit so clock-in works
    client.post(f"/api/visits/{v2_id}/clock-in", headers=auth_headers)

    resp = client.get("/api/visits/?status=in_progress", headers=auth_headers)
    titles = [v["title"] for v in resp.get_json()["items"]]
    assert "InProg" in titles
    assert "Sched" not in titles


def test_list_visits_tenant_isolation(client, auth_headers, second_auth_headers):
    wo1 = _create_wo(client, auth_headers)
    wo2 = _create_wo(client, second_auth_headers)
    _create_visit(client, auth_headers, work_order_id=wo1, title="Co1 Visit")
    _create_visit(client, second_auth_headers, work_order_id=wo2, title="Co2 Visit")

    resp = client.get("/api/visits/", headers=auth_headers)
    titles = [v["title"] for v in resp.get_json()["items"]]
    assert "Co1 Visit" in titles
    assert "Co2 Visit" not in titles


def test_technician_sees_only_assigned_visits(client, auth_headers, tech_headers):
    wo_id = _create_wo(client, auth_headers)
    v1_id = _create_visit(client, auth_headers, work_order_id=wo_id, title="Assigned").get_json()["visit"]["id"]
    _create_visit(client, auth_headers, work_order_id=wo_id, title="Unassigned")

    tech_id = client.get("/api/auth/me", headers=tech_headers).get_json()["user"]["id"]
    client.put(f"/api/visits/{v1_id}", json={"assignee_ids": [tech_id]}, headers=auth_headers)

    resp = client.get("/api/visits/", headers=tech_headers)
    titles = [v["title"] for v in resp.get_json()["items"]]
    assert "Assigned" in titles
    assert "Unassigned" not in titles


# ── Get ───────────────────────────────────────────────────────────────────────

def test_get_visit_success(client, auth_headers):
    wo_id = _create_wo(client, auth_headers)
    v_id = _create_visit(client, auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    resp = client.get(f"/api/visits/{v_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["visit"]["id"] == v_id


def test_get_visit_wrong_company(client, auth_headers, second_auth_headers):
    wo_id = _create_wo(client, second_auth_headers)
    v_id = _create_visit(client, second_auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    resp = client.get(f"/api/visits/{v_id}", headers=auth_headers)
    assert resp.status_code == 404


# ── Update ────────────────────────────────────────────────────────────────────

def test_manager_updates_title(client, auth_headers):
    wo_id = _create_wo(client, auth_headers)
    v_id = _create_visit(client, auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    resp = client.put(f"/api/visits/{v_id}", json={"title": "Updated Title"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["visit"]["title"] == "Updated Title"


def test_tech_updates_notes_on_assigned_visit(client, auth_headers, tech_headers):
    wo_id = _create_wo(client, auth_headers)
    v_id = _create_visit(client, auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    tech_id = client.get("/api/auth/me", headers=tech_headers).get_json()["user"]["id"]
    client.put(f"/api/visits/{v_id}", json={"assignee_ids": [tech_id]}, headers=auth_headers)

    resp = client.put(f"/api/visits/{v_id}", json={"notes": "Arrived on site"}, headers=tech_headers)
    assert resp.status_code == 200
    assert resp.get_json()["visit"]["notes"] == "Arrived on site"


def test_tech_blocked_on_unassigned_visit(client, auth_headers, tech_headers):
    wo_id = _create_wo(client, auth_headers)
    v_id = _create_visit(client, auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    resp = client.put(f"/api/visits/{v_id}", json={"notes": "test"}, headers=tech_headers)
    assert resp.status_code == 403


# ── Clock-in / Clock-out ──────────────────────────────────────────────────────

def test_clock_in_sets_status_in_progress(client, auth_headers):
    wo_id = _create_wo(client, auth_headers)
    v_id = _create_visit(client, auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    resp = client.post(f"/api/visits/{v_id}/clock-in", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()["visit"]
    assert data["status"] == "in_progress"
    assert data["actual_start"] is not None
    assert data["is_running"] is True


def test_double_clock_in_rejected(client, auth_headers):
    wo_id = _create_wo(client, auth_headers)
    v_id = _create_visit(client, auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    client.post(f"/api/visits/{v_id}/clock-in", headers=auth_headers)
    resp = client.post(f"/api/visits/{v_id}/clock-in", headers=auth_headers)
    assert resp.status_code == 400


def test_tech_can_clock_in_assigned_visit(client, auth_headers, tech_headers):
    wo_id = _create_wo(client, auth_headers)
    v_id = _create_visit(client, auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    tech_id = client.get("/api/auth/me", headers=tech_headers).get_json()["user"]["id"]
    client.put(f"/api/visits/{v_id}", json={"assignee_ids": [tech_id]}, headers=auth_headers)

    resp = client.post(f"/api/visits/{v_id}/clock-in", headers=tech_headers)
    assert resp.status_code == 200


def test_tech_blocked_clock_in_unassigned(client, auth_headers, tech_headers):
    wo_id = _create_wo(client, auth_headers)
    v_id = _create_visit(client, auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    resp = client.post(f"/api/visits/{v_id}/clock-in", headers=tech_headers)
    assert resp.status_code == 403


def test_clock_out_sets_status_completed(client, auth_headers):
    wo_id = _create_wo(client, auth_headers)
    v_id = _create_visit(client, auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    client.post(f"/api/visits/{v_id}/clock-in", headers=auth_headers)
    resp = client.post(f"/api/visits/{v_id}/clock-out", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()["visit"]
    assert data["status"] == "completed"
    assert data["actual_end"] is not None
    assert data["is_running"] is False
    assert data["duration_minutes"] is not None


def test_clock_out_when_not_running_rejected(client, auth_headers):
    wo_id = _create_wo(client, auth_headers)
    v_id = _create_visit(client, auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    resp = client.post(f"/api/visits/{v_id}/clock-out", headers=auth_headers)
    assert resp.status_code == 400


# ── Cancel ────────────────────────────────────────────────────────────────────

def test_cancel_visit(client, auth_headers):
    wo_id = _create_wo(client, auth_headers)
    v_id = _create_visit(client, auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    resp = client.delete(f"/api/visits/{v_id}", headers=auth_headers)
    assert resp.status_code == 200
    # Verify status is cancelled, not deleted
    get_resp = client.get(f"/api/visits/{v_id}", headers=auth_headers)
    assert get_resp.get_json()["visit"]["status"] == "cancelled"


def test_cancel_visit_tech_forbidden(client, auth_headers, tech_headers):
    wo_id = _create_wo(client, auth_headers)
    v_id = _create_visit(client, auth_headers, work_order_id=wo_id).get_json()["visit"]["id"]
    resp = client.delete(f"/api/visits/{v_id}", headers=tech_headers)
    assert resp.status_code == 403
