# AMBAR - checklist de produccion

AMBAR debe desplegarse como plataforma SGDEA enterprise compacta: expedientes vivos, custodia, transferencias, recepcion, FUID, Kardex, prestamos, ubicaciones, auditoria y seguridad por archivo. BI, OCR, firmas, integraciones y webhooks son capacidades secundarias de plataforma.

## Variables obligatorias

En produccion usar valores propios, largos y no reutilizados:

- `ENVIRONMENT=production`
- `PROJECT_NAME=AMBAR`
- `DATABASE_URL=postgresql+psycopg://...` o el motor relacional aprobado por infraestructura
- `REDIS_URL=redis://...`
- `RABBITMQ_URL=amqp://...`
- `MINIO_ENDPOINT=...`
- `MINIO_ACCESS_KEY=...`
- `MINIO_SECRET_KEY=...`
- `MINIO_BUCKET=ambar-documents`
- `JWT_SECRET_KEY` con minimo 32 caracteres aleatorios
- `INTERNAL_SERVICE_SECRET` con minimo 32 caracteres aleatorios
- `WEBHOOK_SECRET_ENCRYPTION_KEY` con minimo 32 caracteres aleatorios
- `FRONTEND_ORIGINS=https://app.empresa.com`
- `ALLOWED_HOSTS=api.empresa.com,app.empresa.com`
- `AUTO_CREATE_SCHEMA=false`
- `SEED_DEFAULT_DATA=false`

La API rechaza arranque productivo si detecta secretos por defecto, wildcard en CORS/hosts, autocreacion de esquema o seed automatico.

## Migraciones

Antes de iniciar la API:

```powershell
cd backend
.\.venv\Scripts\alembic upgrade head
```

No depender de `AUTO_CREATE_SCHEMA=true` en produccion. Las guardias de startup existen para compatibilidad local/staging, no como estrategia principal de despliegue.

## Seguridad operativa

- Mantener HTTPS obligatorio en el balanceador o ingress.
- Mantener `ALLOWED_HOSTS` y `FRONTEND_ORIGINS` sin wildcard.
- No exponer `/docs`, `/redoc` ni `/openapi.json` en produccion; la app los desactiva automaticamente con `ENVIRONMENT=production`.
- Proteger `/metrics` a nivel de red o ingress.
- Rotar secretos si se compartieron en canales no seguros.
- No guardar tokens, contrasenas ni secretos en auditoria.
- Verificar que todo endpoint documental valide archivo permitido + permiso de accion.
- Verificar que descargas usen URL firmada y auditen `document_file_downloaded`.

## Smoke test minimo

Ejecutar despues de migrar y desplegar:

1. Login administrador.
2. Crear archivo y asignar usuario.
3. Crear expediente con TRD, carpeta y documento.
4. Subir archivo digital permitido.
5. Descargar archivo con URL firmada.
6. Crear transferencia mixta.
7. Revisar recepcion por item: aceptar, rechazar con motivo y parcial.
8. Generar/comparar FUID.
9. Crear y devolver prestamo.
10. Mover caja/carpeta dentro del mismo archivo.
11. Ver Kardex por entidad.
12. Exportar auditoria filtrada.
13. Validar que usuario sin archivo recibe 403 auditado.

## Comandos de calidad

```powershell
cd backend
.\.venv\Scripts\python -m ruff check app tests
.\.venv\Scripts\python -m pytest -q

cd ..\frontend
npm run lint
npm run build
```

## Politica de producto

Antes de vender o desplegar a empresa:

- El sidebar debe mantenerse compacto.
- No promover BI/OCR/webhooks/firmas como flujos diarios.
- Toda accion critica debe auditarse.
- Todo movimiento documental debe generar Kardex.
- Ningun documento debe existir sin archivo, expediente, carpeta y TRD.
- Todo listado debe respetar permisos por archivo.
- Todo error esperado debe responder 400, 403, 404, 409, 415 o 422, no 500 generico.
