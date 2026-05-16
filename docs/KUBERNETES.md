# Kubernetes Fase 3

Los manifiestos base estan en `infra/k8s`.

Orden recomendado:

```powershell
kubectl apply -k infra/k8s
```

Antes de usar produccion:

- Cambiar imagenes `ghcr.io/your-org/*`.
- Reemplazar `secrets.example.yaml` por External Secrets o Vault.
- Configurar `ambar-tls`.
- Ajustar dominio `ambar.example.com`.
- Conectar MySQL primary/replica, Redis Cluster, RabbitMQ Cluster, MinIO distribuido y OpenSearch Cluster administrados.

La API expone:

- `/health/live` para liveness probe.
- `/health/ready` para readiness probe.
- `/metrics` para Prometheus.
