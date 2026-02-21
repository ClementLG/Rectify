"""
Rectify — Application Factory.

Initialises the Flask application, registers blueprints, and configures
CSRF protection.  Run directly for development:

    python app.py
"""

from __future__ import annotations

from pathlib import Path

from flask import Flask
from flask_wtf.csrf import CSRFProtect
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_talisman import Talisman
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

import config

csrf = CSRFProtect()
talisman = Talisman()
limiter = Limiter(key_func=get_remote_address)


def create_app() -> Flask:
    """Build and configure the Flask application instance.

    Returns:
        A fully configured ``Flask`` application ready to serve.
    """
    app = Flask(__name__)

    # ── Load configuration ────────────────────────────────────────────────
    app.config.from_object(config)

    # Apply configuration specifically mapped
    app.config["UPLOAD_FOLDER"] = str(config.UPLOAD_FOLDER)

    # ── Ensure upload directory exists ────────────────────────────────────
    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)

    # ── Proxy support ────────────────────────────────────────────────────
    # Trust reverse proxy headers when behind Nginx/Traefik
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    # ── Security Extensions ──────────────────────────────────────────────
    csrf.init_app(app)
    limiter.init_app(app)

    # Determine exact Content-Security-Policy
    csp = {
        'default-src': ["'self'"],
        'style-src': [
            "'self'",
            "'unsafe-inline'",       # Cropper.js / inline Vue/Alpine styles sometimes require this
        ],
        'font-src': [
            "'self'",
            "data:"                  # allow localized fontawesome woff2 inline or static fonts
        ],
        'script-src': [
            "'self'",
            "'unsafe-inline'",       # Allowed for small inline initializations
        ],
        'img-src': ["'self'", "data:", "blob:"],
    }

    # Disable HTTPS enforcement (HSTS/Secure cookies) in Local Dev
    force_https = (config.APP_ENV == "production")

    talisman.init_app(
        app,
        force_https=force_https,
        content_security_policy=csp,
        strict_transport_security=force_https,
        session_cookie_secure=force_https,
    )

    # ── Register blueprints ──────────────────────────────────────────────
    from routes.views import views_bp
    from routes.api import api_bp

    app.register_blueprint(views_bp)
    app.register_blueprint(api_bp)

    # ── Start cleanup daemon ─────────────────────────────────────────────
    import threading
    from cleanup_service import run_loop

    cleanup_thread = threading.Thread(target=run_loop, name="cleanup-daemon", daemon=True)
    cleanup_thread.start()

    return app


if __name__ == "__main__":
    application = create_app()
    application.run(debug=True, host="127.0.0.1", port=5000)
