"""
Rectify — File Lifecycle Management Service.

Manages the lifecycle of uploaded session folders through three strategies:

  1. **Retention-based cleanup** — Removes sessions older than RETENTION_SECONDS.
  2. **Capacity-based cleanup** — Evicts oldest sessions when storage exceeds MAX_STORAGE_MB.
  3. **Proactive eviction** — Evicts oldest sessions when usage exceeds STORAGE_WARN_PERCENT.

Can run as:
  - A standalone process:   ``python cleanup_service.py``
  - A daemon thread started from ``app.py``.

Every file-system operation is individually wrapped in exception handlers to
guarantee that a single corrupted folder never crashes the entire sweep.  The
main loop itself is protected by a top-level catch-all so the daemon thread
survives transient OS errors (disk full, permission denied, etc.).
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


# ── Helpers ──────────────────────────────────────────────────────────────────


def get_directory_size(path: Path) -> int:
    """Compute the total size of *path* recursively, in bytes.

    Silently skips files that cannot be stat'd (e.g. locked by another
    process, deleted between iteration and stat call).

    Args:
        path: Root directory to measure.

    Returns:
        Total size in bytes, or ``0`` if *path* does not exist.
    """
    if not path.is_dir():
        return 0

    total: int = 0
    try:
        for entry in path.rglob("*"):
            try:
                if entry.is_file():
                    total += entry.stat().st_size
            except OSError:
                # File disappeared or is locked — skip silently.
                pass
    except OSError as exc:
        logger.warning("Error walking directory %s: %s", path, exc)

    return total


def get_sessions_sorted_by_age(upload_folder: Path) -> list[tuple[Path, float]]:
    """Return session directories sorted oldest-first by modification time.

    Only immediate child directories of *upload_folder* are considered.
    Entries that cannot be stat'd are skipped (race-condition safe).

    Args:
        upload_folder: Root ``uploads/`` directory.

    Returns:
        List of ``(path, mtime)`` tuples, oldest first.
    """
    sessions: list[tuple[Path, float]] = []

    if not upload_folder.is_dir():
        return sessions

    try:
        for entry in upload_folder.iterdir():
            if not entry.is_dir():
                continue
            try:
                mtime: float = entry.stat().st_mtime
                sessions.append((entry, mtime))
            except OSError:
                # Folder vanished between iterdir() and stat() — skip.
                pass
    except OSError as exc:
        logger.warning("Cannot list upload folder %s: %s", upload_folder, exc)

    sessions.sort(key=lambda t: t[1])  # oldest first
    return sessions


def _safe_rmtree(path: Path) -> bool:
    """Remove a directory tree, returning ``True`` on success.

    Handles all OS-level failures gracefully so the caller never needs
    to worry about exception propagation.

    Args:
        path: Directory to remove.

    Returns:
        ``True`` if the directory was successfully removed, ``False`` otherwise.
    """
    try:
        shutil.rmtree(path)
        return True
    except OSError as exc:
        logger.warning("Failed to remove %s: %s", path.name, exc)
        return False


def _folder_size(path: Path) -> int:
    """Quick size measurement for a single session folder.

    Args:
        path: Session directory.

    Returns:
        Size in bytes, or ``0`` on error.
    """
    try:
        return sum(
            f.stat().st_size
            for f in path.rglob("*")
            if f.is_file()
        )
    except OSError:
        return 0


# ── Cleanup Strategies ───────────────────────────────────────────────────────


def cleanup_expired_sessions(upload_folder: Path, retention_seconds: int) -> int:
    """**Strategy 1** — Remove sessions whose last modification exceeds the
    retention threshold.

    Uses ``st_mtime`` (modification time) rather than ``st_atime`` because
    access-time tracking is unreliable on Windows (often disabled or
    approximated).

    Args:
        upload_folder: Root ``uploads/`` directory.
        retention_seconds: Maximum age in seconds.

    Returns:
        Number of session directories removed.
    """
    now: float = time.time()
    removed: int = 0

    for session_path, mtime in get_sessions_sorted_by_age(upload_folder):
        age: float = now - mtime
        if age > retention_seconds:
            if _safe_rmtree(session_path):
                removed += 1
                logger.info(
                    "Retention cleanup — removed %s (age %.0fs, limit %ds)",
                    session_path.name, age, retention_seconds,
                )

    return removed


def cleanup_by_capacity(
    upload_folder: Path,
    max_bytes: int,
    warn_bytes: int,
) -> int:
    """**Strategies 2 & 3** — Evict oldest sessions to stay within capacity.

    If the current usage exceeds *max_bytes*, sessions are deleted oldest-first
    until usage drops below *warn_bytes* (the proactive threshold). This
    ensures headroom is maintained and prevents immediate re-triggering.

    Args:
        upload_folder: Root ``uploads/`` directory.
        max_bytes: Hard storage ceiling in bytes (``MAX_STORAGE_MB * 1 MB``).
        warn_bytes: Soft ceiling for proactive eviction.

    Returns:
        Number of session directories removed.
    """
    current_size: int = get_directory_size(upload_folder)

    if current_size <= warn_bytes:
        return 0

    target: int = warn_bytes  # aim below the warning line
    removed: int = 0

    sessions = get_sessions_sorted_by_age(upload_folder)

    for session_path, _mtime in sessions:
        if current_size <= target:
            break

        folder_bytes: int = _folder_size(session_path)

        if _safe_rmtree(session_path):
            current_size -= folder_bytes
            removed += 1
            logger.info(
                "Capacity cleanup — removed %s (freed %s, usage now %s / %s)",
                session_path.name,
                _human_size(folder_bytes),
                _human_size(current_size),
                _human_size(max_bytes),
            )

    return removed


# ── Orchestrator ─────────────────────────────────────────────────────────────


def run_sweep(
    upload_folder: Path | None = None,
    retention_seconds: int | None = None,
    max_storage_mb: int | None = None,
    storage_warn_percent: int | None = None,
) -> dict[str, int]:
    """Execute a full cleanup sweep combining all strategies.

    All parameters default to values from ``config`` if not supplied,
    so callers (including the daemon loop) don't need to pass anything.

    Args:
        upload_folder: Override for ``config.UPLOAD_FOLDER``.
        retention_seconds: Override for ``config.RETENTION_SECONDS``.
        max_storage_mb: Override for ``config.MAX_STORAGE_MB``.
        storage_warn_percent: Override for ``config.STORAGE_WARN_PERCENT``.

    Returns:
        Dict with keys ``"expired"`` and ``"capacity"`` holding the removal
        counts from each strategy.
    """
    folder = upload_folder or config.UPLOAD_FOLDER
    retention = retention_seconds if retention_seconds is not None else config.RETENTION_SECONDS
    max_mb = max_storage_mb if max_storage_mb is not None else config.MAX_STORAGE_MB
    warn_pct = storage_warn_percent if storage_warn_percent is not None else config.STORAGE_WARN_PERCENT

    max_bytes: int = max_mb * 1024 * 1024
    warn_bytes: int = int(max_bytes * warn_pct / 100)

    expired = cleanup_expired_sessions(folder, retention)
    capacity = cleanup_by_capacity(folder, max_bytes, warn_bytes)

    total = expired + capacity
    if total:
        logger.info(
            "Sweep complete — removed %d session(s) (expired=%d, capacity=%d).",
            total, expired, capacity,
        )

    return {"expired": expired, "capacity": capacity}


# ── Daemon Loop ──────────────────────────────────────────────────────────────


def run_loop() -> None:
    """Run the cleanup in an infinite loop (for daemon / cron-like usage).

    The interval between sweeps is defined by ``config.CLEANUP_INTERVAL``.
    A top-level ``Exception`` catch-all ensures the daemon thread never dies
    from a transient error — it logs the failure and retries on the next cycle.
    """
    logger.info(
        "Cleanup daemon started — folder=%s, interval=%ds, "
        "retention=%ds, max_storage=%dMB, warn_at=%d%%",
        config.UPLOAD_FOLDER,
        config.CLEANUP_INTERVAL,
        config.RETENTION_SECONDS,
        config.MAX_STORAGE_MB,
        config.STORAGE_WARN_PERCENT,
    )

    while True:
        try:
            run_sweep()
        except Exception:
            # Top-level safety net — the daemon must never crash.
            logger.exception("Unexpected error during cleanup sweep; will retry next cycle.")

        try:
            time.sleep(config.CLEANUP_INTERVAL)
        except Exception:
            # Even sleep can theoretically raise (e.g. on OS signal edge cases).
            logger.exception("Sleep interrupted — continuing.")


# ── Utilities ────────────────────────────────────────────────────────────────


def _human_size(size_bytes: int) -> str:
    """Format a byte count into a human-readable string.

    Args:
        size_bytes: Number of bytes.

    Returns:
        A string such as ``"12.3 MB"`` or ``"456 KB"``.
    """
    for unit in ("B", "KB", "MB", "GB"):
        if abs(size_bytes) < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024  # type: ignore[assignment]
    return f"{size_bytes:.1f} TB"


if __name__ == "__main__":
    run_loop()
