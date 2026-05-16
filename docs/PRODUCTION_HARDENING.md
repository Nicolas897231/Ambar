# Production Hardening Runbook

Antes de desplegar Ambar en produccion:

1. Configurar `ENVIRONMENT=production`.
2. Definir secretos reales para `JWT_SECRET_KEY`, `INTERNAL_SERVICE_SECRET`, `MINIO_SECRET_KEY` y `WEBHOOK_SECRET_ENCRYPTION_KEY`.
3. Usar `AUTO_CREATE_SCHEMA=false` y `SEED_DEFAULT_DATA=false`.
4. Ejecutar migraciones antes de arrancar la API:

```bash
cd backend
alembic upgrade head
```

5. Crear el primer super administrador mediante un proceso controlado de operaciones, no con seed demo.
6. Verificar Redis, MySQL, RabbitMQ, MinIO y OpenSearch desde `/health/ready` y monitoreo externo.
7. Ejecutar CI completo: backend lint/test, frontend lint/build, auditoria de dependencias y escaneo de secretos.

Notas importantes:

- En produccion el rate limiting depende de Redis y falla cerrado si Redis no esta disponible.
- Los webhooks usan firma HMAC con timestamp y tolerancia anti-replay.
- La creacion automatica de esquema queda reservada para local/desarrollo.