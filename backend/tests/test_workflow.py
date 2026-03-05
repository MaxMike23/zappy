"""
Tests for /api/workflow/stages and /api/workflow/fields
"""


# ── Stages ────────────────────────────────────────────────────────────────────

def test_list_stages_returns_seeded_defaults(client, auth_headers):
    """Registration seeds default workflow stages for each module."""
    resp = client.get("/api/workflow/stages", headers=auth_headers)
    assert resp.status_code == 200
    stages = resp.get_json()["stages"]
    # seed_company_defaults creates stages for both project and work_order modules
    assert len(stages) > 0
    modules = {s["module"] for s in stages}
    assert "project" in modules
    assert "work_order" in modules


def test_list_stages_filter_by_module(client, auth_headers):
    resp = client.get("/api/workflow/stages?module=project", headers=auth_headers)
    assert resp.status_code == 200
    stages = resp.get_json()["stages"]
    assert all(s["module"] == "project" for s in stages)


def test_list_stages_invalid_module(client, auth_headers):
    resp = client.get("/api/workflow/stages?module=invalid", headers=auth_headers)
    assert resp.status_code == 400


def test_create_stage_success(client, auth_headers):
    resp = client.post("/api/workflow/stages", json={
        "name": "On-Site Testing",
        "module": "work_order",
        "color": "#10B981",
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.get_json()["stage"]
    assert data["name"] == "On-Site Testing"
    assert data["slug"] == "on_site_testing"
    assert data["module"] == "work_order"
    assert data["stage_requirements"] == {}


def test_create_stage_with_requirements(client, auth_headers):
    resp = client.post("/api/workflow/stages", json={
        "name": "Commissioning Complete",
        "module": "work_order",
        "is_terminal": True,
        "is_success": True,
        "stage_requirements": {"min_files": 1, "required_field_keys": ["rack_photo"]},
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.get_json()["stage"]
    assert data["is_terminal"] is True
    assert data["stage_requirements"]["min_files"] == 1


def test_create_stage_duplicate_slug_rejected(client, auth_headers):
    client.post("/api/workflow/stages", json={
        "name": "Custom Stage",
        "module": "work_order",
    }, headers=auth_headers)
    # Same name → same slug → conflict
    resp = client.post("/api/workflow/stages", json={
        "name": "Custom Stage",
        "module": "work_order",
    }, headers=auth_headers)
    assert resp.status_code == 409


def test_create_stage_technician_forbidden(client, tech_headers):
    resp = client.post("/api/workflow/stages", json={
        "name": "New Stage",
        "module": "project",
    }, headers=tech_headers)
    assert resp.status_code == 403


def test_stages_are_tenant_isolated(client, auth_headers, second_auth_headers):
    client.post("/api/workflow/stages", json={
        "name": "Exclusive Stage",
        "module": "project",
    }, headers=auth_headers)

    resp = client.get("/api/workflow/stages?module=project", headers=second_auth_headers)
    names = [s["name"] for s in resp.get_json()["stages"]]
    assert "Exclusive Stage" not in names


def test_update_stage(client, auth_headers):
    stage_id = client.post("/api/workflow/stages", json={
        "name": "Draft",
        "module": "project",
    }, headers=auth_headers).get_json()["stage"]["id"]

    resp = client.put(f"/api/workflow/stages/{stage_id}", json={
        "name": "Planning",
        "color": "#6366F1",
    }, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["stage"]["name"] == "Planning"


def test_delete_stage(client, auth_headers):
    stage_id = client.post("/api/workflow/stages", json={
        "name": "Temporary",
        "module": "project",
    }, headers=auth_headers).get_json()["stage"]["id"]

    resp = client.delete(f"/api/workflow/stages/{stage_id}", headers=auth_headers)
    assert resp.status_code == 200


# ── Field definitions ─────────────────────────────────────────────────────────

def test_create_field_definition_text(client, auth_headers):
    resp = client.post("/api/workflow/fields", json={
        "module": "work_order",
        "field_key": "rack_unit_count",
        "field_label": "Rack Unit Count",
        "field_type": "number",
        "is_required": True,
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.get_json()["field"]
    assert data["field_key"] == "rack_unit_count"
    assert data["field_type"] == "number"
    assert data["is_required"] is True


def test_create_field_definition_select_with_options(client, auth_headers):
    resp = client.post("/api/workflow/fields", json={
        "module": "project",
        "field_key": "project_type",
        "field_label": "Project Type",
        "field_type": "select",
        "field_config": {"options": ["Residential", "Commercial", "Live Event"]},
    }, headers=auth_headers)
    assert resp.status_code == 201
    config = resp.get_json()["field"]["field_config"]
    assert "Residential" in config["options"]


def test_create_field_definition_checklist_type(client, auth_headers):
    """Verify the CHECKLIST field type is accepted."""
    resp = client.post("/api/workflow/fields", json={
        "module": "work_order",
        "field_key": "commissioning_checklist",
        "field_label": "Commissioning Checklist",
        "field_type": "checklist",
        "field_config": {"items": ["Test HDMI", "Test Audio", "Verify Network"]},
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.get_json()["field"]["field_type"] == "checklist"


def test_create_field_definition_duplicate_key_rejected(client, auth_headers):
    payload = {
        "module": "work_order",
        "field_key": "po_number",
        "field_label": "PO Number",
        "field_type": "text",
    }
    client.post("/api/workflow/fields", json=payload, headers=auth_headers)
    resp = client.post("/api/workflow/fields", json=payload, headers=auth_headers)
    assert resp.status_code == 409


def test_list_field_definitions(client, auth_headers):
    client.post("/api/workflow/fields", json={
        "module": "work_order", "field_key": "field_a", "field_label": "A", "field_type": "text",
    }, headers=auth_headers)
    client.post("/api/workflow/fields", json={
        "module": "work_order", "field_key": "field_b", "field_label": "B", "field_type": "number",
    }, headers=auth_headers)

    resp = client.get("/api/workflow/fields?module=work_order", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.get_json()["fields"]) == 2


def test_field_definitions_tenant_isolated(client, auth_headers, second_auth_headers):
    client.post("/api/workflow/fields", json={
        "module": "project", "field_key": "secret_field", "field_label": "Secret", "field_type": "text",
    }, headers=auth_headers)

    resp = client.get("/api/workflow/fields?module=project", headers=second_auth_headers)
    keys = [f["field_key"] for f in resp.get_json()["fields"]]
    assert "secret_field" not in keys
