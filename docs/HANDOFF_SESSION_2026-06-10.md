# AMBAR - Handoff de sesion

Fecha: 2026-06-10  
Proyecto: AMBAR SGDEA Enterprise  
Repo local: `C:\Users\Nicolas\OneDrive - SENA\Documentos\Ambar`

## 1. De que trata AMBAR

AMBAR es una plataforma SGDEA enterprise para gestion documental, custodia archivistica y operacion documental empresarial.

La aplicacion busca reemplazar el enfoque de CRUD documental por un sistema operacional donde el usuario pueda saber:

- que expediente existe;
- que documentos lo componen;
- que TRD, serie, subserie y tipologia gobiernan el documento;
- donde esta fisicamente una caja, carpeta, expediente o documento;
- quien tiene la custodia;
- que transferencias, prestamos, recepciones, rechazos y movimientos han ocurrido;
- que auditoria y Kardex respaldan cada accion;
- que tareas o alertas requieren atencion.

AMBAR debe sentirse como una plataforma moderna de logistica documental y SGDEA, no como un ERP ni como un panel administrativo pesado.

## 2. Arquitectura actual

Backend:

- FastAPI.
- MySQL en staging.
- Redis.
- RabbitMQ.
- MinIO/S3.
- JWT.
- RBAC.
- Permisos por archivo.
- Auditoria.
- Kardex.
- Modulos de documentos, expedientes, TRD, archivos, FUID, prestamos, transferencias, recepcion, RRHH, tareas, notificaciones, busqueda y plataforma.

Frontend actual:

- Se reemplazo el frontend Next anterior por el frontend visual ubicado originalmente en:
  `C:\Users\Nicolas\OneDrive - SENA\Documentos\Ambar\nuevo front ambar`
- Ahora el frontend es una SPA estatica servida por `frontend/server.js`.
- Usa React UMD + Babel local vendorizado.
- El servidor frontend proxyfica `/api/v1/*` hacia el API gateway con `API_PROXY_TARGET`.
- En staging, el frontend vive en `10.10.10.242:3000`.
- El API gateway vive en `10.10.10.240`.
- La infraestructura de datos vive en `10.10.10.241`.

## 3. Estado de despliegue conocido

Servidores:

- `10.10.10.240`: API + gateway.
- `10.10.10.241`: MySQL, Redis, RabbitMQ, MinIO, OpenSearch.
- `10.10.10.242`: frontend/landing.

Credenciales admin conocidas:

- Email: `<admin-email-del-ambiente>`
- Password: `<password-rotado-del-ambiente>`

El backend respondia correctamente:

```bash
curl http://10.10.10.240/health
curl http://10.10.10.240/health/ready
curl -X POST http://10.10.10.240/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin-email-del-ambiente>","password":"<password-rotado-del-ambiente>"}'
```

El nuevo frontend debe probarse con:

```bash
curl -I http://10.10.10.242:3000/login
curl -I http://10.10.10.242:3000/empleo
curl -i -X POST http://10.10.10.242:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin-email-del-ambiente>","password":"<password-rotado-del-ambiente>"}'
```

## 4. Que se hizo hasta ahora en esta etapa

Se sustituyo el frontend anterior por el nuevo diseño:

- Se eliminaron archivos Next del frontend anterior.
- Se copiaron las pantallas del nuevo frontend.
- Se agrego `frontend/server.js`.
- Se agrego `frontend/Dockerfile`.
- Se agrego `frontend/.dockerignore`.
- Se agrego `frontend/js/api.js` como puente API.
- Se ajusto `frontend/index.html`.
- Se agregaron scripts:
  - `npm run lint`
  - `npm run test`
  - `npm run build`

Se corrigieron problemas importantes:

- Error Docker por archivo con espacio:
  - `COPY "Mapa de Pantallas.html" ./` fallaba.
  - Se cambio a `COPY ["Mapa de Pantallas.html", "./"]`.
- Pantalla blanca por dependencia CDN:
  - React, ReactDOM y Babel se estaban cargando desde `unpkg.com`.
  - Se movieron a dependencias locales.
  - El build ahora copia:
    - `vendor/react.production.min.js`
    - `vendor/react-dom.production.min.js`
    - `vendor/babel.min.js`
- Pantalla blanca por rol desconocido:
  - El frontend hacia `ROLES[user.role].name`.
  - Si el backend devolvia un rol no mapeado, el shell explotaba.
  - Se agrego normalizacion/fallback:
    - `normalizeRoleKey`
    - `roleMeta`
  - Se ajustaron:
    - `frontend/js/api.js`
    - `frontend/js/app.jsx`
    - `frontend/js/data.js`
    - `frontend/js/shell.jsx`
    - `frontend/js/modules/security.jsx`

## 5. Errores cometidos durante la sesion

Estos son importantes para no repetirlos:

1. Se reemplazo el frontend visual, pero inicialmente quedaron datos quemados del prototipo.
   - Ejemplo: dashboard con `48.230` documentos, muchos usuarios demo, empleados demo, documentos demo.
   - Esto no refleja la base de datos real.
   - El usuario tiene razon: eso debe corregirse.

2. Se intento resolver primero la apariencia, pero no se termino la conexion completa de todas las pantallas a las APIs reales.
   - Algunas pantallas ya llaman API, pero conservan fallback visual.
   - Eso puede confundir en produccion.

3. Se dejo un selector de cambio de usuario demo en el menu inferior.
   - Muestra usuarios como usuarios demo del frontend anterior
   - Eso no debe estar en produccion.
   - Debe eliminarse o reemplazarse por informacion real del usuario autenticado.

4. El frontend dependio inicialmente de CDN externo para React/Babel.
   - Esto causo pantalla blanca o riesgo de pantalla blanca.
   - Ya fue corregido con vendor local.

5. El frontend asumio roles exactos del prototipo.
   - El backend tiene roles propios.
   - Esto causo `Cannot read properties of undefined (reading 'name')`.
   - Ya fue corregido con fallback, pero conviene alinear definitivamente roles frontend/backend.

6. Se validaron rutas y build, pero no se completo una auditoria exhaustiva pantalla por pantalla despues del cambio total de frontend.

7. En algunos modulos se conservaron textos o metricas de maqueta.
   - Deben desaparecer en favor de valores de backend o estados vacios reales.

## 6. Estado actual real

Repo local al momento de crear este handoff:

- `git status --short` estaba limpio antes de crear este archivo.
- Este archivo es el cambio nuevo.

Frontend:

- Renderiza con nuevo look.
- Login conectado al backend.
- Proxy API por `/api/v1`.
- Portal `/empleo` existe y es publico.
- Build local funciono en la ultima etapa.
- Falta eliminar datos demo/fallback para que todo venga de backend.

Backend:

- Tiene muchas APIs ya implementadas.
- No se debe reconstruir.
- Hay que usarlo como fuente de verdad.
- La tarea pendiente es comparar cada pantalla del nuevo frontend contra endpoints existentes y conectar datos reales.

## 7. Peticion actual del usuario antes del handoff

El usuario reporto:

- El frontend sigue mostrando datos precargados del prototipo.
- En la BD no hay tantos usuarios ni tantos documentos.
- El dashboard muestra numeros falsos.
- El menu de usuario muestra usuarios demo.
- Quiere que todas las pantallas consuman APIs reales del backend.
- Quiere que el frontend sea mas grande, legible y extremadamente responsivo.

Nueva prioridad:

1. Quitar datos quemados del nuevo frontend.
2. Conectar todas las pantallas posibles a APIs reales.
3. Donde no haya datos, mostrar empty states reales, no datos ficticios.
4. Eliminar cambio de usuario demo.
5. Hacer la UI mas legible y responsive.

## 8. APIs backend relevantes a usar

Rutas detectadas previamente:

Autenticacion:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Usuarios / seguridad:

- `GET /api/v1/users`
- `POST /api/v1/users`
- `GET /api/v1/users/roles`
- `POST /api/v1/users/roles`
- `GET /api/v1/users/permissions`

Documentos:

- `GET /api/v1/documents`
- `POST /api/v1/documents`
- `GET /api/v1/documents/{document_id}`
- `PATCH /api/v1/documents/{document_id}`
- `POST /api/v1/documents/{document_id}/files`
- `GET /api/v1/documents/{document_id}/files`
- `GET /api/v1/documents/types`
- `GET /api/v1/documents/types/library`

Archivos / expedientes / ubicacion / prestamos / FUID:

- `GET /api/v1/archives`
- `GET /api/v1/archives/dashboard`
- `GET /api/v1/archives/expedients`
- `POST /api/v1/archives/expedients`
- `GET /api/v1/archives/folders`
- `GET /api/v1/archives/shelves`
- `GET /api/v1/archives/boxes`
- `GET /api/v1/archives/locations/tree`
- `GET /api/v1/archives/locations/summary`
- `GET /api/v1/archives/locations/unassigned`
- `GET /api/v1/archives/kardex`
- `GET /api/v1/archives/loans`
- `GET /api/v1/archives/loans/summary`
- `GET /api/v1/archives/fuid`

TRD:

- `GET /api/v1/trd/editor`
- `GET /api/v1/trd/series`
- `GET /api/v1/trd/dependencies`
- `GET /api/v1/trd/subseries`
- `POST /api/v1/trd/import/simulate`
- `POST /api/v1/trd/import/apply`
- `GET /api/v1/trd/export`

Transferencias:

- `GET /api/v1/transfer-batches`
- `POST /api/v1/transfer-batches`
- `GET /api/v1/transfer-batches/{batch_id}/items`
- `GET /api/v1/transfer-batches/{batch_id}/reception/items`
- `GET /api/v1/transfer-batches/{batch_id}/reception/fuid-comparison`

RRHH:

- `GET /api/v1/hr/departments`
- `GET /api/v1/hr/departments/tree`
- `GET /api/v1/hr/positions`
- `GET /api/v1/hr/vacancies`
- `GET /api/v1/hr/candidates`
- `GET /api/v1/hr/employees`
- `GET /api/v1/hr/contracts/expiring`
- `GET /api/v1/hr/sst/exams`
- `GET /api/v1/hr/sst/alerts`
- `GET /api/v1/hr/public/vacancies`
- `POST /api/v1/hr/public/vacancies/{vacancy_id}/apply`

Auditoria:

- `GET /api/v1/audit`
- `GET /api/v1/audit/summary`
- `GET /api/v1/audit/security-events`
- `GET /api/v1/audit/export`

Dashboard / analytics:

- `GET /api/v1/analytics/dashboard`
- `GET /api/v1/analytics/advanced`

Notificaciones / tareas:

- `GET /api/v1/notifications`
- `GET /api/v1/notifications/summary`
- `GET /api/v1/workflows/tasks`
- `GET /api/v1/workflows/tasks/summary`

Busqueda:

- `POST /api/v1/search/documents`

## 9. Proximo plan recomendado

### Paso 1 - quitar demo de usuario

Archivos:

- `frontend/js/shell.jsx`
- `frontend/js/data.js`

Acciones:

- Eliminar seccion "Cambiar de usuario (demo)".
- No mostrar `USERS` demo.
- Mostrar solo usuario autenticado real.
- Si se necesita administrar usuarios, usar pantalla Seguridad con `GET /api/v1/users`.

### Paso 2 - crear capa de datos sin fallback falso

Archivo:

- `frontend/js/api.js`

Acciones:

- Agregar helpers por modulo:
  - `listDocuments`
  - `listExpedients`
  - `listArchives`
  - `listLoans`
  - `listTransfers`
  - `listEmployees`
  - `listCandidates`
  - `listAudit`
  - `dashboardSummary`
- Cambiar `useLiveData` para aceptar fallback vacio `[]`, no datos demo.
- Los datos demo pueden quedar solo para desarrollo si existe una bandera `AMBAR_DEMO_MODE=true`, pero por defecto debe ser `false`.

### Paso 3 - dashboard real

Archivo:

- `frontend/js/modules/dashboard.jsx`

Acciones:

- Quitar numeros quemados:
  - `48.230`
  - `39.817`
  - `412`
  - `3.164`
  - `248`
- Usar:
  - `/analytics/dashboard`
  - `/analytics/advanced`
  - `/archives/dashboard`
  - `/archives/loans/summary`
  - `/workflows/tasks/summary`
  - `/notifications/summary`
- Si el backend no devuelve un dato, mostrar `0` o `Sin datos`, no maqueta.

### Paso 4 - documentos reales

Archivo:

- `frontend/js/modules/documents.jsx`

Acciones:

- Quitar `window.DOCS` como fuente principal.
- Tabla debe venir de `GET /api/v1/documents`.
- Si no hay documentos, mostrar empty state:
  "No hay documentos registrados".

### Paso 5 - expedientes reales

Archivo:

- `frontend/js/modules/expedients.jsx`

Acciones:

- Usar `GET /api/v1/archives/expedients`.
- KPIs calculados desde respuesta real.
- No mostrar Juan Perez, Mariana Ruiz, etc. si no estan en BD.

### Paso 6 - RRHH real

Archivos:

- `frontend/js/modules/hr.jsx`
- `frontend/js/modules/recruitment.jsx`
- `frontend/js/modules/portal.jsx`

Acciones:

- Empleados desde `/hr/employees`.
- Cargos desde `/hr/positions`.
- Dependencias desde `/hr/departments`.
- Vacantes desde `/hr/vacancies`.
- Portal empleo desde `/hr/public/vacancies`.
- No mostrar empleados o candidatos ficticios.

### Paso 7 - TRD real

Archivo:

- `frontend/js/modules/trd.jsx`

Acciones:

- Editor desde `/trd/editor`.
- Dependencias desde `/trd/dependencies`.
- Series desde `/trd/series`.
- Subseries desde `/trd/subseries`.
- Empty state si no existe TRD cargada.

### Paso 8 - custodia real

Archivos:

- `frontend/js/modules/archive.jsx`
- `frontend/js/modules/transfers.jsx`
- `frontend/js/modules/loans.jsx`

Acciones:

- Archivo fisico desde `/archives`, `/archives/boxes`, `/archives/locations/tree`.
- Transferencias desde `/transfer-batches`.
- Prestamos desde `/archives/loans`.
- No mostrar cajas o transferencias demo.

### Paso 9 - responsividad y tamano

Archivos:

- `frontend/styles/tokens.css`
- `frontend/styles/base.css`
- `frontend/styles/shell.css`
- `frontend/styles/modules.css`
- `frontend/styles/components.css`

Acciones:

- Subir escala base de fuentes.
- Revisar `--fs-xs`, `--fs-sm`, `--fs-md`, `--fs-lg`.
- Aumentar densidad legible sin hacer tarjetas gigantes.
- En pantallas grandes, usar ancho util mayor.
- En mobile/tablet:
  - sidebar colapsable real;
  - grids a 1 columna;
  - tablas con scroll horizontal;
  - drawers full width.

## 10. Comandos habituales

Local:

```powershell
cd "C:\Users\Nicolas\OneDrive - SENA\Documentos\Ambar"

npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
```

Subir cambios:

```powershell
cd "C:\Users\Nicolas\OneDrive - SENA\Documentos\Ambar"

git status --short
git add -A frontend docs
git commit -m "fix: connect new frontend to real backend data"
git push origin main
```

Desplegar frontend:

```bash
cd /opt/ambar
git pull origin main

cd /opt/ambar/infra/staging

docker compose --env-file .env.web -f web.compose.yml build --no-cache web
docker compose --env-file .env.web -f web.compose.yml up -d web
docker compose --env-file .env.web -f web.compose.yml ps

curl -I http://10.10.10.242:3000/login
curl -I http://10.10.10.242:3000/empleo
curl -i -X POST http://10.10.10.242:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin-email-del-ambiente>","password":"<password-rotado-del-ambiente>"}'
```

Ver logs:

```bash
docker logs staging-web-1 --tail=100
```

## 11. Criterio para continuar bien

No volver a aceptar datos demo como "funcionalidad".

Regla para la siguiente sesion:

- Si el backend tiene endpoint: usarlo.
- Si el backend no tiene datos: mostrar empty state.
- Si el backend no tiene endpoint: documentar brecha o crear endpoint minimo.
- No mostrar usuarios, documentos, expedientes, cajas, prestamos o metricas que no existan en la BD.

La aplicacion debe vender confianza. Los datos falsos rompen esa confianza.

