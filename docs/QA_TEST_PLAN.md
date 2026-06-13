# Manual QA Integral - Ambar

## Objetivo

Validar que Ambar funcione de punta a punta en staging antes de produccion: frontend, API, base de datos, cache, mensajeria, almacenamiento, busqueda, seguridad, auditoria y flujos documentales.

## Ambiente Bajo Prueba

- URL principal: `http://10.10.10.240`
- API: `http://10.10.10.240/api/v1`
- API docs: `http://10.10.10.240/docs`
- Frontend directo: `http://10.10.10.242:3000`
- Infraestructura: `10.10.10.241`

Credencial staging inicial:

- Usuario: `<admin-email-del-ambiente>`
- Password: `<password-rotado-del-ambiente>`

## Reglas Generales De Prueba

Cada caso debe registrar:

- Fecha/hora.
- Navegador y version.
- Usuario usado.
- Datos ingresados.
- Resultado esperado.
- Resultado obtenido.
- Evidencia: captura, request/response, log o ID generado.

Criterios de bloqueo:

- Pantalla 404 en ruta del menu.
- Boton que no ejecuta accion.
- API con 500 no controlado.
- Perdida de sesion sin razon.
- Acceso a modulo sin permiso.
- Creacion de registros sin auditoria.
- Datos visibles fuera del alcance esperado.

## Smoke Test Inicial

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| SMK-01 | Gateway vivo | Abrir `/health` | `status=ok` |
| SMK-02 | Readiness | Abrir `/health/ready` | MySQL y Redis `ok` |
| SMK-03 | Frontend | Abrir `/login` | Login Ambar visible |
| SMK-04 | API docs | Abrir `/docs` | Swagger disponible |
| SMK-05 | Login | Entrar con admin | Redireccion a dashboard |
| SMK-06 | Menu completo | Revisar sidebar | Todos los modulos visibles |
| SMK-07 | Logout | Clic en Salir | Vuelve a login |

## Autenticacion Y Sesion

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| AUTH-01 | Login valido | Usar admin correcto | Login exitoso |
| AUTH-02 | Login invalido | Password incorrecto | Mensaje de error, no entra |
| AUTH-03 | Sesion requerida | Abrir `/dashboard` sin token | Redireccion o 401 controlado |
| AUTH-04 | Logout | Iniciar sesion y salir | Tokens/cookies limpiados |
| AUTH-05 | Refresh | Mantener sesion y llamar API | Sesion se mantiene mientras refresh sea valido |
| AUTH-06 | Cookie HttpOnly | Revisar Set-Cookie en login | Cookies `ambar_access_token` y refresh con HttpOnly |
| AUTH-07 | RBAC base | Usar usuario sin permiso | 403 en modulo restringido |

## Usuarios Y Permisos

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| USR-01 | Listar usuarios | Abrir Usuarios | Tabla carga sin error |
| USR-02 | Crear usuario | Crear usuario con datos validos | Usuario aparece activo |
| USR-03 | Email duplicado | Crear mismo email | Error controlado |
| USR-04 | Password debil | Crear con password debil | Rechazo por politica |
| USR-05 | Roles | Asignar rol permitido | Permisos reflejados al login |
| USR-06 | Auditoria | Crear/editar usuario | Evento aparece en Auditoria |

## Dashboard Ejecutivo

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| DAS-01 | Carga inicial | Abrir Dashboard | KPIs visibles |
| DAS-02 | Riesgo documental | Revisar indicador | Alto/Medio/Bajo o valor valido |
| DAS-03 | Datos accionables | Clic en widgets/enlaces disponibles | Navega al modulo relacionado |
| DAS-04 | Sin datos | Base con pocos datos | No rompe, muestra ceros/controlados |
| DAS-05 | Rendimiento | Recargar 5 veces | Respuesta percibida menor a 3 s en LAN |

## Documentos

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| DOC-01 | Listar documentos | Abrir Documentos | Tabla/listado carga |
| DOC-02 | Crear documento | Nombre, tipo, metadata | Documento creado con ID |
| DOC-03 | Validacion obligatoria | Enviar vacio | Errores de validacion |
| DOC-04 | Cargar PDF | Subir PDF valido menor al limite | Archivo queda asociado |
| DOC-05 | Tipo no permitido | Subir archivo no permitido | Rechazo controlado |
| DOC-06 | Tamano maximo | Subir mayor a `MAX_UPLOAD_MB` | Rechazo controlado |
| DOC-07 | Version/metadata | Editar metadata | Cambios persistidos |
| DOC-08 | Auditoria | Crear/editar/subir | Eventos en Auditoria |
| DOC-09 | MinIO | Revisar objeto o presigned URL | Archivo almacenado o fallback controlado |
| DOC-10 | RLS/scope | Usuario de otra sede | No ve documento fuera de alcance |

## TRD

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| TRD-01 | Series | Abrir TRD | Series existentes visibles |
| TRD-02 | Crear serie | Codigo unico | Serie creada |
| TRD-03 | Codigo duplicado | Repetir codigo | Error controlado |
| TRD-04 | Subserie | Crear subserie con retencion | Subserie asociada |
| TRD-05 | Disposicion | Crear disposicion final | Retencion calculable |
| TRD-06 | Clasificar documento | Asociar subserie | Documento queda clasificado |

## Kardex Y Transferencias

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| KAR-01 | Crear transferencia | Documento, origen, destino | Transferencia pendiente |
| KAR-02 | Recibir transferencia | Marcar recibida | Estado cambia y genera log |
| KAR-03 | Historial | Abrir kardex | Origen/destino/usuario/fecha visibles |
| KAR-04 | Sin permiso | Usuario viewer intenta transferir | 403 o accion oculta |
| KAR-05 | Auditoria | Transferir/recibir | Eventos auditados |

## Workflows Y Tareas

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| WFL-01 | Listar workflows | Abrir Workflows | Flujos visibles |
| WFL-02 | Crear workflow | Nombre, modulo, pasos | Workflow activo |
| WFL-03 | Iniciar instancia | Asociar entidad | Tarea generada |
| TSK-01 | Ver tareas | Abrir Tareas | Tareas pendientes visibles |
| TSK-02 | Completar tarea | Enviar evidencia | Estado completado |
| TSK-03 | SLA | Tarea con vencimiento | Fecha limite visible |

## RRHH

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| HR-01 | Crear empleado | Datos basicos | Empleado activo |
| HR-02 | Expediente | Asociar documento | Archivo laboral vinculado |
| HR-03 | Contrato | Crear contrato activo | Contrato visible |
| HR-04 | Incidente | Registrar incidente | Incidente persistido |
| HR-05 | Cumplimiento | Expediente incompleto | Indicador/alerta visible |

## Lotes De Transferencia

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| LOT-01 | Crear lote | Origen/destino | Lote pendiente |
| LOT-02 | Agregar documentos | Asociar varios documentos | Documentos quedan en lote |
| LOT-03 | Recibir lote | Confirmar recepcion | Estado actualizado |
| LOT-04 | Evidencia | Adjuntar evidencia | Evidencia registrada |

## Reportes

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| REP-01 | Ruta existe | Abrir `/reports` | Pagina Reportes carga, no 404 |
| REP-02 | Listar jobs | Abrir Reportes con sesion | API `/reports/jobs` responde 200 |
| REP-03 | Reporte operativo | Clic Operativo | Job `completed` aparece en tabla |
| REP-04 | Reporte ejecutivo | Clic Ejecutivo | Job creado con archivo |
| REP-05 | Reporte auditoria | Clic Auditoria | CSV incluye eventos recientes |
| REP-06 | Reporte cumplimiento | Clic Cumplimiento | Job creado |
| REP-07 | Reporte RRHH | Clic RRHH | Job creado |
| REP-08 | Descargar | Clic Descargar | Muestra ruta/URL del archivo generado |
| REP-09 | Permisos | Usuario sin `report.request` | 403 o accion no disponible |
| REP-10 | Auditoria | Crear/descargar reporte | Eventos en Auditoria |
| REP-11 | Persistencia | Recargar pagina | Jobs previos siguen visibles |

Validacion API manual:

```bash
TOKEN=$(curl -s -X POST http://10.10.10.240/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin-email-del-ambiente>","password":"<password-rotado-del-ambiente>"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s http://10.10.10.240/api/v1/reports/jobs -H "Authorization: Bearer $TOKEN"
curl -s -X POST http://10.10.10.240/api/v1/reports/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"report_type":"operational"}'
```

## Busqueda

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| SEA-01 | Buscar documento | Query existente | Resultado visible |
| SEA-02 | Sin resultados | Query rara | Estado vacio controlado |
| SEA-03 | Fallback | OpenSearch no disponible | Fallback MySQL sin 500 |
| SEA-04 | Reindex | Ejecutar reindex | Evento/log generado |

## OCR

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| OCR-01 | Crear job | Documento existente | Job completado o queued |
| OCR-02 | Ver resultado | Abrir resultado | Texto extraido visible |
| OCR-03 | Documento inexistente | ID invalido | 404 controlado |
| OCR-04 | Auditoria | Ejecutar OCR | Evento auditado |

## Firmas

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| SIG-01 | Crear solicitud | Documento + firmante | Token generado una vez |
| SIG-02 | Completar firma | Token valido | Estado firmado |
| SIG-03 | Token invalido | Token incorrecto | Rechazo |
| SIG-04 | Evidencia | Completar con evidencia | Evidencia persistida |
| SIG-05 | Expiracion | Token vencido | Rechazo |

## Integraciones

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| INT-01 | Crear integracion | Nombre/tipo/config | Integracion activa |
| INT-02 | Nombre duplicado | Repetir nombre | 409 controlado |
| INT-03 | Sincronizar | Enviar payload | Log de sync creado |
| INT-04 | Listar logs | Abrir logs | Request/response visibles |

## Webhooks

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| WH-01 | Crear endpoint | URL/evento | Secret se muestra una vez |
| WH-02 | Emitir evento | Evento coincidente | Delivery queued |
| WH-03 | Incoming firmado | HMAC correcto | `received` |
| WH-04 | Firma invalida | HMAC incorrecto | 403 |
| WH-05 | Replay viejo | Timestamp viejo | 403 |
| WH-06 | Listar deliveries | Abrir deliveries | Historial visible |

## BI

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| BI-01 | Dashboard BI | Abrir BI | Metricas visibles |
| BI-02 | Refresh | Ejecutar refresh | Snapshot nuevo |
| BI-03 | Datos base | Sin jobs/documentos | Ceros controlados |

## Plataforma, Observabilidad Y Salud

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| PLT-01 | Live | `/health/live` | Alive |
| PLT-02 | Ready | `/health/ready` | MySQL/Redis ok |
| PLT-03 | Metrics | `/metrics` | Texto Prometheus |
| PLT-04 | Plataforma UI | Abrir Plataforma | Nodo, cache, search visibles |
| PLT-05 | Logs | Revisar Docker logs | Sin trazas repetitivas ni restarts |

## Auditoria Y Notificaciones

| ID | Caso | Pasos | Esperado |
| --- | --- | --- | --- |
| AUD-01 | Listar auditoria | Abrir Auditoria | Eventos visibles |
| AUD-02 | Filtrar modulo | Buscar auth/document/reports | Resultados coherentes |
| NOT-01 | Listar notificaciones | Abrir Notificaciones | Items visibles |
| NOT-02 | Marcar leida | Clic accion | Estado actualizado |
| NOT-03 | Notificacion accionable | Crear reporte/workflow | Notificacion con URL util |

## Pruebas No Funcionales

### Seguridad

| ID | Caso | Esperado |
| --- | --- | --- |
| SEC-01 | Abrir API sin token | 401 |
| SEC-02 | Token alterado | 401 |
| SEC-03 | Permiso insuficiente | 403 |
| SEC-04 | CORS origen no permitido | Bloqueado |
| SEC-05 | Headers seguridad | CSP, X-Frame-Options, nosniff presentes |
| SEC-06 | Rate limit | Muchas peticiones | 429 o proteccion activa |
| SEC-07 | Password debil | Rechazado |
| SEC-08 | Secretos en repo | No hay `.env` real versionado |

### Rendimiento

| ID | Caso | Esperado |
| --- | --- | --- |
| PERF-01 | Login | Menos de 2 s en LAN |
| PERF-02 | Dashboard | Menos de 3 s en LAN |
| PERF-03 | Listados | Paginacion o respuesta aceptable |
| PERF-04 | Upload 10 MB | Sin timeout |
| PERF-05 | 20 usuarios concurrentes | Sin errores 5xx sostenidos |

### Disponibilidad

| ID | Caso | Esperado |
| --- | --- | --- |
| AVL-01 | Reiniciar API | Vuelve healthy |
| AVL-02 | Reiniciar frontend | Vuelve healthy |
| AVL-03 | Redis caido en staging | Ready degradado o API protegida |
| AVL-04 | MySQL caido | Ready `not_ready`, API no oculta error |

### Compatibilidad

| ID | Caso | Esperado |
| --- | --- | --- |
| CMP-01 | Chrome | UI correcta |
| CMP-02 | Edge | UI correcta |
| CMP-03 | Firefox | UI correcta |
| CMP-04 | 1366x768 | Sin solapes |
| CMP-05 | Movil | Menu y tablas usables |

## Checklist De Cierre QA

- Todos los modulos del menu cargan sin 404.
- Todos los botones visibles ejecutan accion o muestran error controlado.
- No hay errores 500 durante smoke test.
- No hay contenedores reiniciando.
- `/health/ready` responde `ready`.
- Reportes genera al menos un job de cada tipo.
- Auditoria registra login, documentos, reportes y transferencias.
- No hay secretos reales en Git.
- Evidencias guardadas en carpeta QA o issue tracker.