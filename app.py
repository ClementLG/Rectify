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

import config

csrf = CSRFProtect()


def create_app() -> Flask:
    """Build and configure the Flask application instance.

    Returns:
        A fully configured ``Flask`` application ready to serve.
    """
    app = Flask(__name__)

    # ── Load configuration ────────────────────────────────────────────────
    app.config["SECRET_KEY"] = config.SECRET_KEY
    app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH
    app.config["UPLOAD_FOLDER"] = str(config.UPLOAD_FOLDER)

    # ── Ensure upload directory exists ────────────────────────────────────
    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)

    # ── CSRF protection ──────────────────────────────────────────────────
    csrf.init_app(app)

    # ── Register blueprints ──────────────────────────────────────────────
    from routes.views import views_bp
    from routes.api import api_bp

    app.register_blueprint(views_bp)
    app.register_blueprint(api_bp)

    return app


if __name__ == "__main__":
    application = create_app()
    application.run(debug=True, host="127.0.0.1", port=5000)
