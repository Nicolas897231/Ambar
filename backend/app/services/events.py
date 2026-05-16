import json

import pika

from app.core.config import get_settings


def publish_event(event_name: str, payload: dict) -> None:
    settings = get_settings()
    try:
        connection = pika.BlockingConnection(pika.URLParameters(settings.rabbitmq_url))
        channel = connection.channel()
        channel.exchange_declare(exchange="ambar.events", exchange_type="topic", durable=True)
        channel.basic_publish(
            exchange="ambar.events",
            routing_key=event_name,
            body=json.dumps(payload, default=str).encode("utf-8"),
            properties=pika.BasicProperties(content_type="application/json", delivery_mode=2),
        )
        connection.close()
    except Exception:
        # Events must not break the transactional API path; failed deliveries are observable in logs.
        return
