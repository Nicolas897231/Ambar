# Observabilidad

Fase 3 agrega metrica Prometheus basica en `/metrics`.

Stack objetivo:

- Prometheus para metricas.
- Grafana para dashboards.
- Loki para logs.
- Tempo o Jaeger para tracing distribuido.

Metricas minimas:

- Requests por ruta.
- Errores HTTP 5xx.
- Latencia acumulada.
- Healthchecks DB/cache.
- Jobs fallidos.
- Tareas vencidas.
- Colas RabbitMQ y DLQ.

Los logs productivos deben emitirse como JSON con `request_id`, usuario, modulo y accion cuando aplique.
