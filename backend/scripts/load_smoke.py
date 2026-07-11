"""Small HTTP load smoke test for AMBAR.

Usage:
    python backend/scripts/load_smoke.py http://localhost:8000 200

It measures round-trip latency for /health and /health/ready without requiring
external dependencies. Use it as a quick gate; use k6/Locust for formal load tests.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from statistics import mean
from time import perf_counter
import json
import sys
import urllib.request


def hit(url: str) -> tuple[int, float]:
    started = perf_counter()
    with urllib.request.urlopen(url, timeout=5) as response:  # noqa: S310 - operator-provided URL for internal smoke test
        response.read()
        status = response.status
    return status, (perf_counter() - started) * 1000


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(int(round((len(ordered) - 1) * pct)), len(ordered) - 1)
    return ordered[index]


def main() -> int:
    base_url = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
    total = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    urls = [f"{base_url}/health", f"{base_url}/health/ready"]
    latencies: list[float] = []
    errors = 0
    started = perf_counter()
    with ThreadPoolExecutor(max_workers=min(32, total)) as pool:
        futures = [pool.submit(hit, urls[i % len(urls)]) for i in range(total)]
        for future in as_completed(futures):
            try:
                status, latency = future.result()
                latencies.append(latency)
                if status >= 400:
                    errors += 1
            except Exception:
                errors += 1
    elapsed = perf_counter() - started
    result = {
        "requests": total,
        "errors": errors,
        "rps": round(total / elapsed, 2) if elapsed else total,
        "avg_ms": round(mean(latencies), 2) if latencies else 0,
        "p95_ms": round(percentile(latencies, 0.95), 2),
        "p99_ms": round(percentile(latencies, 0.99), 2),
    }
    print(json.dumps(result, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
