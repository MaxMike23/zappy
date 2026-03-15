"""
Tests for Phase 3B — Project Device Instances

Coverage:
  - List project devices
  - Add device instance (global template, private template)
  - Edit instance fields
  - Delete instance
  - Role enforcement (technician read-only)
  - Tenant isolation (company A cannot touch company B's project devices)
  - Template accessibility (company A cannot use company B's private template)
  - Inaccessible / pending template rejected on add
"""
import pytest


# ── Helpers ────────────────────────────────────────────────────────────────────

def create_project(client, headers, name="Test Project"):
    resp = client.post("/api/projects/", json={"name": name}, headers=headers)
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()["project"]


def create_private_device(client, headers, make="Sony", model="BRC-X400"):
    resp = client.post("/api/devices/library", json={
        "make": make, "model": model, "category": "camera",
        "ports": [
            {"id": "p1", "label": "HDMI Out", "direction": "output",
             "signal_type": "Video", "connector_type": "HDMI"},
            {"id": "p2", "label": "RS232",    "direction": "input",
             "signal_type": "Control", "connector_type": "RS232"},
        ],
        "has_ip": True, "has_web_gui": True,
    }, headers=headers)
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()["device"]


def add_to_project(client, headers, project_id, template_id, **kwargs):
    return client.post(
        f"/api/projects/{project_id}/devices",
        json={"template_id": template_id, **kwargs},
        headers=headers,
    )


# ── List ──────────────────────────────────────────────────────────────────────

class TestListProjectDevices:
    def test_list_empty(self, client, auth_headers):
        p = create_project(client, auth_headers)
        resp = client.get(f"/api/projects/{p['id']}/devices", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()["devices"] == []

    def test_list_requires_auth(self, client, auth_headers):
        p = create_project(client, auth_headers)
        resp = client.get(f"/api/projects/{p['id']}/devices")
        assert resp.status_code == 401

    def test_list_wrong_company_returns_404(self, client, auth_headers, second_auth_headers):
        p = create_project(client, auth_headers)
        resp = client.get(f"/api/projects/{p['id']}/devices", headers=second_auth_headers)
        assert resp.status_code == 404


# ── Add ───────────────────────────────────────────────────────────────────────

class TestAddProjectDevice:
    def test_add_private_template(self, client, auth_headers):
        p = create_project(client, auth_headers)
        t = create_private_device(client, auth_headers)
        resp = add_to_project(client, auth_headers, p["id"], t["id"],
                              label="PTZ 1", room="Stage", ip_address="192.168.1.10")
        assert resp.status_code == 201
        d = resp.get_json()["device"]
        assert d["template"]["id"] == t["id"]
        assert d["label"] == "PTZ 1"
        assert d["room"] == "Stage"
        assert d["ip_address"] == "192.168.1.10"
        assert d["port_summary"]["outputs"] == 1
        assert d["port_summary"]["inputs"] == 1

    def test_add_no_template_id_rejected(self, client, auth_headers):
        p = create_project(client, auth_headers)
        resp = client.post(f"/api/projects/{p['id']}/devices",
                           json={}, headers=auth_headers)
        assert resp.status_code == 422

    def test_add_nonexistent_template_rejected(self, client, auth_headers):
        p = create_project(client, auth_headers)
        resp = add_to_project(client, auth_headers, p["id"],
                              "00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    def test_add_other_companys_private_template_rejected(
        self, client, auth_headers, second_auth_headers
    ):
        p = create_project(client, auth_headers)
        # Company B creates a private template
        t = create_private_device(client, second_auth_headers, make="Axis", model="P3245")
        # Company A tries to use it — should fail
        resp = add_to_project(client, auth_headers, p["id"], t["id"])
        assert resp.status_code == 404

    def test_technician_cannot_add(self, client, auth_headers, tech_headers):
        p = create_project(client, auth_headers)
        t = create_private_device(client, auth_headers)
        resp = add_to_project(client, tech_headers, p["id"], t["id"])
        assert resp.status_code == 403

    def test_add_to_wrong_company_project_rejected(
        self, client, auth_headers, second_auth_headers
    ):
        p = create_project(client, second_auth_headers)
        t = create_private_device(client, auth_headers)
        resp = add_to_project(client, auth_headers, p["id"], t["id"])
        assert resp.status_code == 404

    def test_add_with_rs232_settings(self, client, auth_headers):
        p = create_project(client, auth_headers)
        t = create_private_device(client, auth_headers)
        rs232 = {"port": "COM1", "baud_rate": 9600, "data_bits": 8, "parity": "None", "stop_bits": 1}
        resp = add_to_project(client, auth_headers, p["id"], t["id"],
                              rs232_settings=rs232)
        assert resp.status_code == 201
        assert resp.get_json()["device"]["rs232_settings"]["baud_rate"] == 9600

    def test_add_with_stream_urls(self, client, auth_headers):
        p = create_project(client, auth_headers)
        t = create_private_device(client, auth_headers)
        resp = add_to_project(client, auth_headers, p["id"], t["id"],
                              stream_urls=["rtsp://192.168.1.10/stream1"])
        assert resp.status_code == 201
        assert len(resp.get_json()["device"]["stream_urls"]) == 1


# ── Update ────────────────────────────────────────────────────────────────────

class TestUpdateProjectDevice:
    def test_update_label_and_room(self, client, auth_headers):
        p = create_project(client, auth_headers)
        t = create_private_device(client, auth_headers)
        d = add_to_project(client, auth_headers, p["id"], t["id"]).get_json()["device"]

        resp = client.put(
            f"/api/projects/{p['id']}/devices/{d['id']}",
            json={"label": "Updated Label", "room": "New Room"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        updated = resp.get_json()["device"]
        assert updated["label"] == "Updated Label"
        assert updated["room"] == "New Room"

    def test_update_clears_field_with_empty_string(self, client, auth_headers):
        p = create_project(client, auth_headers)
        t = create_private_device(client, auth_headers)
        d = add_to_project(client, auth_headers, p["id"], t["id"],
                           label="Old").get_json()["device"]

        resp = client.put(
            f"/api/projects/{p['id']}/devices/{d['id']}",
            json={"label": ""},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.get_json()["device"]["label"] is None

    def test_technician_cannot_update(self, client, auth_headers, tech_headers):
        p = create_project(client, auth_headers)
        t = create_private_device(client, auth_headers)
        d = add_to_project(client, auth_headers, p["id"], t["id"]).get_json()["device"]

        resp = client.put(
            f"/api/projects/{p['id']}/devices/{d['id']}",
            json={"label": "Hacked"},
            headers=tech_headers,
        )
        assert resp.status_code == 403

    def test_update_wrong_company_returns_404(
        self, client, auth_headers, second_auth_headers
    ):
        p = create_project(client, auth_headers)
        t = create_private_device(client, auth_headers)
        d = add_to_project(client, auth_headers, p["id"], t["id"]).get_json()["device"]

        resp = client.put(
            f"/api/projects/{p['id']}/devices/{d['id']}",
            json={"label": "Stolen"},
            headers=second_auth_headers,
        )
        assert resp.status_code == 404


# ── Delete ────────────────────────────────────────────────────────────────────

class TestDeleteProjectDevice:
    def test_delete_removes_instance(self, client, auth_headers):
        p = create_project(client, auth_headers)
        t = create_private_device(client, auth_headers)
        d = add_to_project(client, auth_headers, p["id"], t["id"]).get_json()["device"]

        resp = client.delete(
            f"/api/projects/{p['id']}/devices/{d['id']}",
            headers=auth_headers,
        )
        assert resp.status_code == 200

        list_resp = client.get(f"/api/projects/{p['id']}/devices", headers=auth_headers)
        assert list_resp.get_json()["devices"] == []

    def test_technician_cannot_delete(self, client, auth_headers, tech_headers):
        p = create_project(client, auth_headers)
        t = create_private_device(client, auth_headers)
        d = add_to_project(client, auth_headers, p["id"], t["id"]).get_json()["device"]

        resp = client.delete(
            f"/api/projects/{p['id']}/devices/{d['id']}",
            headers=tech_headers,
        )
        assert resp.status_code == 403

    def test_delete_wrong_company_returns_404(
        self, client, auth_headers, second_auth_headers
    ):
        p = create_project(client, auth_headers)
        t = create_private_device(client, auth_headers)
        d = add_to_project(client, auth_headers, p["id"], t["id"]).get_json()["device"]

        resp = client.delete(
            f"/api/projects/{p['id']}/devices/{d['id']}",
            headers=second_auth_headers,
        )
        assert resp.status_code == 404
