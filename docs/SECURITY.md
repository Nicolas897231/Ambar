# Seguridad

Antes de produccion:

1. Cambiar todos los secretos de `.env`.
2. Activar HTTPS en el proxy externo.
3. Usar dominios reales en `FRONTEND_ORIGINS`.
4. Configurar backups diarios de MySQL y snapshots de MinIO.
5. Agregar antivirus de uploads en la tuberia de archivos.
6. Enviar logs a Loki o SIEM.
7. Separar credenciales por ambiente.

Controles ya implementados:

- JWT y refresh sessions revocables.
- Politica minima de contrasenas de 12 caracteres.
- RBAC con permisos por modulo.
- Auditoria de login, documentos, usuarios, TRD, transferencias y notificaciones.
- Validacion MIME, limite de tamano y checksum en uploads.
- Rate limiting por IP y ruta.
- Headers de seguridad en API, frontend y Nginx.

## Fase 2

Controles agregados:

- Permisos RBAC para workflows, tareas, RRHH, lotes, reportes y scheduler.
- Auditoria extendida para aprobaciones, rechazos, reportes, expedientes y transferencias avanzadas.
- Notificaciones accionables con modulo y `action_url`.
- Reportes generados como jobs auditables y con descarga temporal/logica.
- Validacion de transiciones de estado para workflows y lotes.

Antes de produccion se debe conectar antivirus de evidencias/uploads, firmar URLs de reportes en MinIO y mover scheduler a APScheduler/Celery Beat gestionado.
## Fase 3

Controles agregados:

- Readiness/liveness para evitar enrutar tráfico a pods no sanos.
- NetworkPolicy base con deny por defecto.
- Secrets Kubernetes separados de ConfigMaps.
- Ingress con TLS obligatorio y rate limit.
- Dashboard técnico protegido por RBAC `platform.view`.
- Búsqueda protegida por RBAC `search.query` y reindexación por `search.reindex`.
- Métricas sin datos sensibles.

Pendientes antes de producción real:

- Activar TLS interno entre servicios.
- Integrar WAF administrado o reglas NGINX ModSecurity.
- Reemplazar `secrets.example.yaml` por secretos reales desde Vault/External Secrets.
- Activar OpenSearch security plugin en cluster productivo.
## Fase 4 Enterprise+

Controles agregados:

- OCR protegido por permiso `ocr.manage` y auditoría de procesamiento.
- Firmas con token aleatorio, hash SHA256 documental, expiración y evidencia legal.
- Integraciones centralizadas por `integration-service`; ningún dominio se conecta directo a ERP.
- Webhooks con firma HMAC, timestamp y auditoría de recepción/emisión.
- BI protegido por `bi.view` y `bi.refresh`.

Pendientes antes de producción real:

- Ejecutar OCR en sandbox/worker aislado con antivirus.
- Cifrar secretos de integraciones y webhooks con Vault/KMS.
- Activar mTLS para adapters externos críticos.
- Firmar legalmente documentos con proveedor certificado cuando aplique.