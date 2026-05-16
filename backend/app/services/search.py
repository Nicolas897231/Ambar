import json
from urllib.error import URLError
from urllib.request import Request, urlopen

from app.core.config import get_settings


def _request(method: str, path: str, payload: dict | None = None) -> dict | None:
    settings = get_settings()
    if not settings.opensearch_url:
        return None
    url = f"{settings.opensearch_url.rstrip('/')}/{path.lstrip('/')}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=2) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except (URLError, TimeoutError, OSError):
        return None


def index_document(document: dict) -> bool:
    settings = get_settings()
    document_id = document["idDocument"]
    response = _request("PUT", f"{settings.opensearch_index}/_doc/{document_id}", document)
    return response is not None


def search_documents(query: str, filters: dict, page: int, size: int) -> dict | None:
    settings = get_settings()
    must: list[dict] = []
    if query:
        must.append(
            {
                "multi_match": {
                    "query": query,
                    "fields": ["document_name^3", "document_type", "status", "metadata"],
                    "fuzziness": "AUTO",
                }
            }
        )
    else:
        must.append({"match_all": {}})
    for key, value in filters.items():
        if value not in (None, ""):
            must.append({"term": {key: value}})
    payload = {
        "from": max(page - 1, 0) * size,
        "size": size,
        "query": {"bool": {"must": must}},
        "highlight": {"fields": {"document_name": {}, "metadata": {}}},
    }
    return _request("GET", f"{settings.opensearch_index}/_search", payload)
