# Ambar

AMBAR es una plataforma SGDEA enterprise para expedientes vivos, custodia documental, TRD, FUID, transferencias, recepcion, prestamos, ubicacion fisica, Kardex documental, repositorio seguro y auditoria.

La filosofia de producto es compacta: menos modulos decorativos, mas operacion archivistica real.

## Fase 1

Esta base implementa el Core MVP descrito en la especificacion tecnica:

- FastAPI modular con JWT, refresh tokens, RBAC, auditoria y rate limiting.
- MySQL para datos relacionales, Redis para sesiones/cache/rate limit, MinIO para archivos y RabbitMQ para eventos.
- Next.js con TypeScript para dashboard, documentos, TRD, kardex, auditoria, usuarios y notificaciones.
- Docker Compose, Nginx, CI, pruebas y documentacion operativa.

## Ejecutar en local

```powershell
cd C:\Users\Nicolas\OneDrive - SENA\Documentos\Ambar
Copy-Item .env.example .env
docker compose -f infra/docker/docker-compose.yml up --build
```

Servicios:

- Frontend: http://localhost:3000
- API: http://localhost:8000
- Docs API: http://localhost:8000/docs
- MinIO console: http://localhost:9001
- RabbitMQ console: http://localhost:15672

Usuario semilla:

- Email: `admin@ambar.co`
- Password: `ChangeMe123!`

Cambiar estas credenciales y todos los secretos antes de produccion.

## Fase 2 incluida

- Workflows y bandeja de tareas.
- Expedientes RRHH con cumplimiento documental.
- Transferencias avanzadas por lotes.
- Notificaciones avanzadas accionables.
- Reportes operativos, ejecutivos, auditoria, cumplimiento y RRHH.
- Scheduler de chequeos diarios.
- Dashboard operativo avanzado.
## Fase 3 incluida

- Healthchecks live/ready para Kubernetes.
- Métricas Prometheus.
- Pooling de base de datos y read replica configurable.
- Cache Redis distribuido e invalidación.
- Búsqueda enterprise con OpenSearch y fallback MySQL.
- Dashboard técnico de plataforma.
- Manifiestos Kubernetes con HPA, Ingress y NetworkPolicy.
## Fase 4 incluida

- OCR Center con pipeline auditable.
- Firmas electrónicas con evidencia y hash documental.
- Integraciones ERP/API mediante adapters desacoplados.
- Webhooks HMAC de entrada/salida.
- BI avanzado y snapshots de Data Warehouse.
## Despliegue staging multi-servidor

La guia operativa para desplegar en `10.10.10.241`, `10.10.10.240` y `10.10.10.242` esta en:

- `docs/STAGING_DEPLOYMENT.md`
## Manual QA

El plan integral de pruebas funcionales y no funcionales esta en:

- `docs/QA_TEST_PLAN.md`

## Checklist de produccion

La guia minima para dejar AMBAR listo para staging/produccion empresarial esta en:

- `docs/PRODUCTION_READINESS.md`
