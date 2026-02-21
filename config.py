"""
Rectify — Centralized Application Configuration.

All tuneable constants are defined here. Override via environment variables
where noted, or edit the defaults directly for development.
"""

import os
from pathlib import Path

BASE_DIR: Path = Path(__file__).resolve().parent

# ── Security ──────────────────────────────────────────────────────────────────
SECRET_KEY: str = os.environ.get("SECRET_KEY", os.urandom(32).hex())

# ── Upload handling ───────────────────────────────────────────────────────────
UPLOAD_FOLDER: Path = BASE_DIR / "uploads"
MAX_CONTENT_LENGTH: int = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS: set[str] = {"png", "jpg", "jpeg", "webp"}

# ── Cleanup service ──────────────────────────────────────────────────────────
CLEANUP_INTERVAL: int = 1800  # seconds (30 minutes)

# ── Default overlay shown on editor load ─────────────────────────────────────
DEFAULT_OVERLAY: str = "rule-of-thirds"
