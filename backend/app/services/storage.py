import zipfile
from datetime import timedelta
from hashlib import sha256
from io import BytesIO
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
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/zip",
    "application/x-zip-compressed",
    "application/xml",
    "text/xml",
    "video/mp4",
    "text/plain",
}

# Firma de bytes (magic bytes) por tipo MIME
_MAGIC_SIGNATURES: dict[str, list[bytes]] = {
    "application/pdf": [b"%PDF"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/tiff": [b"II*\x00", b"MM\x00*"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [b"PK\x03\x04"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [b"PK\x03\x04"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": [b"PK\x03\x04"],
    "application/msword": [b"\xd0\xcf\x11\xe0"],
    "application/vnd.ms-excel": [b"\xd0\xcf\x11\xe0"],
    "application/vnd.ms-powerpoint": [b"\xd0\xcf\x11\xe0"],
    "application/zip": [b"PK\x03\x04"],
    "application/x-zip-compressed": [b"PK\x03\x04"],
    "application/xml": [b"<?xml", b"\xef\xbb\xbf<?xml"],
    "text/xml": [b"<?xml", b"\xef\xbb\xbf<?xml"],
    "video/mp4": [b"\x00\x00\x00\x18ftyp", b"\x00\x00\x00\x20ftyp", b"\x00\x00\x00\x1cftyp"],
    "text/plain": [],  # sin firma fija
}

# Extensiones permitidas como sufijo de archivo
_ALLOWED_SUFFIXES = {
    ".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".tif",
    ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt",
    ".zip", ".xml", ".mp4", ".txt",
}

# Límite de descompresión para ZIP (evitar ZIP bombs): 500 MB
_ZIP_MAX_UNCOMPRESSED_MB = 500
_ZIP_MAX_RATIO = 20  # relación máxima compresión/original


def _client() -> Minio:
    settings = get_settings()
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.is_production,
    )


def _validate_magic_bytes(content_type: str, content: bytes) -> None:
    """Verifica que el archivo coincida con su firma de bytes real."""
    signatures = _MAGIC_SIGNATURES.get(content_type, [])
    if not signatures:
        return  # sin firma definida (text/plain), se acepta
    if not any(content[:len(sig)] == sig for sig in signatures):
        raise ValueError(f"File content does not match declared type {content_type}")


def _validate_zip_safety(content: bytes) -> None:
    """Protección contra ZIP bombs: verifica ratio y tamaño descomprimido."""
    try:
        with zipfile.ZipFile(BytesIO(content)) as zf:
            total_uncompressed = sum(info.file_size for info in zf.infolist())
            max_bytes = _ZIP_MAX_UNCOMPRESSED_MB * 1024 * 1024
            if total_uncompressed > max_bytes:
                raise ValueError(
                    f"ZIP content exceeds maximum allowed uncompressed size ({_ZIP_MAX_UNCOMPRESSED_MB} MB)"
                )
            compressed_size = len(content)
            if compressed_size > 0 and total_uncompressed / compressed_size > _ZIP_MAX_RATIO:
                raise ValueError("ZIP compression ratio too high — possible ZIP bomb")
    except zipfile.BadZipFile:
        raise ValueError("Invalid ZIP file")


def validate_upload(file: UploadFile, content: bytes) -> None:
    settings = get_settings()
    declared_type = (file.content_type or "").split(";")[0].strip().lower()
    if declared_type not in ALLOWED_MIME_TYPES:
        raise ValueError("Unsupported file type")
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise ValueError("File exceeds configured size limit")

    # Validación de magic bytes
    _validate_magic_bytes(declared_type, content)

    # Validación adicional de ZIPs
    if declared_type in {"application/zip", "application/x-zip-compressed"}:
        _validate_zip_safety(content)


def _safe_suffix(filename: str | None) -> str:
    """Extrae y valida el sufijo del archivo; retorna sufijo seguro o vacío."""
    if not filename:
        return ""
    suffix = Path(filename).suffix.lower()
    return suffix if suffix in _ALLOWED_SUFFIXES else ""


def store_file(*, company_id: str, module: str, file: UploadFile, content: bytes) -> dict:
    validate_upload(file, content)
    digest = sha256(content).hexdigest()
    suffix = _safe_suffix(file.filename)
    object_name = f"{company_id}/{module}/{uuid4()}{suffix}"
    settings = get_settings()

    try:
        client = _client()
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
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
        # Nombre de archivo local completamente sanitizado: solo UUID + sufijo permitido
        safe_name = f"{uuid4().hex}{suffix}"
        local_path = local_root / safe_name
        local_path.write_bytes(content)
        path = str(local_path)

    return {
        "file_path": path,
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


def verify_file_integrity(file_path: str, expected_checksum: str) -> bool:
    """Verifica que el archivo en MinIO coincida con el checksum registrado."""
    if not file_path.startswith("s3://"):
        try:
            content = Path(file_path).read_bytes()
            return sha256(content).hexdigest() == expected_checksum
        except Exception:
            return False
    bucket_and_key = file_path.replace("s3://", "", 1)
    bucket, key = bucket_and_key.split("/", 1)
    try:
        client = _client()
        response = client.get_object(bucket, key)
        content = response.read()
        response.close()
        return sha256(content).hexdigest() == expected_checksum
    except Exception:
        return False
