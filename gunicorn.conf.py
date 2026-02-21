"""
Rectify — Gunicorn Configuration.

Optimised for a containerised image-processing workload:
  - gthread workers handle concurrent I/O-bound requests efficiently.
  - Worker recycling (max_requests) prevents long-term memory leaks.
  - preload_app shares application memory across all workers.
"""

import multiprocessing

# ── Server socket ────────────────────────────────────────────────────────────
bind = "0.0.0.0:8000"

# ── Worker processes ─────────────────────────────────────────────────────────
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "gthread"
threads = 4

# ── Worker lifecycle ─────────────────────────────────────────────────────────
worker_tmp_dir = "/tmp"  # Required for Docker read_only root filesystem
max_requests = 1000
max_requests_jitter = 50
timeout = 120
graceful_timeout = 30

# ── Memory optimisation ─────────────────────────────────────────────────────
preload_app = True

# ── Logging ──────────────────────────────────────────────────────────────────
accesslog = None  # Disabled to prevent healthcheck and traffic log spam
errorlog = "-"
loglevel = "warning"
