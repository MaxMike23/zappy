# Import all models here so Flask-Migrate / SQLAlchemy sees them
# Order matters: referenced tables must be imported before referencing tables

from app.models.company import Company, CompanyModule
from app.models.user import User, TokenBlocklist
from app.models.workflow import WorkflowStage, WorkflowFieldDefinition
from app.models.project import Project
from app.models.work_order import WorkOrder, WorkOrderNote, work_order_assignments
from app.models.time_log import TimeLog
from app.models.file import UploadedFile
from app.models.audit import AuditLog
from app.models.visit import Visit, visit_assignments, VisitStatus
from app.models.attendance import Attendance
from app.models.device import DeviceTemplate, DeviceCategory

__all__ = [
    "Company",
    "CompanyModule",
    "User",
    "TokenBlocklist",
    "WorkflowStage",
    "WorkflowFieldDefinition",
    "Project",
    "WorkOrder",
    "WorkOrderNote",
    "work_order_assignments",
    "TimeLog",
    "UploadedFile",
    "AuditLog",
    "Visit",
    "visit_assignments",
    "VisitStatus",
    "Attendance",
    "DeviceTemplate",
    "DeviceCategory",
]
