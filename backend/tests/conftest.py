"""
Shared pytest fixtures for the Zappy backend test suite.

Test database: zappy_test (separate from dev zappy DB)
Strategy:
  - create_all() once per session (idempotent; schema persists between runs)
  - TRUNCATE all tables BEFORE each test (setup, not teardown) so every test
    starts clean even if a previous run was killed mid-flight
  - Kill 'idle in transaction' zombie connections before TRUNCATE to prevent
    lock blocking from previously crashed pytest processes
"""
import pytest
import psycopg2
from psycopg2 import sql
from sqlalchemy import text

from app import create_app
from app.extensions import db as _db


# ── Database bootstrap ────────────────────────────────────────────────────────

def _ensure_test_db():
    """Create the zappy_test PostgreSQL database if it does not already exist."""
    conn = psycopg2.connect(
        dbname="zappy", user="zappy_user", password="zappy_pass", host="db"
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pg_database WHERE datname = 'zappy_test'")
    if not cur.fetchone():
        cur.execute(
            sql.SQL("CREATE DATABASE {}").format(sql.Identifier("zappy_test"))
        )
    cur.close()
    conn.close()


# ── Core fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def app():
    """
    Create the Flask test application once per test session.
    Schema is created once and left in place; clean_db handles data isolation.
    """
    _ensure_test_db()
    application = create_app("testing")
    with application.app_context():
        _db.create_all()
        yield application
        # No drop_all() — schema persists so the next run's create_all() is
        # idempotent, and clean_db (setup) guarantees a clean data state.


@pytest.fixture
def client(app):
    """Fresh test client for each test."""
    return app.test_client()


@pytest.fixture(autouse=True)
def clean_db(app):
    """
    Truncate all tables BEFORE each test to guarantee isolation.

    Running cleanup as setup (not teardown) means every test starts clean
    even if the previous test or the whole pytest process was killed abruptly.

    Also kills 'idle in transaction' zombie connections that would otherwise
    hold table locks and block the TRUNCATE indefinitely.
    """
    _db.session.rollback()
    _db.session.remove()
    with _db.engine.begin() as conn:
        # Terminate zombie connections from crashed previous runs.
        # zappy_user can terminate its own connections without superuser.
        conn.execute(text(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = current_database() "
            "  AND pid <> pg_backend_pid() "
            "  AND state = 'idle in transaction'"
        ))
        conn.execute(text(
            "TRUNCATE TABLE "
            "audit_logs, uploaded_files, time_logs, "
            "work_order_notes, work_order_assignments, work_orders, "
            "projects, workflow_field_definitions, workflow_stages, "
            "token_blocklist, users, company_modules, companies "
            "CASCADE"
        ))
    yield


# ── Auth / company helpers ────────────────────────────────────────────────────

@pytest.fixture
def registered_company(client):
    """
    Registers a new company and returns the full API response dict:
    { company, user, access_token, refresh_token }
    """
    resp = client.post("/api/auth/register", json={
        "company_name": "Test AV Co",
        "email": "admin@testavco.com",
        "password": "password123",
        "first_name": "Admin",
        "last_name": "User",
    })
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()


@pytest.fixture
def auth_headers(registered_company):
    """Authorization header for the company admin."""
    return {"Authorization": f"Bearer {registered_company['access_token']}"}


@pytest.fixture
def tech_headers(client, auth_headers):
    """
    Creates a technician user under the same company and returns their
    Authorization header. Depends on auth_headers (admin must exist first).
    """
    client.post("/api/users/", json={
        "email": "tech@testavco.com",
        "password": "password123",
        "first_name": "Field",
        "last_name": "Tech",
        "role": "technician",
    }, headers=auth_headers)
    resp = client.post("/api/auth/login", json={
        "email": "tech@testavco.com",
        "password": "password123",
    })
    return {"Authorization": f"Bearer {resp.get_json()['access_token']}"}


@pytest.fixture
def second_company(client):
    """Registers a second, separate company for cross-tenant isolation tests."""
    resp = client.post("/api/auth/register", json={
        "company_name": "Other AV Co",
        "email": "admin@otheravco.com",
        "password": "password123",
        "first_name": "Other",
        "last_name": "Admin",
    })
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()


@pytest.fixture
def second_auth_headers(second_company):
    """Authorization header for the second company's admin."""
    return {"Authorization": f"Bearer {second_company['access_token']}"}
