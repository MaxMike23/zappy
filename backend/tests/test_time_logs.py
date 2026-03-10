"""
Tests for time logs CRUD and attendance clock-in/out.
"""
import pytest
from datetime import datetime, timezone


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_project(client, headers, name="Test Project"):
    r = client.post("/api/projects/", json={"name": name}, headers=headers)
    assert r.status_code == 201, r.get_json()
    return r.get_json()["project"]


def make_wo(client, headers, project_id):
    r = client.post("/api/work-orders/", json={
        "title": "Test WO",
        "project_id": project_id,
        "priority": "medium",
    }, headers=headers)
    assert r.status_code == 201, r.get_json()
    return r.get_json()["work_order"]


def make_log(client, headers, wo_id, start="2025-03-01T09:00:00", end=None):
    payload = {"work_order_id": wo_id, "start_time": start}
    if end:
        payload["end_time"] = end
    r = client.post("/api/time-logs/", json=payload, headers=headers)
    assert r.status_code == 201, r.get_json()
    return r.get_json()["time_log"]


# ── Time log CRUD ─────────────────────────────────────────────────────────────

class TestTimeLogCreate:
    def test_create_success(self, client, registered_company, auth_headers):
        proj = make_project(client, auth_headers)
        wo = make_wo(client, auth_headers, proj["id"])
        log = make_log(client, auth_headers, wo["id"], end="2025-03-01T11:00:00")
        assert log["duration_minutes"] == 120
        assert log["is_approved"] is False

    def test_missing_work_order(self, client, auth_headers):
        r = client.post("/api/time-logs/", json={
            "start_time": "2025-03-01T09:00:00"
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_missing_start_time(self, client, registered_company, auth_headers):
        proj = make_project(client, auth_headers)
        wo = make_wo(client, auth_headers, proj["id"])
        r = client.post("/api/time-logs/", json={"work_order_id": wo["id"]}, headers=auth_headers)
        assert r.status_code == 400

    def test_end_before_start(self, client, registered_company, auth_headers):
        proj = make_project(client, auth_headers)
        wo = make_wo(client, auth_headers, proj["id"])
        r = client.post("/api/time-logs/", json={
            "work_order_id": wo["id"],
            "start_time": "2025-03-01T10:00:00",
            "end_time": "2025-03-01T09:00:00",
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_tech_can_log_own(self, client, registered_company, auth_headers, tech_headers):
        proj = make_project(client, auth_headers)
        wo = make_wo(client, auth_headers, proj["id"])
        log = make_log(client, tech_headers, wo["id"])
        assert log["id"]


class TestTimeLogList:
    def test_admin_sees_all(self, client, registered_company, auth_headers, tech_headers):
        proj = make_project(client, auth_headers)
        wo = make_wo(client, auth_headers, proj["id"])
        make_log(client, auth_headers, wo["id"])
        make_log(client, tech_headers, wo["id"])
        r = client.get("/api/time-logs/", headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()["pagination"]["total"] == 2

    def test_tech_sees_only_own(self, client, registered_company, auth_headers, tech_headers):
        proj = make_project(client, auth_headers)
        wo = make_wo(client, auth_headers, proj["id"])
        make_log(client, auth_headers, wo["id"])
        make_log(client, tech_headers, wo["id"])
        r = client.get("/api/time-logs/", headers=tech_headers)
        assert r.status_code == 200
        assert r.get_json()["pagination"]["total"] == 1

    def test_tenant_isolation(self, client, registered_company, auth_headers,
                              second_company, second_auth_headers):
        proj = make_project(client, auth_headers)
        wo = make_wo(client, auth_headers, proj["id"])
        make_log(client, auth_headers, wo["id"])
        r = client.get("/api/time-logs/", headers=second_auth_headers)
        assert r.get_json()["pagination"]["total"] == 0


class TestTimeLogApproval:
    def test_manager_can_approve(self, client, registered_company, auth_headers, tech_headers):
        proj = make_project(client, auth_headers)
        wo = make_wo(client, auth_headers, proj["id"])
        log = make_log(client, tech_headers, wo["id"])
        r = client.put(f"/api/time-logs/{log['id']}", json={"is_approved": True}, headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()["time_log"]["is_approved"] is True

    def test_tech_cannot_approve(self, client, registered_company, auth_headers, tech_headers):
        proj = make_project(client, auth_headers)
        wo = make_wo(client, auth_headers, proj["id"])
        log = make_log(client, tech_headers, wo["id"])
        r = client.put(f"/api/time-logs/{log['id']}", json={"is_approved": True}, headers=tech_headers)
        # Tech cannot set approval — field is silently ignored, not rejected
        assert r.status_code == 200
        assert r.get_json()["time_log"]["is_approved"] is False

    def test_tech_cannot_edit_approved_log(self, client, registered_company, auth_headers, tech_headers):
        proj = make_project(client, auth_headers)
        wo = make_wo(client, auth_headers, proj["id"])
        log = make_log(client, tech_headers, wo["id"])
        client.put(f"/api/time-logs/{log['id']}", json={"is_approved": True}, headers=auth_headers)
        r = client.put(f"/api/time-logs/{log['id']}", json={"notes": "changed"}, headers=tech_headers)
        assert r.status_code == 403


class TestTimeSummary:
    def test_summary_returns_totals(self, client, registered_company, auth_headers):
        proj = make_project(client, auth_headers)
        wo = make_wo(client, auth_headers, proj["id"])
        make_log(client, auth_headers, wo["id"],
                 start="2025-03-01T09:00:00", end="2025-03-01T11:00:00")
        r = client.get("/api/time-logs/summary", headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()["summary"]
        assert len(data) == 1
        assert data[0]["total_minutes"] == 120

    def test_tech_cannot_access_summary(self, client, registered_company, auth_headers, tech_headers):
        r = client.get("/api/time-logs/summary", headers=tech_headers)
        assert r.status_code == 403


# ── Attendance clock-in / clock-out ──────────────────────────────────────────

class TestAttendance:
    def test_clock_in_success(self, client, registered_company, auth_headers):
        r = client.post("/api/attendance/clock-in", headers=auth_headers)
        assert r.status_code == 201
        data = r.get_json()["attendance"]
        assert data["clock_in"] is not None
        assert data["clock_out"] is None
        assert data["is_clocked_in"] is True

    def test_double_clock_in(self, client, registered_company, auth_headers):
        client.post("/api/attendance/clock-in", headers=auth_headers)
        r = client.post("/api/attendance/clock-in", headers=auth_headers)
        assert r.status_code == 409

    def test_clock_out_success(self, client, registered_company, auth_headers):
        client.post("/api/attendance/clock-in", headers=auth_headers)
        r = client.post("/api/attendance/clock-out", headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()["attendance"]
        assert data["clock_out"] is not None
        assert data["is_clocked_in"] is False

    def test_clock_out_without_clock_in(self, client, registered_company, auth_headers):
        r = client.post("/api/attendance/clock-out", headers=auth_headers)
        assert r.status_code == 400

    def test_double_clock_out(self, client, registered_company, auth_headers):
        client.post("/api/attendance/clock-in", headers=auth_headers)
        client.post("/api/attendance/clock-out", headers=auth_headers)
        r = client.post("/api/attendance/clock-out", headers=auth_headers)
        assert r.status_code == 400

    def test_today_returns_record(self, client, registered_company, auth_headers):
        client.post("/api/attendance/clock-in", headers=auth_headers)
        r = client.get("/api/attendance/today", headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()["attendance"] is not None

    def test_today_returns_none_when_not_clocked_in(self, client, registered_company, auth_headers):
        r = client.get("/api/attendance/today", headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()["attendance"] is None

    def test_list_tech_sees_only_own(self, client, registered_company, auth_headers, tech_headers):
        client.post("/api/attendance/clock-in", headers=auth_headers)
        client.post("/api/attendance/clock-in", headers=tech_headers)
        r = client.get("/api/attendance/", headers=tech_headers)
        assert r.get_json()["pagination"]["total"] == 1

    def test_tenant_isolation(self, client, registered_company, auth_headers,
                              second_company, second_auth_headers):
        client.post("/api/attendance/clock-in", headers=auth_headers)
        r = client.get("/api/attendance/", headers=second_auth_headers)
        assert r.get_json()["pagination"]["total"] == 0
