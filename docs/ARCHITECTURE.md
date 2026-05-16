# Arquitectura Fase 1

Ambar Fase 1 se entrega como monorepo modular preparado para separacion fisica por microservicios. Los limites de dominio ya estan aislados en routers y modelos por modulo:

- Auth y RBAC
- Usuarios
- Documentos
- TRD
- Kardex y transferencias
- Auditoria
- Notificaciones
- Analytics

## Infraestructura

- MySQL 8: datos relacionales y auditoria.
- Redis: sesiones, cache y rate limiting previsto.
- MinIO: binarios privados con URLs temporales.
- RabbitMQ: eventos de dominio.
- Nginx: reverse proxy y headers de seguridad.

## Seguridad

- JWT access token de 15 minutos.
- Refresh token de 7 dias con sesion revocable.
- RBAC por permiso `module.action`.
- Password hashing bcrypt.
- CORS por allowlist.
- Headers: CSP, HSTS en produccion, X-Frame-Options, X-Content-Type-Options, Referrer-Policy y Permissions-Policy.
- Auditoria persistente de acciones sensibles.
- Restriccion logica por empresa y sede en documentos.

## Decision MVP

Para reducir riesgo operativo, Fase 1 corre como API modular unica. La estructura permite extraer servicios sin reescribir dominios cuando pasemos a Fase 2/3.

## Fase 2

La operacion avanzada agrega nuevos dominios modulares listos para separarse en microservicios cuando el despliegue lo requiera:

- `workflow-service`: definiciones, pasos, instancias, tareas, SLA y aprobaciones.
- `hr-service`: empleados, expedientes laborales, contratos, incidentes y cumplimiento documental.
- `reporting-service`: jobs de reportes, generacion CSV inicial y auditoria de descarga.
- `scheduler-service`: chequeos diarios de contratos y tareas vencidas.
- `transfer-batch-service`: lotes multi-documento, evidencias y estados extendidos.

Cada accion critica publica eventos RabbitMQ cuando esta disponible y siempre registra auditoria transaccional en MySQL.
## Fase 3

La fase de escalabilidad agrega capacidades para alta disponibilidad:

- Healthchecks `/health/live` y `/health/ready` para Kubernetes.
- Métricas Prometheus en `/metrics`.
- Pooling SQLAlchemy configurable y `READ_DATABASE_URL` para replicas de lectura.
- Redis cache distribuido con TTL e invalidación por patrón.
- OpenSearch opcional para búsqueda full-text con fallback MySQL seguro.
- Dashboard técnico de plataforma en `/api/v1/platform/technical-dashboard`.
- Manifiestos Kubernetes con deployments, services, ingress, HPA y network policies.

Los servicios siguen siendo stateless; todo estado vive en MySQL, Redis, RabbitMQ, MinIO u OpenSearch.
## Fase 4 Enterprise+

Se agregan dominios de interoperabilidad e inteligencia operacional:

- `ocr-service`: jobs OCR, fingerprinting, extracción de texto/metadata e indexación.
- `signature-service`: solicitudes de firma, token, hash documental y evidencia auditable.
- `integration-service`: adapters ERP/API y logs de sincronización.
- `webhook-service`: endpoints, emisiones, recepción HMAC y trazabilidad.
- `bi-service`: dashboard ejecutivo avanzado, snapshots y hechos DW.

Los procesos pesados se modelan como jobs/eventos. En producción deben ejecutarse por workers separados y colas RabbitMQ con DLQ.