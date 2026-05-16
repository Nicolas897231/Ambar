from datetime import timedelta
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from minio import Minio
from minio.error import S3Error

from app.core.config import get_settings

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/tiff",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
}


def _client() -> Minio:
    settings = get_settings()
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.is_production,
    )


def validate_upload(file: UploadFile, content: bytes) -> None:
    settings = get_settings()
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise ValueError("Unsupported file type")
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise ValueError("File exceeds configured size limit")


def store_file(*, company_id: str, module: str, file: UploadFile, content: bytes) -> dict:
    validate_upload(file, content)
    digest = sha256(content).hexdigest()
    suffix = Path(file.filename or "document").suffix.lower()
    object_name = f"{company_id}/{module}/{uuid4()}{suffix}"
    settings = get_settings()

    try:
        client = _client()
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
        from io import BytesIO

        client.put_object(
            settings.minio_bucket,
            object_name,
            BytesIO(content),
            length=len(content),
            content_type=file.content_type,
        )
        path = f"s3://{settings.minio_bucket}/{object_name}"
    except S3Error:
        raise
    except Exception:
        local_root = Path("uploads")
        local_root.mkdir(parents=True, exist_ok=True)
        local_path = local_root / object_name.replace("/", "_")
        local_path.write_bytes(content)
        path = str(local_path)

    return {
        "path": path,
        "checksum": digest,
        "size_bytes": len(content),
        "content_type": file.content_type or "application/octet-stream",
        "original_name": file.filename or "document",
    }


def presigned_url(file_path: str) -> str:
    settings = get_settings()
    if not file_path.startswith("s3://"):
        return file_path
    bucket_and_key = file_path.replace("s3://", "", 1)
    bucket, key = bucket_and_key.split("/", 1)
    try:
        return _client().presigned_get_object(bucket, key, expires=timedelta(minutes=10))
    except Exception:
        return f"{settings.api_base_url}/files/unavailable"
