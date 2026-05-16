# Staging Deployment Guide

Esta guia documenta el despliegue multi-servidor probado para Ambar en la red `10.10.10.0/24`.

## Topologia

- `10.10.10.241`: infraestructura compartida: MySQL, Redis, RabbitMQ, MinIO y OpenSearch.
- `10.10.10.240`: API FastAPI, migraciones Alembic y gateway Nginx.
- `10.10.10.242`: frontend Next.js.

La URL recomendada para pruebas integradas es:

```text
http://10.10.10.240
```

## 1. Servidor 10.10.10.241 - Infraestructura

```bash
cd /opt/Ambar/infra/staging
cp .env.infra.example .env.infra
nano .env.infra
```

Generar secretos:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 32
```

OpenSearch requiere `OPENSEARCH_INITIAL_ADMIN_PASSWORD` desde versiones recientes, aunque se desactive el plugin de seguridad para staging.

Preparar kernel para OpenSearch:

```bash
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-opensearch.conf
sudo sysctl --system
sysctl vm.max_map_count
```

Levantar:

```bash
docker compose --env-file .env.infra -f infra.compose.yml config
docker compose --env-file .env.infra -f infra.compose.yml up -d
docker compose --env-file .env.infra -f infra.compose.yml ps
```

Validar:

```bash
curl http://10.10.10.241:9200
```

## 2. Servidor 10.10.10.240 - API y Gateway

```bash
cd /opt/Ambar/infra/staging
cp .env.api.example .env.api
nano .env.api
```

`FRONTEND_ORIGINS` puede escribirse como JSON o separado por comas. El ejemplo recomendado es JSON:

```env
FRONTEND_ORIGINS=["http://10.10.10.240","http://10.10.10.242:3000"]
```

Validar conectividad hacia MySQL:

```bash
docker run --rm --network host -e MYSQL_PWD='TU_PASSWORD_MYSQL' mysql:8.4 \
  mysqladmin ping -h 10.10.10.241 -P 3306 -u ambar
```

Debe responder:

```text
mysqld is alive
```

Levantar:

```bash
docker compose --env-file .env.api -f api.compose.yml config
docker compose --env-file .env.api -f api.compose.yml up -d --build
docker compose --env-file .env.api -f api.compose.yml ps
```

Validar API directa:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/ready
```

Validar gateway:

```bash
curl http://10.10.10.240/health
curl http://10.10.10.240/health/ready
curl http://10.10.10.240/docs
```

## 3. Servidor 10.10.10.242 - Frontend

```bash
cd /opt/Ambar/infra/staging
docker compose -f web.compose.yml config
docker compose -f web.compose.yml up -d --build
docker compose -f web.compose.yml ps
curl http://10.10.10.242:3000/login
```

## Decisiones aplicadas por errores encontrados

### OpenSearch reiniciaba

Error:

```text
No custom admin password found. Please provide OPENSEARCH_INITIAL_ADMIN_PASSWORD.
```

Solucion permanente:

- `.env.infra.example` incluye `OPENSEARCH_INITIAL_ADMIN_PASSWORD`.
- `infra.compose.yml` lo pasa al contenedor.

### FRONTEND_ORIGINS fallaba en Pydantic

Error:

```text
SettingsError: error parsing value for field "frontend_origins"
```

Solucion permanente:

- `Settings.frontend_origins` usa `NoDecode`.
- El validador acepta JSON y CSV.
- `.env.api.example` usa JSON.

### MySQL conectaba desde host pero no desde contenedor

Sintoma:

```text
Can't connect to MySQL server on '10.10.10.241' (timed out)
```

Solucion staging:

- `api.compose.yml` usa `network_mode: host` para `api-migrate`, `api` y `gateway`.

### Puerto 8000 ocupado

Sintoma:

```text
Bind for 0.0.0.0:8000 failed: port is already allocated
```

Solucion:

- `api.compose.yml` no publica `ports` para la API; con `network_mode: host` Gunicorn escucha directamente en `:8000`.
- Detener contenedores antiguos que usen `:8000` antes de levantar staging.

```bash
docker ps
sudo ss -lntp | grep ':8000'
```

### Gateway no resolvia `api:8000`

Error:

```text
host not found in upstream "api:8000"
```

Solucion:

- `gateway.conf` apunta a `127.0.0.1:8000`, porque el gateway usa red host.

### Seed duplicado con varios workers

Error:

```text
Duplicate entry '*' for key 'ps409_permissions.permission_key'
```

Solucion staging:

- `backend/Dockerfile` define `GUNICORN_WORKERS=1` por defecto.
- Se puede aumentar despues de desactivar `SEED_DEFAULT_DATA` o mover el seed a un job operacional controlado.

### Modulo reports faltante

Error:

```text
ModuleNotFoundError: No module named 'app.domains.reports.router'
```

Solucion:

- El modulo `backend/app/domains/reports/router.py` debe estar versionado en Git.
- Confirmar antes de construir:

```bash
ls -la backend/app/domains/reports
```

## Comandos utiles

Logs API:

```bash
docker compose --env-file .env.api -f api.compose.yml logs api --tail=120
```

Logs migracion:

```bash
docker compose --env-file .env.api -f api.compose.yml logs api-migrate --tail=120
```

Logs gateway:

```bash
docker compose --env-file .env.api -f api.compose.yml logs gateway --tail=120
```

Recrear API:

```bash
docker compose --env-file .env.api -f api.compose.yml down
docker compose --env-file .env.api -f api.compose.yml up -d --build
```