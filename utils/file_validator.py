"""
Rectify — File Validator Utilities.

Provides secure filename sanitisation, extension checking, and binary
signature (magic-number) validation for uploaded image files.
"""

from __future__ import annotations

import io
from typing import BinaryIO

from werkzeug.utils import secure_filename as _secure_filename

from config import ALLOWED_EXTENSIONS

# ── Magic byte signatures for supported formats ──────────────────────────────
_MAGIC_SIGNATURES: dict[str, list[bytes]] = {
    "jpeg": [b"\xff\xd8\xff"],
    "jpg":  [b"\xff\xd8\xff"],
    "png":  [b"\x89PNG\r\n\x1a\n"],
    "webp": [b"RIFF"],  # Full check includes "WEBP" at offset 8
}

_MAX_MAGIC_LENGTH: int = max(
    len(sig) for sigs in _MAGIC_SIGNATURES.values() for sig in sigs
)


def sanitize_filename(filename: str) -> str:
    """Return a filesystem-safe version of *filename*.

    Args:
        filename: The raw filename from the upload form.

    Returns:
        A sanitised filename safe for use on any OS.

    Raises:
        ValueError: If the resulting filename is empty after sanitisation.
    """
    clean: str = _secure_filename(filename)
    if not clean:
        raise ValueError("Filename is empty after sanitisation.")
    return clean


def validate_extension(filename: str) -> bool:
    """Check that *filename* has an allowed image extension.

    Args:
        filename: The filename to validate (e.g. ``"photo.jpg"``).

    Returns:
        ``True`` if the extension is in the allowed set, ``False`` otherwise.
    """
    if "." not in filename:
        return False
    ext: str = filename.rsplit(".", 1)[1].lower()
    return ext in ALLOWED_EXTENSIONS


def validate_magic_bytes(stream: BinaryIO) -> bool:
    """Verify the binary signature of an image file.

    Reads the first bytes from *stream* and compares them against known
    magic-number signatures for JPEG, PNG, and WebP.

    Args:
        stream: A readable binary stream positioned at the start of the file.

    Returns:
        ``True`` if the stream starts with a recognised image signature.

    Note:
        The stream position is reset to the beginning after reading.
    """
    header: bytes = stream.read(12)  # 12 bytes covers RIFF + WEBP check
    stream.seek(0)

    if not header:
        return False

    # JPEG
    if header[:3] == b"\xff\xd8\xff":
        return True

    # PNG
    if header[:8] == b"\x89PNG\r\n\x1a\n":
        return True

    # WebP — RIFF....WEBP
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return True

    return False
