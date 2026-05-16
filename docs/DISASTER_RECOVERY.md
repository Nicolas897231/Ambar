# Disaster Recovery

Objetivo Fase 3:

- RPO inicial: 15 minutos.
- RTO inicial: 60 minutos.

Estrategia:

- MySQL: snapshots, binlogs y pruebas de restore mensuales.
- MinIO: versionamiento, replicacion y lifecycle policies.
- OpenSearch: snapshots diarios de indices.
- Redis: persistencia AOF y replicas.
- RabbitMQ: colas durables, quorum queues y DLQ.

Cada release productivo debe validar:

- Restore de base de datos en ambiente aislado.
- Recuperacion de documentos MinIO.
- Reindexacion OpenSearch desde MySQL.
- Reproceso de eventos fallidos desde DLQ.
