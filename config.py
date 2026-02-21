"""
Rectify — Centralized Application Configuration.

All tuneable constants are defined here. Override via environment variables
where noted, or edit the defaults directly for development.
"""

import os
from pathlib import Path

BASE_DIR: Path = Path(__file__).resolve().parent

# ── Environment ───────────────────────────────────────────────────────────────
APP_ENV: str = os.environ.get("APP_ENV", "production").lower()

# ── Security ──────────────────────────────────────────────────────────────────
SECRET_KEY: str = os.environ.get("SECRET_KEY", os.urandom(32).hex())

# Cookie Security (Production-centric)
SESSION_COOKIE_SECURE: bool = (APP_ENV == "production")
SESSION_COOKIE_HTTPONLY: bool = True
SESSION_COOKIE_SAMESITE: str = "Lax"

# Mitigate Decompression Bombs
# 50 MP limit (generous for most use cases, safely avoids massive memory spikes)
MAX_IMAGE_PIXELS: int = int(os.environ.get("MAX_IMAGE_PIXELS", 50_000_000))

# Rate Limiting configuration
RATELIMIT_DEFAULT: str = os.environ.get("RATELIMIT_DEFAULT", "200 per day;50 per hour")
RATELIMIT_STORAGE_URI: str = "memory://" # Simple memory backend for single-node. Use Redis for multi-node.

# ── Upload handling ───────────────────────────────────────────────────────────
UPLOAD_FOLDER: Path = Path(os.environ.get("UPLOAD_FOLDER", str(BASE_DIR / "uploads")))
MAX_CONTENT_LENGTH: int = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS: set[str] = {"png", "jpg", "jpeg", "webp"}

# ── Cleanup service / File lifecycle ─────────────────────────────────────────
CLEANUP_INTERVAL: int = 1800          # seconds between sweeps (30 minutes)
MAX_STORAGE_MB: int = 500             # maximum total size of uploads/ (MB)
RETENTION_SECONDS: int = 3600         # max age before a session is eligible for deletion (1 hour)
STORAGE_WARN_PERCENT: int = 80        # proactive eviction threshold (% of MAX_STORAGE_MB)

# ── Default overlay shown on editor load ─────────────────────────────────────
DEFAULT_OVERLAY: str = "rule-of-thirds"
