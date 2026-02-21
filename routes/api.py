"""
Rectify — API Routes.

REST-style endpoints for image upload, crop processing, and download.
All routes are prefixed with ``/api``.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from flask import (
    Blueprint,
    current_app,
    jsonify,
    request,
    send_from_directory,
    session,
)
from PIL import Image

from services.image_service import CropParams, ImageService
from utils.file_validator import sanitize_filename, validate_extension, validate_magic_bytes

api_bp = Blueprint("api", __name__, url_prefix="/api")


def _get_session_dir() -> Path:
    """Return (and create if needed) the upload directory for the current session.

    Each user session gets an isolated UUID-based folder under ``UPLOAD_FOLDER``.

    Returns:
        ``Path`` to the session-specific upload directory.
    """
    if "session_id" not in session:
        session["session_id"] = uuid.uuid4().hex
    upload_root: Path = Path(current_app.config["UPLOAD_FOLDER"])
    session_dir: Path = upload_root / session["session_id"]
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_dir


@api_bp.route("/upload", methods=["POST"])
def upload() -> tuple[Any, int]:
    """Handle image file upload.

    Validates the file extension and binary signature, saves it to the
    session directory, and returns image metadata.

    Returns:
        JSON ``{"filename", "width", "height", "session_id"}`` on success
        (HTTP 200), or an error object (HTTP 400).
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    if not file or file.filename == "":
        return jsonify({"error": "Empty filename."}), 400

    # Validate extension
    if not validate_extension(file.filename):
        return jsonify({"error": "Unsupported file format."}), 400

    # Validate magic bytes
    if not validate_magic_bytes(file.stream):
        return jsonify({"error": "File contents do not match a supported image format."}), 400

    try:
        clean_name: str = sanitize_filename(file.filename)
    except ValueError:
        return jsonify({"error": "Invalid filename."}), 400

    # Prefix with UUID fragment to avoid collisions
    unique_name = f"{uuid.uuid4().hex[:8]}_{clean_name}"
    session_dir: Path = _get_session_dir()
    save_path: Path = session_dir / unique_name
    file.save(str(save_path))

    # Read dimensions
    with Image.open(save_path) as img:
        width, height = img.size

    return jsonify({
        "filename": unique_name,
        "width": width,
        "height": height,
        "session_id": session["session_id"],
    }), 200


@api_bp.route("/crop", methods=["POST"])
def crop() -> tuple[Any, int]:
    """Process a crop request.

    Expects JSON payload with ``filename``, ``x``, ``y``, ``width``,
    ``height``, and optional ``rotate``, ``flipH``, ``flipV``.

    Returns:
        JSON ``{"filename", "session_id"}`` pointing to the processed image
        (HTTP 200), or an error object (HTTP 400 / 404).
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON payload."}), 400

    required = ("filename", "x", "y", "width", "height")
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    session_dir = _get_session_dir()
    source_path = session_dir / data["filename"]

    if not source_path.is_file():
        return jsonify({"error": "Source image not found."}), 404

    params = CropParams(
        x=float(data["x"]),
        y=float(data["y"]),
        width=float(data["width"]),
        height=float(data["height"]),
        rotate=float(data.get("rotate", 0)),
        flip_h=bool(data.get("flipH", False)),
        flip_v=bool(data.get("flipV", False)),
        quality=max(1, min(100, int(data.get("quality", 100)))),
    )

    result_path: Path = ImageService.process(source_path, params, session_dir)

    return jsonify({
        "filename": result_path.name,
        "session_id": session["session_id"],
    }), 200


@api_bp.route("/download/<session_id>/<filename>", methods=["GET"])
def download(session_id: str, filename: str) -> Any:
    """Serve a processed image for download.

    Args:
        session_id: The UUID identifying the user session.
        filename: Name of the file within the session directory.

    Returns:
        The file as an attachment, or HTTP 404 if not found.
    """
    upload_root: Path = Path(current_app.config["UPLOAD_FOLDER"])
    session_dir: Path = upload_root / session_id

    # Security: prevent directory traversal
    try:
        clean: str = sanitize_filename(filename)
    except ValueError:
        return jsonify({"error": "Invalid filename."}), 400

    file_path = session_dir / clean
    if not file_path.is_file():
        return jsonify({"error": "File not found."}), 404

    return send_from_directory(
        str(session_dir), clean, as_attachment=True
    )
