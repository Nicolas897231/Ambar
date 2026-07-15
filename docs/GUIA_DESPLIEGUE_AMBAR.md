# Guía de despliegue AMBAR

Esta guía explica cómo instalar AMBAR en tres escenarios reales:

1. Empresa con varios servidores, dominio y despliegue Docker.
2. Empresa con un solo servidor y despliegue Docker.
3. Instalación pequeña sin Docker en Windows Server, IIS o un equipo local.

También explica dónde configurar dominio, IP, secretos, entorno de producción, persistencia de base de datos, volúmenes y capacidad recomendada.

## 1. Arquitectura de AMBAR

AMBAR está compuesto por estos servicios:

| Servicio | Uso |
|---|---|
| Frontend web | Interfaz de usuario. Sirve la aplicación y puede hacer proxy hacia `/api/v1`. |
| API FastAPI | Backend principal. Maneja autenticación, documentos, TRD, expedientes, custodia, auditoría, préstamos, FUID, radicación y reportes. |
| Gateway Nginx | Entrada HTTP/HTTPS. Publica el dominio y enruta frontend, API, healthchecks y métricas. |
| MySQL 8.4 | Base de datos relacional principal. |
| Redis | Cache, rate limit y datos temporales. |
| RabbitMQ | Cola de eventos y procesos asíncronos. |
| MinIO | Repositorio de archivos digitales, evidencias y documentos. |
| OpenSearch | Búsqueda e indexación documental cuando está habilitado. |

Flujo recomendado en producción:

```text
Usuario
↓
https://ambar.empresa.com
↓
Nginx / Gateway
├── /                → Frontend
├── /api/v1          → API FastAPI
├── /health          → API healthcheck
└── /metrics         → API métricas protegidas
↓
MySQL / Redis / RabbitMQ / MinIO / OpenSearch
```

La recomendación comercial y técnica es usar un solo dominio para la aplicación:

```text
https://ambar.empresa.com
```

La API debe consumirse por ruta relativa:

```text
/api/v1
```

Así evitamos depender de IPs duras en el navegador y se facilita mover AMBAR entre empresas, dominios o servidores.

## 2. Archivos importantes de configuración

| Archivo | Uso |
|---|---|
| `infra/staging/infra.compose.yml` | Levanta MySQL, Redis, RabbitMQ, MinIO y OpenSearch. |
| `infra/staging/api.compose.yml` | Levanta migraciones Alembic, API FastAPI y gateway Nginx. |
| `infra/staging/web.compose.yml` | Levanta el frontend. |
| `infra/staging/gateway.conf` | Configuración Nginx del gateway. Aquí se cambia dominio y rutas proxy. |
| `infra/staging/.env.infra.example` | Plantilla de secretos para infraestructura. |
| `infra/staging/.env.api.example` | Plantilla de secretos y conexión del backend. |
| `frontend/.env.example` | Plantilla mínima del frontend. |
| `.env.example` | Plantilla local general para desarrollo o compose todo en uno. |
| `backend/app/core/config.py` | Configuración real que lee variables de entorno y valida seguridad en producción. |

Los archivos `.env.infra`, `.env.api`, `.env.web` y `.env` reales no deben subirse a Git.

## 3. Variables críticas

### Variables backend

Estas viven normalmente en `infra/staging/.env.api`:

```env
ENVIRONMENT=production
PROJECT_NAME=AMBAR
API_BASE_URL=https://ambar.empresa.com
FRONTEND_ORIGINS=["https://ambar.empresa.com"]
ALLOWED_HOSTS=ambar.empresa.com

DATABASE_URL=mysql+pymysql://ambar:CLAVE_MYSQL@IP_DB:3306/ambar
READ_DATABASE_URL=mysql+pymysql://ambar:CLAVE_MYSQL@IP_DB:3306/ambar

JWT_SECRET_KEY=SECRETO_ALEATORIO_64_CHARS
INTERNAL_SERVICE_SECRET=SECRETO_INTERNO_64_CHARS
WEBHOOK_SECRET_ENCRYPTION_KEY=SECRETO_WEBHOOK_64_CHARS

REDIS_URL=redis://:CLAVE_REDIS@IP_REDIS:6379/0
RABBITMQ_URL=amqp://ambar:CLAVE_RABBIT@IP_RABBIT:5672/

MINIO_ENDPOINT=IP_MINIO:9000
MINIO_ACCESS_KEY=ambar
MINIO_SECRET_KEY=CLAVE_MINIO_SEGURA
MINIO_BUCKET=ambar-documents

OPENSEARCH_URL=http://IP_OPENSEARCH:9200
OPENSEARCH_INDEX=ambar-documents

MAX_UPLOAD_MB=25
RATE_LIMIT_PER_MINUTE=120
CACHE_DEFAULT_TTL_SECONDS=300

AUTO_CREATE_SCHEMA=false
SEED_DEFAULT_DATA=false
GUNICORN_WORKERS=2
```

### Variables infraestructura

Estas viven normalmente en `infra/staging/.env.infra`:

```env
MYSQL_DATABASE=ambar
MYSQL_USER=ambar
MYSQL_PASSWORD=CLAVE_MYSQL_SEGURA
MYSQL_ROOT_PASSWORD=CLAVE_ROOT_MYSQL_SEGURA

REDIS_PASSWORD=CLAVE_REDIS_SEGURA

RABBITMQ_USER=ambar
RABBITMQ_PASSWORD=CLAVE_RABBIT_SEGURA

MINIO_ROOT_USER=ambar
MINIO_ROOT_PASSWORD=CLAVE_MINIO_SEGURA

OPENSEARCH_INITIAL_ADMIN_PASSWORD=CLAVE_OPENSEARCH_SEGURA
```

### Variables frontend

Estas viven normalmente en `infra/staging/.env.web`:

```env
NEXT_PUBLIC_API_URL=/api/v1
API_PROXY_TARGET=http://IP_API:8000
```

Si el frontend y la API están detrás del mismo gateway, el navegador debe seguir usando `/api/v1`.

## 4. Generación de secretos

En Linux:

```bash
openssl rand -hex 32
openssl rand -base64 48
```

En PowerShell:

```powershell
[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Reglas:

- No reutilizar la misma clave para MySQL, Redis, RabbitMQ, MinIO y JWT.
- No enviar secretos por WhatsApp, correo o chats.
- No subir `.env.*` reales al repositorio.
- En producción, dejar los env con permisos restringidos:

```bash
sudo chown root:root .env.api .env.infra .env.web
sudo chmod 600 .env.api .env.infra .env.web
```

## 5. Cómo pasar de desarrollo o staging a producción

Cambiar en `infra/staging/.env.api`:

```env
ENVIRONMENT=production
AUTO_CREATE_SCHEMA=false
SEED_DEFAULT_DATA=false
FRONTEND_ORIGINS=["https://ambar.empresa.com"]
ALLOWED_HOSTS=ambar.empresa.com
API_BASE_URL=https://ambar.empresa.com
```

AMBAR valida esto al arrancar. Si `ENVIRONMENT=production` y detecta secretos débiles, wildcard, seed automático o creación automática de esquema, la API no debe arrancar.

En frontend, el contenedor ya usa:

```env
NODE_ENV=production
```

Para que en pantalla no aparezca staging/desarrollo, la variable que manda es:

```env
ENVIRONMENT=production
```

en el backend.

## 6. Escenario 1: empresa con dominio y varios servidores Docker

### 6.1 Topología recomendada

Ejemplo con tres servidores:

| Servidor | Rol | Ejemplo |
|---|---|---|
| Servidor infraestructura | MySQL, Redis, RabbitMQ, MinIO, OpenSearch | `10.10.10.241` |
| Servidor aplicación | API FastAPI, migraciones, gateway Nginx | `10.10.10.240` |
| Servidor frontend | Frontend AMBAR | `10.10.10.242` |

Dominio recomendado:

```text
ambar.empresa.com → IP pública o privada del gateway
```

El DNS debe apuntar al servidor gateway o al balanceador que esté delante del gateway.

### 6.2 Capacidad recomendada

Para 25 a 75 usuarios internos:

| Servidor | CPU | RAM | Disco |
|---|---:|---:|---:|
| Infraestructura | 8 vCPU | 32 GB | 500 GB SSD/NVMe mínimo |
| API/Gateway | 4 vCPU | 8 a 16 GB | 100 GB SSD |
| Frontend | 2 vCPU | 4 a 8 GB | 50 GB SSD |

Para 100 a 300 usuarios internos:

| Servidor | CPU | RAM | Disco |
|---|---:|---:|---:|
| Infraestructura | 16 vCPU | 64 GB | 1 a 2 TB SSD/NVMe |
| API/Gateway | 8 vCPU | 16 a 32 GB | 150 GB SSD |
| Frontend | 4 vCPU | 8 GB | 80 GB SSD |

Notas:

- MinIO crece según documentos cargados. Separar su almacenamiento si la empresa maneja muchos PDF, imágenes o videos.
- MySQL debe estar en SSD/NVMe.
- OpenSearch consume memoria. Para producción real ajustar `OPENSEARCH_JAVA_OPTS` según RAM disponible.
- Redis debe tener persistencia AOF y monitoreo.
- RabbitMQ debe tener volúmenes persistentes.

### 6.3 Servidor infraestructura

Entrar al servidor infraestructura:

```bash
cd /opt/Ambar/infra/staging
cp .env.infra.example .env.infra
nano .env.infra
```

Editar claves reales en `.env.infra`.

Preparar OpenSearch:

```bash
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-opensearch.conf
sudo sysctl --system
```

Levantar infraestructura:

```bash
docker compose --env-file .env.infra -f infra.compose.yml config
docker compose --env-file .env.infra -f infra.compose.yml pull
docker compose --env-file .env.infra -f infra.compose.yml up -d
docker compose --env-file .env.infra -f infra.compose.yml ps
```

Validar:

```bash
docker compose --env-file .env.infra -f infra.compose.yml logs mysql --tail=80
docker compose --env-file .env.infra -f infra.compose.yml logs redis --tail=80
curl http://IP_INFRA:9200
curl http://IP_INFRA:9000/minio/health/live
```

### 6.4 Servidor API y gateway

Entrar al servidor API:

```bash
cd /opt/Ambar/infra/staging
cp .env.api.example .env.api
nano .env.api
```

Ejemplo para dominio:

```env
ENVIRONMENT=production
API_BASE_URL=https://ambar.empresa.com
FRONTEND_ORIGINS=["https://ambar.empresa.com"]
ALLOWED_HOSTS=ambar.empresa.com

DATABASE_URL=mysql+pymysql://ambar:CLAVE_MYSQL@10.10.10.241:3306/ambar
READ_DATABASE_URL=mysql+pymysql://ambar:CLAVE_MYSQL@10.10.10.241:3306/ambar
REDIS_URL=redis://:CLAVE_REDIS@10.10.10.241:6379/0
RABBITMQ_URL=amqp://ambar:CLAVE_RABBIT@10.10.10.241:5672/
MINIO_ENDPOINT=10.10.10.241:9000
OPENSEARCH_URL=http://10.10.10.241:9200
```

Editar `infra/staging/gateway.conf`:

```nginx
server_name ambar.empresa.com;
```

Y en la ubicación `/` apuntar al frontend:

```nginx
location / {
  proxy_pass http://10.10.10.242:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Levantar API y gateway:

```bash
docker compose --env-file .env.api -f api.compose.yml config
docker compose --env-file .env.api -f api.compose.yml up -d --build
docker compose --env-file .env.api -f api.compose.yml ps
```

Validar:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/ready
curl http://IP_API/health
curl http://IP_API/health/ready
```

### 6.5 Servidor frontend

Entrar al servidor frontend:

```bash
cd /opt/Ambar/infra/staging
```

Crear `.env.web`:

```env
NEXT_PUBLIC_API_URL=/api/v1
API_PROXY_TARGET=http://10.10.10.240:8000
```

Levantar:

```bash
docker compose --env-file .env.web -f web.compose.yml config
docker compose --env-file .env.web -f web.compose.yml up -d --build
docker compose --env-file .env.web -f web.compose.yml ps
curl http://10.10.10.242:3000/login
```

### 6.6 Certificado HTTPS

La recomendación es poner TLS en el gateway o en un balanceador delante.

Opciones:

- Nginx + Certbot.
- Proxy corporativo.
- Balanceador de la empresa.
- Cloudflare Tunnel o Cloudflare Zero Trust.

Sin HTTPS, el navegador puede mostrar advertencias como:

```text
Cross-Origin-Opener-Policy header has been ignored
```

Eso no es un bug funcional de AMBAR. Significa que el navegador no considera confiable un origen HTTP por IP. En producción debe usarse HTTPS.

### 6.7 Puertos recomendados

Exponer hacia usuarios:

| Puerto | Servicio | Público |
|---:|---|---|
| 80 | HTTP redirección a HTTPS | Sí, opcional |
| 443 | HTTPS AMBAR | Sí |

No exponer públicamente:

| Puerto | Servicio |
|---:|---|
| 3306 | MySQL |
| 6379 | Redis |
| 5672 | RabbitMQ |
| 15672 | RabbitMQ console |
| 9000 | MinIO API |
| 9001 | MinIO console |
| 9200 | OpenSearch |
| 8000 | API directa |
| 3000 | Frontend directo |

Estos puertos deben quedar en red interna o firewall corporativo.

## 7. Persistencia de datos y volúmenes

### 7.1 Estado actual

Actualmente los compose usan named volumes:

```yaml
volumes:
  mysql_data:
  redis_data:
  rabbitmq_data:
  opensearch_data:
  minio_data:
```

Docker los guarda normalmente en:

```text
/var/lib/docker/volumes/
```

Para ver la ruta real:

```bash
docker volume ls
docker volume inspect staging_mysql_data
docker volume inspect staging_minio_data
```

### 7.2 Recomendación productiva

En empresa es mejor usar rutas explícitas en disco, por ejemplo:

```text
/data/ambar/mysql
/data/ambar/redis
/data/ambar/rabbitmq
/data/ambar/opensearch
/data/ambar/minio
/backups/ambar
```

Crear carpetas:

```bash
sudo mkdir -p /data/ambar/{mysql,redis,rabbitmq,opensearch,minio}
sudo mkdir -p /backups/ambar
```

Cambiar en `infra/staging/infra.compose.yml`:

```yaml
mysql:
  volumes:
    - /data/ambar/mysql:/var/lib/mysql

redis:
  volumes:
    - /data/ambar/redis:/data

rabbitmq:
  volumes:
    - /data/ambar/rabbitmq:/var/lib/rabbitmq

opensearch:
  volumes:
    - /data/ambar/opensearch:/usr/share/opensearch/data

minio:
  volumes:
    - /data/ambar/minio:/data
```

Luego se puede eliminar el bloque final de named volumes o dejarlo sin uso.

### 7.3 Por qué esto importa

Si se dañan o eliminan los contenedores, la información sigue en:

```text
/data/ambar/
```

Entonces se puede reconstruir con:

```bash
docker compose --env-file .env.infra -f infra.compose.yml up -d --build
```

sin perder la base ni los archivos, siempre que no se borren las carpetas de datos.

## 8. Backups mínimos

### MySQL

```bash
mkdir -p /backups/ambar/mysql
docker exec staging-mysql-1 mysqldump -u root -p ambar > /backups/ambar/mysql/ambar_$(date +%F_%H%M).sql
```

Mejor en producción:

- Backups diarios.
- Binlogs habilitados.
- Prueba mensual de restore.
- Copia fuera del servidor.

### MinIO

Usar `mc mirror` desde otra máquina o un job programado:

```bash
mc alias set ambar http://IP_MINIO:9000 ambar CLAVE_MINIO
mc mirror ambar/ambar-documents /backups/ambar/minio/ambar-documents
```

### Redis/RabbitMQ/OpenSearch

- Redis: AOF ya está activo en compose staging.
- RabbitMQ: volumen persistente y, si crece, políticas de colas durables.
- OpenSearch: snapshots o reindexación desde MySQL si aplica.

## 9. Escenario 2: un solo servidor con Docker

Este escenario sirve para una empresa pequeña o mediana que quiere todo en una sola máquina.

### 9.1 Capacidad recomendada

Para 5 a 25 usuarios:

| Recurso | Recomendado |
|---|---:|
| CPU | 8 vCPU |
| RAM | 32 GB |
| Disco | 500 GB SSD |

Mínimo aceptable para piloto:

| Recurso | Mínimo |
|---|---:|
| CPU | 4 vCPU |
| RAM | 16 GB |
| Disco | 250 GB SSD |

Si habrá muchos documentos digitales, el disco debe crecer según volumen documental.

### 9.2 Forma recomendada

Usar `infra/docker/docker-compose.yml` para laboratorio o demo local.

Para producción en un solo servidor, se recomienda adaptar los compose de `infra/staging` porque ya separan mejor infraestructura, API y web.

En un solo servidor:

- MySQL queda en `127.0.0.1` o en nombre de servicio Docker.
- Redis queda en `127.0.0.1`.
- RabbitMQ queda en `127.0.0.1`.
- MinIO queda en `127.0.0.1`.
- OpenSearch queda en `127.0.0.1`.
- Gateway publica el dominio.
- Frontend queda detrás del gateway.

### 9.3 Configurar `.env.api`

Ejemplo:

```env
ENVIRONMENT=production
API_BASE_URL=https://ambar.empresa.com
FRONTEND_ORIGINS=["https://ambar.empresa.com"]
ALLOWED_HOSTS=ambar.empresa.com

DATABASE_URL=mysql+pymysql://ambar:CLAVE_MYSQL@127.0.0.1:3306/ambar
READ_DATABASE_URL=mysql+pymysql://ambar:CLAVE_MYSQL@127.0.0.1:3306/ambar
REDIS_URL=redis://:CLAVE_REDIS@127.0.0.1:6379/0
RABBITMQ_URL=amqp://ambar:CLAVE_RABBIT@127.0.0.1:5672/
MINIO_ENDPOINT=127.0.0.1:9000
OPENSEARCH_URL=http://127.0.0.1:9200
```

### 9.4 Configurar frontend

Crear `infra/staging/.env.web`:

```env
NEXT_PUBLIC_API_URL=/api/v1
API_PROXY_TARGET=http://127.0.0.1:8000
```

### 9.5 Configurar gateway

Editar `infra/staging/gateway.conf`:

```nginx
server_name ambar.empresa.com;
```

Cambiar proxy del frontend a localhost:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 9.6 Levantar en un solo servidor

```bash
cd /opt/Ambar/infra/staging

docker compose --env-file .env.infra -f infra.compose.yml up -d
docker compose --env-file .env.api -f api.compose.yml up -d --build
docker compose --env-file .env.web -f web.compose.yml up -d --build

docker compose --env-file .env.infra -f infra.compose.yml ps
docker compose --env-file .env.api -f api.compose.yml ps
docker compose --env-file .env.web -f web.compose.yml ps
```

Validar:

```bash
curl http://localhost:8000/health
curl http://localhost/health
curl http://localhost:3000/login
```

### 9.7 Dominio en un solo servidor

DNS:

```text
ambar.empresa.com → IP del servidor único
```

Firewall:

- Abrir 80 y 443 hacia usuarios.
- Cerrar 3306, 6379, 5672, 9000, 9001, 9200, 8000 y 3000 a internet.

## 10. Escenario 3: instalación sin Docker en Windows Server o equipo local

Este escenario es para una empresa pequeña, papelería, archivo pequeño o instalación interna de baja concurrencia.

### 10.1 Capacidad recomendada

Mínimo para una persona o uso pequeño:

| Recurso | Mínimo |
|---|---:|
| CPU | 4 núcleos |
| RAM | 16 GB |
| Disco | 250 GB SSD |

Muy pequeño o demo:

| Recurso | Mínimo de laboratorio |
|---|---:|
| CPU | 2 núcleos |
| RAM | 8 GB |
| Disco | 120 GB SSD |

Recomendación seria:

- 16 GB RAM.
- SSD.
- Backups diarios.
- No usar el equipo del usuario como servidor si se apaga con frecuencia.

### 10.2 Software a instalar

Instalar:

- Python 3.12.
- Node.js 22 o 24.
- Git.
- MySQL Server 8.4.
- Redis compatible para Windows o Redis en WSL.
- Erlang + RabbitMQ.
- MinIO para Windows.
- OpenSearch opcional si se quiere búsqueda avanzada.
- IIS con URL Rewrite y Application Request Routing, o Apache/Nginx para Windows.

Para una tienda pequeña se puede iniciar sin OpenSearch si el backend queda con `OPENSEARCH_URL` vacío o no configurado. La búsqueda avanzada será más limitada.

### 10.3 Preparar base de datos MySQL

Entrar a MySQL:

```sql
CREATE DATABASE ambar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ambar'@'localhost' IDENTIFIED BY 'CLAVE_SEGURA';
GRANT ALL PRIVILEGES ON ambar.* TO 'ambar'@'localhost';
FLUSH PRIVILEGES;
```

La ruta de datos de MySQL en Windows suele estar en:

```text
C:\ProgramData\MySQL\MySQL Server 8.4\Data
```

Para producción pequeña, documentar y respaldar esa carpeta o usar backups `mysqldump`.

### 10.4 Preparar carpetas persistentes

Crear:

```text
D:\AmbarData\minio
D:\AmbarData\redis
D:\AmbarData\rabbitmq
D:\AmbarBackups
D:\AmbarLogs
```

MinIO debe usar:

```powershell
minio.exe server D:\AmbarData\minio --console-address ":9001"
```

### 10.5 Configurar backend

Crear archivo:

```text
C:\Ambar\.env
```

Ejemplo sin dominio, por IP local:

```env
ENVIRONMENT=production
PROJECT_NAME=AMBAR
API_BASE_URL=http://192.168.1.50:8000
FRONTEND_ORIGINS=http://192.168.1.50:3000,http://localhost:3000
ALLOWED_HOSTS=192.168.1.50,localhost,127.0.0.1,NOMBRE-EQUIPO

DATABASE_URL=mysql+pymysql://ambar:CLAVE_SEGURA@127.0.0.1:3306/ambar
READ_DATABASE_URL=mysql+pymysql://ambar:CLAVE_SEGURA@127.0.0.1:3306/ambar
REDIS_URL=redis://127.0.0.1:6379/0
RABBITMQ_URL=amqp://ambar:CLAVE_RABBIT@127.0.0.1:5672/
MINIO_ENDPOINT=127.0.0.1:9000
MINIO_ACCESS_KEY=ambar
MINIO_SECRET_KEY=CLAVE_MINIO_SEGURA
MINIO_BUCKET=ambar-documents

JWT_SECRET_KEY=SECRETO_ALEATORIO_64_CHARS
INTERNAL_SERVICE_SECRET=SECRETO_INTERNO_64_CHARS
WEBHOOK_SECRET_ENCRYPTION_KEY=SECRETO_WEBHOOK_64_CHARS

AUTO_CREATE_SCHEMA=false
SEED_DEFAULT_DATA=false
RATE_LIMIT_PER_MINUTE=120
CACHE_DEFAULT_TTL_SECONDS=300
```

Si no hay HTTPS ni dominio, puede funcionar por:

```text
http://localhost:3000
http://IP_DEL_EQUIPO:3000
```

Pero para producción estricta se recomienda certificado TLS, aunque sea interno.

### 10.6 Instalar backend

```powershell
cd C:\Ambar\backend
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\pip install -e .
```

Ejecutar migraciones:

```powershell
.\.venv\Scripts\alembic upgrade head
```

Levantar API en Windows:

```powershell
.\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Nota: Gunicorn no es la mejor opción en Windows. Para instalación pequeña, usar Uvicorn como servicio.

### 10.7 Instalar frontend

```powershell
cd C:\Ambar\frontend
npm install
npm run build
$env:API_PROXY_TARGET="http://127.0.0.1:8000"
$env:PORT="3000"
npm start
```

Abrir:

```text
http://localhost:3000/login
```

o desde otro equipo:

```text
http://IP_DEL_SERVIDOR:3000/login
```

### 10.8 IIS o Apache como entrada

Si se usa IIS:

- Instalar URL Rewrite.
- Instalar Application Request Routing.
- Crear sitio `AMBAR`.
- Apuntar el sitio a `http://127.0.0.1:3000`.
- Habilitar proxy.
- Configurar certificado si hay dominio.

Regla mínima:

```text
https://ambar.empresa.local → http://127.0.0.1:3000
```

El frontend ya enruta `/api/v1` hacia `API_PROXY_TARGET`, por lo tanto el navegador puede seguir usando la misma URL.

### 10.9 Crear servicios Windows

Para que AMBAR arranque solo, usar NSSM o servicios Windows:

Servicios recomendados:

- `AmbarMinIO`
- `AmbarRedis`
- `AmbarRabbitMQ`
- `AmbarAPI`
- `AmbarWeb`

Ejemplo con NSSM para API:

```powershell
nssm install AmbarAPI
```

Configurar:

```text
Application: C:\Ambar\backend\.venv\Scripts\uvicorn.exe
Arguments: app.main:app --host 0.0.0.0 --port 8000
Startup directory: C:\Ambar\backend
Environment: variables del .env o archivo cargado por el proceso
```

## 11. Configuración por dominio, IP o alias

### Con dominio real

Backend:

```env
API_BASE_URL=https://ambar.empresa.com
FRONTEND_ORIGINS=["https://ambar.empresa.com"]
ALLOWED_HOSTS=ambar.empresa.com
```

Frontend:

```env
NEXT_PUBLIC_API_URL=/api/v1
API_PROXY_TARGET=http://127.0.0.1:8000
```

DNS:

```text
ambar.empresa.com → IP del gateway
```

### Con IP interna

Backend:

```env
API_BASE_URL=http://192.168.1.50:8000
FRONTEND_ORIGINS=http://192.168.1.50:3000
ALLOWED_HOSTS=192.168.1.50,localhost,127.0.0.1
```

Frontend:

```env
API_PROXY_TARGET=http://127.0.0.1:8000
```

### Con alias de equipo

Ejemplo:

```text
http://ambar-servidor:3000
```

Backend:

```env
FRONTEND_ORIGINS=http://ambar-servidor:3000
ALLOWED_HOSTS=ambar-servidor,localhost,127.0.0.1
```

## 12. Comandos de operación diaria

### Ver estado Docker

```bash
docker ps
docker compose --env-file .env.infra -f infra.compose.yml ps
docker compose --env-file .env.api -f api.compose.yml ps
docker compose --env-file .env.web -f web.compose.yml ps
```

### Ver logs

```bash
docker compose --env-file .env.api -f api.compose.yml logs api --tail=120
docker compose --env-file .env.api -f api.compose.yml logs gateway --tail=120
docker compose --env-file .env.web -f web.compose.yml logs web --tail=120
docker compose --env-file .env.infra -f infra.compose.yml logs mysql --tail=120
```

### Aplicar actualización

Servidor API:

```bash
cd /opt/Ambar
git pull origin main
cd /opt/Ambar/infra/staging
docker compose --env-file .env.api -f api.compose.yml up -d --build
```

Servidor frontend:

```bash
cd /opt/ambar
git pull origin main
cd /opt/ambar/infra/staging
docker compose --env-file .env.web -f web.compose.yml build --no-cache web
docker compose --env-file .env.web -f web.compose.yml up -d web
```

Servidor infraestructura:

```bash
cd /opt/Ambar/infra/staging
docker compose --env-file .env.infra -f infra.compose.yml pull
docker compose --env-file .env.infra -f infra.compose.yml up -d
```

### Migraciones manuales

```bash
docker compose --env-file .env.api -f api.compose.yml run --rm api-migrate alembic current
docker compose --env-file .env.api -f api.compose.yml run --rm api-migrate alembic heads
docker compose --env-file .env.api -f api.compose.yml run --rm api-migrate alembic upgrade head
```

## 13. Validación después de instalar

### API

```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/ready
```

### Gateway

```bash
curl http://ambar.empresa.com/health
curl http://ambar.empresa.com/health/ready
```

### Frontend

```bash
curl -I http://ambar.empresa.com/login
```

### Login API

```bash
curl -X POST http://ambar.empresa.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ambar.co","password":"CLAVE_REAL"}'
```

No documentar claves reales de administrador en manuales. Crear usuario administrador durante instalación y forzar cambio.

## 14. Recomendaciones de performance

### API

`GUNICORN_WORKERS`:

- 1 worker para staging o servidores pequeños.
- 2 a 4 workers para producción pequeña.
- Fórmula inicial: `CPU cores x 2 + 1`, pero validar consumo real.

Ejemplo:

```env
GUNICORN_WORKERS=3
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
DB_POOL_RECYCLE_SECONDS=1800
```

### MySQL

Recomendaciones:

- Disco SSD/NVMe.
- Backups diarios.
- Índices aplicados por migraciones.
- Monitorear conexiones.
- No compartir MySQL con otros sistemas pesados.

### Redis

Usos:

- Cache de API.
- Rate limiting.
- Datos temporales.

Mantener:

```text
appendonly yes
```

### MinIO

Usos:

- Archivos digitales.
- Evidencias.
- Reportes exportados.

Recomendaciones:

- Disco separado si la empresa maneja alto volumen documental.
- Versionamiento o backup externo.
- No exponer consola públicamente.

### OpenSearch

Usos:

- Búsqueda documental.
- Indexación futura OCR/metadatos.

Para empresas pequeñas puede dejarse con recursos moderados. Para producción grande requiere ajuste dedicado.

## 15. Seguridad mínima productiva

Antes de entregar a empresa:

- Activar HTTPS.
- Cambiar todos los secretos.
- `ENVIRONMENT=production`.
- `AUTO_CREATE_SCHEMA=false`.
- `SEED_DEFAULT_DATA=false`.
- `ALLOWED_HOSTS` sin `*`.
- `FRONTEND_ORIGINS` sin `*`.
- No exponer MySQL, Redis, RabbitMQ, MinIO ni OpenSearch a internet.
- Crear backup automático.
- Crear usuario administrador real.
- Desactivar o proteger `/docs`, `/openapi.json` y `/metrics`.
- Revisar logs de auditoría.
- Validar subida y descarga de documentos.

## 16. Checklist final por escenario

### Multi-servidor Docker

- DNS apunta al gateway.
- Gateway tiene `server_name` correcto.
- `.env.api` usa dominio real.
- `.env.web` usa `/api/v1` y `API_PROXY_TARGET` interno.
- Infraestructura tiene volúmenes persistentes.
- Firewall solo expone 80/443.
- Backups configurados.
- `ENVIRONMENT=production`.

### Un servidor Docker

- Dominio apunta al servidor único.
- Gateway apunta a `127.0.0.1:3000`.
- API apunta a servicios locales.
- Volúmenes en `/data/ambar`.
- Backups en `/backups/ambar`.
- Puertos internos cerrados.
- `ENVIRONMENT=production`.

### Windows sin Docker

- MySQL instalado y con usuario `ambar`.
- Redis/RabbitMQ/MinIO corriendo como servicios.
- Backend con Python 3.12 y migraciones aplicadas.
- Frontend construido con `npm run build`.
- IIS/Apache apunta al frontend.
- API_PROXY_TARGET apunta a `http://127.0.0.1:8000`.
- Backups de MySQL y MinIO configurados.
- `ENVIRONMENT=production` si cumple secretos, hosts y origins seguros.

## 17. Decisión recomendada

Para vender AMBAR a empresas, la mejor opción es:

1. Docker.
2. Dominio con HTTPS.
3. Gateway único.
4. API y frontend detrás del gateway.
5. MySQL, Redis, RabbitMQ, MinIO y OpenSearch en red privada.
6. Volúmenes en rutas explícitas como `/data/ambar`.
7. Backups diarios y prueba de restauración.

La instalación Windows sin Docker se debe reservar para clientes pequeños, pilotos o empresas sin infraestructura técnica.

