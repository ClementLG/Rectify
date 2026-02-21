/**
 * Rectify — SVG Composition Overlay Renderer.
 *
 * Each function accepts a width and height (in pixels) and returns an SVG
 * string fragment (a <g> element) that can be injected into the overlay <svg>.
 *
 * All overlays use the CSS custom property --overlay-color for stroke colour,
 * falling back to a semi-transparent indigo.
 */

"use strict";

const Overlays = (() => {

    let STROKE_COLOR = "rgba(108, 99, 255, 0.7)";
    const STROKE_WIDTH = 1.5;

    /**
     * Convert a hex colour (#rrggbb) to an RGBA string with the given alpha.
     * @param {string} hex
     * @param {number} [alpha=0.7]
     * @returns {string}
     */
    function hexToRgba(hex, alpha = 0.7) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * Set the overlay stroke colour from a hex value.
     * @param {string} hex - e.g. "#ff0000"
     */
    function setColor(hex) {
        STROKE_COLOR = hexToRgba(hex, 0.7);
    }

    /** @returns {string} Current RGBA stroke colour. */
    function getColor() {
        return STROKE_COLOR;
    }

    /**
     * Create an SVG line element as a string.
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {number} [sw] - stroke width override
     * @returns {string}
     */
    function line(x1, y1, x2, y2, sw = STROKE_WIDTH) {
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE_COLOR}" stroke-width="${sw}" />`;
    }

    /**
     * Create an SVG circle element as a string.
     * @param {number} cx
     * @param {number} cy
     * @param {number} r
     * @returns {string}
     */
    function circle(cx, cy, r) {
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" />`;
    }

    // ── 1. Rule of Thirds ───────────────────────────────────────────────
    function ruleOfThirds(w, h) {
        const x1 = w / 3, x2 = (2 * w) / 3;
        const y1 = h / 3, y2 = (2 * h) / 3;
        let svg = `<g class="overlay-rule-of-thirds">`;
        svg += line(x1, 0, x1, h);
        svg += line(x2, 0, x2, h);
        svg += line(0, y1, w, y1);
        svg += line(0, y2, w, y2);
        // Intersection circles
        [x1, x2].forEach(x => {
            [y1, y2].forEach(y => {
                svg += circle(x, y, 4);
            });
        });
        svg += `</g>`;
        return svg;
    }

    // ── 2. Golden Spiral (Fibonacci) ────────────────────────────────────
    function goldenSpiral(w, h) {
        const phi = 1.618033988749895;
        let svg = `<g class="overlay-golden-spiral">`;

        // Approximate the spiral with quarter-circle arcs
        let cx = 0, cy = 0;
        let rw = w, rh = h;

        // Build Fibonacci-like rectangles and arcs
        const segments = 8;
        const arcs = [];
        let sw = w, sh = h;

        for (let i = 0; i < segments; i++) {
            const size = i % 2 === 0 ? sw / phi : sh / phi;
            if (i % 2 === 0) sw = sw - sw / phi;
            else sh = sh - sh / phi;
        }

        // Instead of computing exact Fibonacci spiral segments, draw
        // the phi grid lines + an approximate spiral path
        const gx1 = w / phi;
        const gx2 = w - w / phi;
        const gy1 = h / phi;
        const gy2 = h - h / phi;

        svg += line(gx1, 0, gx1, h, 0.8);
        svg += line(gx2, 0, gx2, h, 0.8);
        svg += line(0, gy1, w, gy1, 0.8);
        svg += line(0, gy2, w, gy2, 0.8);

        // Approximate golden spiral using cubic bezier
        const sx = w * 0.075, sy = h * 0.56;
        const path = `M ${w * 0.975} ${h * 0.025}
            C ${w * 0.975} ${h * 0.55}, ${w * 0.72} ${h * 0.975}, ${w * 0.38} ${h * 0.975}
            C ${w * 0.15} ${h * 0.975}, ${w * 0.025} ${h * 0.78}, ${w * 0.025} ${h * 0.58}
            C ${w * 0.025} ${h * 0.42}, ${w * 0.14} ${h * 0.30}, ${w * 0.28} ${h * 0.30}
            C ${w * 0.40} ${h * 0.30}, ${w * 0.48} ${h * 0.39}, ${w * 0.48} ${h * 0.48}
            C ${w * 0.48} ${h * 0.55}, ${w * 0.43} ${h * 0.60}, ${w * 0.38} ${h * 0.60}
            C ${w * 0.34} ${h * 0.60}, ${w * 0.31} ${h * 0.57}, ${w * 0.31} ${h * 0.53}`;

        svg += `<path d="${path}" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" />`;
        svg += `</g>`;
        return svg;
    }

    // ── 3. Phi Grid ─────────────────────────────────────────────────────
    function phiGrid(w, h) {
        const phi = 1.618033988749895;
        const x1 = w / (1 + phi);
        const x2 = w - x1;
        const y1 = h / (1 + phi);
        const y2 = h - y1;

        let svg = `<g class="overlay-phi-grid">`;
        svg += line(x1, 0, x1, h);
        svg += line(x2, 0, x2, h);
        svg += line(0, y1, w, y1);
        svg += line(0, y2, w, y2);
        svg += `</g>`;
        return svg;
    }

    // ── 4. Golden Triangles ─────────────────────────────────────────────
    function goldenTriangles(w, h) {
        let svg = `<g class="overlay-golden-triangles">`;
        // Main diagonal
        svg += line(0, 0, w, h);
        // Perpendiculars from opposite corners to the diagonal
        // From top-right corner perpendicular to diagonal
        const d = Math.sqrt(w * w + h * h);
        const px1 = (w * h * h) / (d * d);
        const py1 = (w * w * h) / (d * d);
        svg += line(w, 0, w - px1, py1);
        // From bottom-left corner perpendicular to diagonal
        svg += line(0, h, px1, h - py1);
        svg += `</g>`;
        return svg;
    }

    // ── 5. Diagonal Method ──────────────────────────────────────────────
    function diagonalMethod(w, h) {
        let svg = `<g class="overlay-diagonal-method">`;
        // 45° lines from each corner, clipped to the rectangle
        const minDim = Math.min(w, h);
        // From top-left
        svg += line(0, 0, minDim, minDim);
        // From top-right
        svg += line(w, 0, w - minDim, minDim);
        // From bottom-left
        svg += line(0, h, minDim, h - minDim);
        // From bottom-right
        svg += line(w, h, w - minDim, h - minDim);
        svg += `</g>`;
        return svg;
    }

    // ── 6. Dynamic Symmetry (Baroque Diagonal Grid) ─────────────────────
    function dynamicSymmetry(w, h) {
        let svg = `<g class="overlay-dynamic-symmetry">`;
        // Main diagonals
        svg += line(0, 0, w, h, 1);
        svg += line(w, 0, 0, h, 1);
        // Reciprocal diagonals from each corner perpendicular to the main diagonals
        const d2 = w * w + h * h;
        // Perpendicular from (0,0) to (w,0)→(0,h) diagonal
        const rx = (w * h * h) / d2;
        const ry = (w * w * h) / d2;
        svg += line(0, 0, ry * w / h, ry, 0.8);
        svg += line(w, 0, w - ry * w / h, ry, 0.8);
        svg += line(0, h, ry * w / h, h - ry, 0.8);
        svg += line(w, h, w - ry * w / h, h - ry, 0.8);
        // Side reciprocals
        svg += line(0, h, w, h - w * h / w, 0.8);
        svg += line(w, 0, 0, w * h / w, 0.8);
        // Verticals and horizontals at golden intersections
        const phi = 1.618033988749895;
        const gx = w / phi;
        const gy = h / phi;
        svg += line(gx, 0, gx, h, 0.5);
        svg += line(w - gx, 0, w - gx, h, 0.5);
        svg += line(0, gy, w, gy, 0.5);
        svg += line(0, h - gy, w, h - gy, 0.5);
        svg += `</g>`;
        return svg;
    }

    // ── 7. Diamond Grid ─────────────────────────────────────────────────
    function diamondGrid(w, h) {
        const cx = w / 2, cy = h / 2;
        let svg = `<g class="overlay-diamond-grid">`;
        // Diamond connecting midpoints
        svg += `<polygon points="${cx},0 ${w},${cy} ${cx},${h} 0,${cy}"
                    fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" />`;
        // Inner diamond at 50%
        const s = 0.5;
        svg += `<polygon points="${cx},${cy - cy * s} ${cx + cx * s},${cy} ${cx},${cy + cy * s} ${cx - cx * s},${cy}"
                    fill="none" stroke="${STROKE_COLOR}" stroke-width="1" />`;
        // Center cross
        svg += line(cx, 0, cx, h, 0.5);
        svg += line(0, cy, w, cy, 0.5);
        svg += `</g>`;
        return svg;
    }

    // ── 8. Vanishing Point / Perspective ────────────────────────────────
    function vanishingPoint(w, h) {
        const cx = w / 2, cy = h / 2;
        let svg = `<g class="overlay-vanishing-point">`;
        // Lines from each corner and mid-edge converging to centre
        svg += line(0, 0, cx, cy);
        svg += line(w, 0, cx, cy);
        svg += line(0, h, cx, cy);
        svg += line(w, h, cx, cy);
        svg += line(cx, 0, cx, cy, 0.8);
        svg += line(cx, h, cx, cy, 0.8);
        svg += line(0, cy, cx, cy, 0.8);
        svg += line(w, cy, cx, cy, 0.8);
        // Centre circle
        svg += circle(cx, cy, 6);
        svg += circle(cx, cy, 2);
        svg += `</g>`;
        return svg;
    }

    // ── 9. Center Cross ─────────────────────────────────────────────────
    function centerCross(w, h) {
        const cx = w / 2, cy = h / 2;
        let svg = `<g class="overlay-center-cross">`;
        svg += line(cx, 0, cx, h);
        svg += line(0, cy, w, cy);
        svg += circle(cx, cy, 5);
        svg += `</g>`;
        return svg;
    }

    // ── 10. Quadrants ───────────────────────────────────────────────────
    function quadrants(w, h) {
        const cx = w / 2, cy = h / 2;
        let svg = `<g class="overlay-quadrants">`;
        svg += line(cx, 0, cx, h);
        svg += line(0, cy, w, cy);
        // Quarter marks
        svg += line(w / 4, 0, w / 4, h, 0.5);
        svg += line((3 * w) / 4, 0, (3 * w) / 4, h, 0.5);
        svg += line(0, h / 4, w, h / 4, 0.5);
        svg += line(0, (3 * h) / 4, w, (3 * h) / 4, 0.5);
        svg += `</g>`;
        return svg;
    }

    // ── Public Registry ─────────────────────────────────────────────────
    const registry = {
        "rule-of-thirds": ruleOfThirds,
        "golden-spiral": goldenSpiral,
        "phi-grid": phiGrid,
        "golden-triangles": goldenTriangles,
        "diagonal-method": diagonalMethod,
        "dynamic-symmetry": dynamicSymmetry,
        "diamond-grid": diamondGrid,
        "vanishing-point": vanishingPoint,
        "center-cross": centerCross,
        "quadrants": quadrants,
    };

    /**
     * Render the named overlay into an SVG string.
     * @param {string} name  - Key from the registry.
     * @param {number} width - Canvas width in pixels.
     * @param {number} height - Canvas height in pixels.
     * @returns {string} SVG inner HTML, or "" if name is "none" / unknown.
     */
    function render(name, width, height) {
        if (name === "none" || !registry[name]) return "";
        return registry[name](width, height);
    }

    /** @returns {string[]} List of available overlay keys. */
    function list() {
        return Object.keys(registry);
    }

    return { render, list, setColor, getColor };
})();
