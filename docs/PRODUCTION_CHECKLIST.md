# Checklist Produccion Fase 1

- [ ] Secretos reales en `.env` y gestor de secretos.
- [ ] HTTPS activo en proxy final.
- [ ] `FRONTEND_ORIGINS` limitado a dominios oficiales.
- [ ] Credenciales semilla cambiadas o deshabilitadas.
- [ ] Backups diarios de MySQL con retencion minima de 30 dias.
- [ ] Snapshots/replicacion MinIO.
- [ ] Logs enviados a Loki/SIEM.
- [ ] Antivirus o sandbox de uploads conectado antes de abrir carga publica.
- [ ] CI verde: backend tests, ruff, frontend build.
- [ ] Prueba manual de login, documentos, upload, TRD, kardex, auditoria, usuarios y notificaciones.

## Fase 2

- [ ] Probar flujo completo workflow: crear, iniciar, aprobar, rechazar y auditar.
- [ ] Probar expediente RRHH: empleado, documentos obligatorios, contrato, incidente y timeline.
- [ ] Probar lotes: crear, agregar documentos, aprobar, empacar, enviar, recibir y cerrar.
- [ ] Probar reportes grandes con ejecucion asincrona real antes de datos productivos.
- [ ] Configurar scheduler administrado y monitoreado.
- [ ] Alertar SLA vencidos y jobs fallidos en Prometheus/Grafana/Loki.
- [ ] Firmar descargas de reportes y evidencias con expiracion corta.
## Fase 3

- [ ] Desplegar `infra/k8s` en cluster Kubernetes de staging.
- [ ] Reemplazar `secrets.example.yaml` con External Secrets/Vault.
- [ ] Validar HPA bajo carga con K6 o Locust.
- [ ] Validar failover MySQL primary/replica.
- [ ] Validar Redis Cluster con replicas y failover.
- [ ] Validar OpenSearch con shards, replicas y snapshots.
- [ ] Validar MinIO distribuido con versionamiento y lifecycle policies.
- [ ] Validar RabbitMQ Cluster con DLQ, retries y durable queues.
- [ ] Conectar Prometheus, Grafana, Loki y tracing distribuido.
- [ ] Ejecutar restore testing y definir RPO/RTO firmados.
## Fase 4 Enterprise+

- [ ] Conectar motor OCR real y workers escalables.
- [ ] Validar precisión OCR con muestra documental real.
- [ ] Integrar proveedor de firma electrónica certificado si se requiere validez avanzada.
- [ ] Mover secretos ERP/webhook a Vault o External Secrets.
- [ ] Probar webhooks con HMAC, replay protection y retries.
- [ ] Separar Data Warehouse físico del MySQL operacional.
- [ ] Validar BI con RLS y auditoría de consultas.
- [ ] Ejecutar pruebas de carga OCR/BI/integraciones.