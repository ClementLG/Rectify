"""
Rectify — View Routes.

Serves HTML pages.  This blueprint has no prefix — it handles root-level
page requests.
"""

from __future__ import annotations

from flask import Blueprint, render_template

from config import DEFAULT_OVERLAY

views_bp = Blueprint("views", __name__)


@views_bp.route("/")
def index() -> str:
    """Render the main editor page.

    Returns:
        Rendered ``index.html`` template with the default overlay name.
    """
    return render_template("index.html", default_overlay=DEFAULT_OVERLAY)
