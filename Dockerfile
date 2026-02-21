# ── Stage 1: Build dependencies ──────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

COPY requirements.txt .

RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt


# ── Stage 2: Production runtime ──────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Prevent Python from writing .pyc files and enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TMPDIR="/tmp" \
    PATH="/opt/venv/bin:$PATH"

# Create non-root user
RUN groupadd --gid 1000 rectify && \
    useradd  --uid 1000 --gid rectify --shell /bin/false rectify

WORKDIR /app

# Copy virtual environment from builder stage
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY --chown=rectify:rectify . .

# Create uploads directory (will be overridden by tmpfs in docker-compose)
RUN mkdir -p /app/uploads && chown rectify:rectify /app/uploads

# Drop to non-root user
USER rectify

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/')"

CMD ["gunicorn", "--config", "gunicorn.conf.py", "app:create_app()"]
