from collections import defaultdict
from time import perf_counter


class MetricsRegistry:
    def __init__(self) -> None:
        self.requests: dict[str, int] = defaultdict(int)
        self.errors: dict[str, int] = defaultdict(int)
        self.latency_sum: dict[str, float] = defaultdict(float)

    def observe(self, path: str, status_code: int, elapsed: float) -> None:
        key = path.replace("/", "_").strip("_") or "root"
        self.requests[key] += 1
        self.latency_sum[key] += elapsed
        if status_code >= 500:
            self.errors[key] += 1

    def render_prometheus(self) -> str:
        lines = [
            "# HELP ambar_http_requests_total Total HTTP requests.",
            "# TYPE ambar_http_requests_total counter",
        ]
        for path, value in sorted(self.requests.items()):
            lines.append(f'ambar_http_requests_total{{path="{path}"}} {value}')
        lines.extend(
            [
                "# HELP ambar_http_errors_total Total HTTP 5xx responses.",
                "# TYPE ambar_http_errors_total counter",
            ]
        )
        for path, value in sorted(self.errors.items()):
            lines.append(f'ambar_http_errors_total{{path="{path}"}} {value}')
        lines.extend(
            [
                "# HELP ambar_http_latency_seconds_sum Sum of request latency seconds.",
                "# TYPE ambar_http_latency_seconds_sum counter",
            ]
        )
        for path, value in sorted(self.latency_sum.items()):
            lines.append(f'ambar_http_latency_seconds_sum{{path="{path}"}} {value:.6f}')
        return "\n".join(lines) + "\n"


metrics_registry = MetricsRegistry()


def now() -> float:
    return perf_counter()
