# AMBAR MVP Enterprise

## Alcance del MVP

AMBAR queda como un MVP empresarial SGDEA enfocado en operacion documental real:

- Autenticacion segura con JWT en cookies HttpOnly.
- RBAC y permisos por accion validados en backend.
- Usuarios, roles y matriz de permisos.
- Gestion documental con expedientes, documentos, tipologias, archivos digitales, versionamiento base y descargas seguras.
- TRD como estructura operacional: dependencias, series, subseries, tipologias, retencion y exportacion.
- Archivo y custodia: archivos, topografia fisica, cajas, ubicacion heredada, inventario y busqueda de ubicacion.
- Kardex como timeline de movimientos documentales.
- Transferencias, recepcion, FUID y prestamos documentales.
- Talento humano documental: empleados, cargos, dependencias, contratos, candidatos y portal publico de empleo.
- Auditoria, notificaciones, tareas, reportes operativos y tablero de estado.

## Controles de seguridad incluidos

- Tokens de sesion fuera de localStorage; se usan cookies HttpOnly con SameSite.
- Verificacion de sesion y permisos siempre contra backend.
- Rate limit distribuido con Redis para login, refresh, sesion, usuarios, auditoria y reportes.
- Bloqueo temporal por intentos fallidos de login.
- Politica de contrasena con longitud minima, complejidad y bloqueo de patrones comunes filtrados.
- MFA TOTP compatible con Google Authenticator y Microsoft Authenticator.
- Cabeceras de seguridad, CORS restringible y OpenAPI deshabilitable en produccion.
- Auditoria de accesos denegados, exportaciones, cambios de usuarios y operaciones sensibles.
- Secretos obligatorios por variables de entorno en produccion.

## Como proteger llaves y secretos

- Nunca guardar llaves reales en Git.
- Usar `.env` solo en servidores, con permisos restrictivos del sistema operativo.
- Rotar `JWT_SECRET_KEY`, `INTERNAL_SERVICE_SECRET`, `WEBHOOK_SECRET_ENCRYPTION_KEY`, `MINIO_SECRET_KEY`, claves de MySQL, Redis y RabbitMQ por ambiente.
- En produccion usar un gestor de secretos del cliente si existe: Vault, AWS Secrets Manager, Azure Key Vault, Doppler o variables protegidas del orquestador.
- No exponer MinIO, Redis, MySQL ni RabbitMQ a internet.
- Para integraciones, guardar en backend solo referencia/identificador del secreto y cargar el valor real desde entorno o secret manager.

## Rendimiento esperado del MVP

- Pool de conexiones SQL configurado por `DB_POOL_SIZE`, `DB_MAX_OVERFLOW` y `DB_POOL_RECYCLE_SECONDS`.
- Indices compuestos para documentos, expedientes, carpetas, cajas, prestamos, Kardex, notificaciones, tareas, transferencias, auditoria y empleados.
- Cache Redis de permisos, dashboard y resumen Kardex con TTL corto.
- Paginacion en endpoints sensibles de listado.
- Metricas y latencia por request con `Server-Timing` y `X-Response-Time-ms`.
- Scripts de auditoria y carga ligera en `backend/scripts`.

## Prueba minima antes de demo

1. Login admin.
2. Crear usuario y validar permisos.
3. Crear dependencia, serie, subserie y tipologia.
4. Crear expediente, carpeta y documento.
5. Cargar archivo digital y descargarlo.
6. Crear archivo fisico, caja y asignar ubicacion.
7. Crear transferencia, revisar FUID y recepcion.
8. Crear prestamo y devolverlo.
9. Revisar Kardex y auditoria.
10. Ejecutar build frontend, lint backend y smoke load test.
