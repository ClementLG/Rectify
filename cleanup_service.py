"""
Rectify — Cleanup Service.

Scans the upload directory and removes session folders whose last-access
time exceeds the configured threshold.  Designed to run as:

  - A standalone cron / Task Scheduler job:  ``python cleanup_service.py``
  - Or imported and started as a daemon thread from ``app.py``.
"""

from __future__ import annotations

import logging
import shutil
import time
from pathlib import Path

import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [cleanup] %(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)


def cleanup_stale_sessions(upload_folder: Path, max_age_seconds: int) -> int:
    """Delete session directories that have not been accessed recently.

    Args:
        upload_folder: Root directory containing per-session subfolders.
        max_age_seconds: Maximum allowed idle time (seconds) before removal.

    Returns:
        Number of directories removed.
    """
    if not upload_folder.is_dir():
        logger.info("Upload folder does not exist yet — nothing to clean.")
        return 0

    now: float = time.time()
    removed: int = 0

    for entry in upload_folder.iterdir():
        if not entry.is_dir():
            continue

        try:
            last_access: float = entry.stat().st_atime
            age: float = now - last_access

            if age > max_age_seconds:
                shutil.rmtree(entry)
                removed += 1
                logger.info("Removed stale session: %s (idle %.0fs)", entry.name, age)
        except OSError as exc:
            logger.warning("Failed to remove %s: %s", entry.name, exc)

    return removed


def run_loop() -> None:
    """Run the cleanup in an infinite loop (for daemon / cron-like usage).

    The interval between sweeps is defined by ``config.CLEANUP_INTERVAL``.
    """
    logger.info(
        "Cleanup service started — folder=%s, interval=%ds, max_age=%ds",
        config.UPLOAD_FOLDER,
        config.CLEANUP_INTERVAL,
        config.CLEANUP_INTERVAL,
    )

    while True:
        removed = cleanup_stale_sessions(config.UPLOAD_FOLDER, config.CLEANUP_INTERVAL)
        if removed:
            logger.info("Sweep complete — removed %d session(s).", removed)
        time.sleep(config.CLEANUP_INTERVAL)


if __name__ == "__main__":
    run_loop()
