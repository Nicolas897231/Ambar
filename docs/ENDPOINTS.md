# Endpoints Fase 1

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET|POST|PATCH /api/v1/users`
- `GET|POST|PATCH /api/v1/documents`
- `POST /api/v1/documents/{id}/files`
- `GET /api/v1/documents/{id}/files`
- `GET|POST /api/v1/trd/series`
- `GET|POST /api/v1/trd/subseries`
- `GET|POST /api/v1/trd/dispositions`
- `GET|POST /api/v1/transfers`
- `PATCH /api/v1/transfers/{id}/status`
- `GET /api/v1/transfers/{id}/log`
- `GET /api/v1/audit/logs`
- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/{id}/read`
- `GET /api/v1/analytics/dashboard`

## Fase 2 Operacion Avanzada

- `GET|POST /api/v1/workflows`
- `POST /api/v1/workflows/{id}/steps`
- `POST /api/v1/workflows/{id}/start`
- `GET /api/v1/workflows/tasks`
- `PATCH /api/v1/workflows/tasks/{id}`
- `GET /api/v1/workflows/instances`
- `GET|POST /api/v1/hr/employees`
- `GET /api/v1/hr/employees/{id}/compliance`
- `POST /api/v1/hr/employees/{id}/files`
- `POST /api/v1/hr/employees/{id}/contracts`
- `GET /api/v1/hr/contracts/expiring`
- `POST /api/v1/hr/employees/{id}/incidents`
- `GET /api/v1/hr/employees/{id}/timeline`
- `GET|POST /api/v1/transfer-batches`
- `POST /api/v1/transfer-batches/{id}/documents`
- `PATCH /api/v1/transfer-batches/{id}/status`
- `POST /api/v1/transfer-batches/{id}/evidences`
- `POST /api/v1/reports/jobs`
- `GET /api/v1/reports/jobs`
- `GET /api/v1/reports/jobs/{id}/download`
- `POST /api/v1/scheduler/daily-checks`
- `GET /api/v1/analytics/advanced`
- `GET /api/v1/notifications/advanced`
- `PATCH /api/v1/notifications/advanced/{id}/read`
## Fase 3 Escalabilidad y Alta Disponibilidad

- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- `POST /api/v1/search/documents`
- `POST /api/v1/search/documents/reindex`
- `GET /api/v1/platform/technical-dashboard`
## Fase 4 Enterprise+

- `POST /api/v1/ocr/jobs`
- `GET /api/v1/ocr/jobs`
- `GET /api/v1/ocr/jobs/{id}/result`
- `POST /api/v1/signatures/requests`
- `POST /api/v1/signatures/requests/{id}/complete`
- `GET /api/v1/signatures/requests`
- `GET|POST /api/v1/integrations`
- `POST /api/v1/integrations/{id}/sync`
- `GET /api/v1/integrations/{id}/logs`
- `POST /api/v1/webhooks/endpoints`
- `GET /api/v1/webhooks/endpoints`
- `POST /api/v1/webhooks/emit`
- `POST /api/v1/webhooks/incoming/{id}`
- `GET /api/v1/webhooks/deliveries`
- `GET /api/v1/bi/executive-dashboard`
- `POST /api/v1/bi/refresh`
- `GET /api/v1/bi/snapshots`