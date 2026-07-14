from fastapi import APIRouter

from app.domains.advanced_transfers.router import router as advanced_transfers_router
from app.domains.analytics.router import router as analytics_router
from app.domains.audit.router import router as audit_router
from app.domains.archives.router import router as archives_router
from app.domains.auth.router import router as auth_router
from app.domains.bi.router import router as bi_router
from app.domains.correspondence.router import router as correspondence_router
from app.domains.documents.router import router as documents_router
from app.domains.hr.router import router as hr_router
from app.domains.integrations.router import router as integrations_router
from app.domains.kardex.router import router as kardex_router
from app.domains.notifications.router import router as notifications_router
from app.domains.ocr.router import router as ocr_router
from app.domains.platform.router import router as platform_router
from app.domains.reports.router import router as reports_router
from app.domains.scheduler.router import router as scheduler_router
from app.domains.search.router import router as search_router
from app.domains.signatures.router import router as signatures_router
from app.domains.transfers.router import router as transfers_router
from app.domains.trd.router import router as trd_router
from app.domains.users.router import router as users_router
from app.domains.webhooks.router import router as webhooks_router
from app.domains.workflows.router import router as workflows_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(documents_router)
api_router.include_router(archives_router)
api_router.include_router(trd_router)
api_router.include_router(transfers_router)
api_router.include_router(audit_router)
api_router.include_router(notifications_router)
api_router.include_router(analytics_router)
api_router.include_router(workflows_router)
api_router.include_router(hr_router)
api_router.include_router(advanced_transfers_router)
api_router.include_router(kardex_router)
api_router.include_router(reports_router)
api_router.include_router(scheduler_router)
api_router.include_router(search_router)
api_router.include_router(platform_router)
api_router.include_router(ocr_router)
api_router.include_router(signatures_router)
api_router.include_router(integrations_router)
api_router.include_router(webhooks_router)
api_router.include_router(bi_router)
api_router.include_router(correspondence_router)
