"""
Seeds default workflow stages and modules when a new company is created.
Call seed_company_defaults(company_id) inside a db.session — caller commits.
"""
from app.extensions import db
from app.models.workflow import WorkflowStage, WorkflowModule
from app.models.company import CompanyModule


DEFAULT_PROJECT_STAGES = [
    {"name": "Planning",   "slug": "planning",   "color": "#3B82F6", "sort_order": 0},
    {"name": "Active",     "slug": "active",     "color": "#10B981", "sort_order": 1},
    {"name": "On Hold",    "slug": "on_hold",    "color": "#F59E0B", "sort_order": 2},
    {"name": "Completed",  "slug": "completed",  "color": "#6B7280", "sort_order": 3, "is_terminal": True, "is_success": True},
    {"name": "Cancelled",  "slug": "cancelled",  "color": "#EF4444", "sort_order": 4, "is_terminal": True},
]

DEFAULT_WORK_ORDER_STAGES = [
    {"name": "New",         "slug": "new",          "color": "#3B82F6", "sort_order": 0},
    {"name": "Scheduled",   "slug": "scheduled",    "color": "#8B5CF6", "sort_order": 1},
    {"name": "In Progress", "slug": "in_progress",  "color": "#F97316", "sort_order": 2},
    {"name": "On Hold",     "slug": "on_hold",      "color": "#F59E0B", "sort_order": 3},
    {"name": "Completed",   "slug": "completed",    "color": "#10B981", "sort_order": 4, "is_terminal": True, "is_success": True},
    {"name": "Cancelled",   "slug": "cancelled",    "color": "#EF4444", "sort_order": 5, "is_terminal": True},
]

# Modules enabled by default for all new companies
DEFAULT_MODULES = [
    {"module_name": "projects",       "is_enabled": True},
    {"module_name": "work_orders",    "is_enabled": True},
    {"module_name": "time_tracking",  "is_enabled": True},
    {"module_name": "file_uploads",   "is_enabled": True},
    # Disabled until Phase 2
    {"module_name": "crm",            "is_enabled": False},
    {"module_name": "invoicing",      "is_enabled": False},
    {"module_name": "equipment",      "is_enabled": False},
    {"module_name": "scheduling",     "is_enabled": False},
]


def seed_company_defaults(company_id) -> None:
    """
    Creates default workflow stages and modules for a newly registered company.
    Must be called inside an active app context with an open db.session.
    The caller is responsible for committing.
    """
    for stage_data in DEFAULT_PROJECT_STAGES:
        stage = WorkflowStage(
            company_id=company_id,
            module=WorkflowModule.PROJECT,
            is_terminal=stage_data.get("is_terminal", False),
            is_success=stage_data.get("is_success", False),
            **{k: v for k, v in stage_data.items() if k not in ("is_terminal", "is_success")},
        )
        db.session.add(stage)

    for stage_data in DEFAULT_WORK_ORDER_STAGES:
        stage = WorkflowStage(
            company_id=company_id,
            module=WorkflowModule.WORK_ORDER,
            is_terminal=stage_data.get("is_terminal", False),
            is_success=stage_data.get("is_success", False),
            **{k: v for k, v in stage_data.items() if k not in ("is_terminal", "is_success")},
        )
        db.session.add(stage)

    for module_data in DEFAULT_MODULES:
        module = CompanyModule(company_id=company_id, config={}, **module_data)
        db.session.add(module)
