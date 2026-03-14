"""
Tests for Phase 3A — Device Library (Global Catalog)

Coverage:
  - List devices (global + private isolation)
  - Create private device template
  - Edit / delete own private template
  - Submit for global approval
  - Superadmin approve / reject
  - Superadmin list pending
  - Role restrictions (technician cannot write)
  - Tenant isolation (company A cannot edit company B's device)
  - Port validation
"""
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

SAMPLE_PORTS = [
    {"id": "aaaa-1111", "label": "HDMI In 1",  "direction": "input",  "signal_type": "Video",   "connector_type": "HDMI"},
    {"id": "bbbb-2222", "label": "HDMI Out 1", "direction": "output", "signal_type": "Video",   "connector_type": "HDMI"},
    {"id": "cccc-3333", "label": "RS232",       "direction": "input",  "signal_type": "Control", "connector_type": "RS232"},
]


def create_device(client, headers, **kwargs):
    data = {"make": "Samsung", "model": "QN85B", "category": "display", **kwargs}
    return client.post("/api/devices/library", json=data, headers=headers)


def superadmin_headers(client):
    """Register and return headers for a superadmin user."""
    from app.extensions import db
    from app.models.user import User, UserRole
    import uuid
    # Directly insert a superadmin (no company)
    with client.application.app_context():
        sa = User(
            id=uuid.uuid4(),
            company_id=None,
            email="sa@zappy.io",
            first_name="Super",
            last_name="Admin",
            role=UserRole.SUPERADMIN,
            is_active=True,
        )
        sa.set_password("sapass123")
        db.session.add(sa)
        db.session.commit()
    resp = client.post("/api/auth/login", json={"email": "sa@zappy.io", "password": "sapass123"})
    return {"Authorization": f"Bearer {resp.get_json()['access_token']}"}


# ── List ──────────────────────────────────────────────────────────────────────

class TestListDevices:
    def test_list_empty(self, client, auth_headers):
        resp = client.get("/api/devices/library", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()["devices"] == []

    def test_list_returns_own_private(self, client, auth_headers):
        create_device(client, auth_headers)
        resp = client.get("/api/devices/library", headers=auth_headers)
        assert len(resp.get_json()["devices"]) == 1

    def test_list_returns_global_for_all_companies(self, client, auth_headers, second_auth_headers):
        # Company A creates a device and superadmin approves it
        sa = superadmin_headers(client)
        # Superadmin creates a global device directly
        r = client.post("/api/devices/library", json={
            "make": "Extron", "model": "DMP64", "category": "dsp",
        }, headers=sa)
        assert r.status_code == 201
        assert r.get_json()["device"]["is_global"] is True

        # Both companies see it
        r1 = client.get("/api/devices/library", headers=auth_headers)
        r2 = client.get("/api/devices/library", headers=second_auth_headers)
        assert len(r1.get_json()["devices"]) == 1
        assert len(r2.get_json()["devices"]) == 1

    def test_tenant_isolation_private(self, client, auth_headers, second_auth_headers):
        create_device(client, auth_headers)
        resp = client.get("/api/devices/library", headers=second_auth_headers)
        assert resp.get_json()["devices"] == []

    def test_requires_auth(self, client):
        assert client.get("/api/devices/library").status_code == 401


# ── Create ────────────────────────────────────────────────────────────────────

class TestCreateDevice:
    def test_create_private(self, client, auth_headers):
        resp = create_device(client, auth_headers, ports=SAMPLE_PORTS)
        assert resp.status_code == 201
        d = resp.get_json()["device"]
        assert d["make"] == "Samsung"
        assert d["is_global"] is False
        assert d["is_pending"] is False
        assert len(d["ports"]) == 3

    def test_create_requires_make_and_model(self, client, auth_headers):
        resp = client.post("/api/devices/library", json={"make": "Samsung"}, headers=auth_headers)
        assert resp.status_code == 400

    def test_create_invalid_category(self, client, auth_headers):
        resp = client.post("/api/devices/library", json={
            "make": "X", "model": "Y", "category": "not_a_category"
        }, headers=auth_headers)
        assert resp.status_code == 400

    def test_technician_cannot_create(self, client, tech_headers):
        resp = create_device(client, tech_headers)
        assert resp.status_code == 403

    def test_port_validation_bad_direction(self, client, auth_headers):
        resp = create_device(client, auth_headers, ports=[{
            "id": "x", "label": "Port", "direction": "sideways", "signal_type": "Video"
        }])
        assert resp.status_code == 400

    def test_port_validation_bad_signal_type(self, client, auth_headers):
        resp = create_device(client, auth_headers, ports=[{
            "id": "x", "label": "Port", "direction": "input", "signal_type": "Telepathy"
        }])
        assert resp.status_code == 400


# ── Update ────────────────────────────────────────────────────────────────────

class TestUpdateDevice:
    def test_update_own_private(self, client, auth_headers):
        device_id = create_device(client, auth_headers).get_json()["device"]["id"]
        resp = client.put(f"/api/devices/library/{device_id}", json={"model": "QN90B"}, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()["device"]["model"] == "QN90B"

    def test_cannot_update_other_company_device(self, client, auth_headers, second_auth_headers):
        device_id = create_device(client, auth_headers).get_json()["device"]["id"]
        resp = client.put(f"/api/devices/library/{device_id}", json={"model": "X"}, headers=second_auth_headers)
        assert resp.status_code == 404

    def test_cannot_update_global_as_company(self, client, auth_headers):
        sa = superadmin_headers(client)
        device_id = client.post("/api/devices/library", json={
            "make": "Crestron", "model": "DM-MD8x8", "category": "matrix_switcher"
        }, headers=sa).get_json()["device"]["id"]
        resp = client.put(f"/api/devices/library/{device_id}", json={"model": "X"}, headers=auth_headers)
        assert resp.status_code == 403


# ── Delete ────────────────────────────────────────────────────────────────────

class TestDeleteDevice:
    def test_delete_own_private(self, client, auth_headers):
        device_id = create_device(client, auth_headers).get_json()["device"]["id"]
        resp = client.delete(f"/api/devices/library/{device_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert client.get("/api/devices/library", headers=auth_headers).get_json()["devices"] == []

    def test_cannot_delete_other_company(self, client, auth_headers, second_auth_headers):
        device_id = create_device(client, auth_headers).get_json()["device"]["id"]
        resp = client.delete(f"/api/devices/library/{device_id}", headers=second_auth_headers)
        assert resp.status_code == 404


# ── Submit / Approve / Reject ─────────────────────────────────────────────────

class TestGlobalSubmission:
    def test_submit_sets_pending(self, client, auth_headers):
        device_id = create_device(client, auth_headers).get_json()["device"]["id"]
        resp = client.post(f"/api/devices/library/{device_id}/submit", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()["device"]["is_pending"] is True

    def test_cannot_submit_twice(self, client, auth_headers):
        device_id = create_device(client, auth_headers).get_json()["device"]["id"]
        client.post(f"/api/devices/library/{device_id}/submit", headers=auth_headers)
        resp = client.post(f"/api/devices/library/{device_id}/submit", headers=auth_headers)
        assert resp.status_code == 409

    def test_approve_promotes_to_global(self, client, auth_headers):
        sa = superadmin_headers(client)
        device_id = create_device(client, auth_headers).get_json()["device"]["id"]
        client.post(f"/api/devices/library/{device_id}/submit", headers=auth_headers)
        resp = client.post(f"/api/devices/library/{device_id}/approve", headers=sa)
        assert resp.status_code == 200
        d = resp.get_json()["device"]
        assert d["is_global"] is True
        assert d["is_pending"] is False
        assert d["company_id"] is None

    def test_reject_returns_to_private(self, client, auth_headers):
        sa = superadmin_headers(client)
        device_id = create_device(client, auth_headers).get_json()["device"]["id"]
        client.post(f"/api/devices/library/{device_id}/submit", headers=auth_headers)
        resp = client.post(f"/api/devices/library/{device_id}/reject", headers=sa)
        assert resp.status_code == 200
        assert resp.get_json()["device"]["is_pending"] is False

    def test_only_superadmin_can_approve(self, client, auth_headers):
        device_id = create_device(client, auth_headers).get_json()["device"]["id"]
        client.post(f"/api/devices/library/{device_id}/submit", headers=auth_headers)
        resp = client.post(f"/api/devices/library/{device_id}/approve", headers=auth_headers)
        assert resp.status_code == 403

    def test_pending_not_visible_to_other_companies(self, client, auth_headers, second_auth_headers):
        device_id = create_device(client, auth_headers).get_json()["device"]["id"]
        client.post(f"/api/devices/library/{device_id}/submit", headers=auth_headers)
        # Pending device should NOT appear in second company's list
        resp = client.get("/api/devices/library", headers=second_auth_headers)
        assert resp.get_json()["devices"] == []

    def test_list_pending_superadmin_only(self, client, auth_headers):
        resp = client.get("/api/devices/library/pending", headers=auth_headers)
        assert resp.status_code == 403

    def test_list_pending_returns_submissions(self, client, auth_headers):
        sa = superadmin_headers(client)
        device_id = create_device(client, auth_headers).get_json()["device"]["id"]
        client.post(f"/api/devices/library/{device_id}/submit", headers=auth_headers)
        resp = client.get("/api/devices/library/pending", headers=sa)
        assert resp.status_code == 200
        assert len(resp.get_json()["devices"]) == 1
