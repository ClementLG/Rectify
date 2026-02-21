/**
 * Rectify — Cropper.js Manager.
 *
 * Wraps the Cropper.js library to provide a clean lifecycle API:
 * init, destroy, getData, rotate, flip, and reset.
 */

"use strict";

const CropperManager = (() => {

    /** @type {Cropper|null} */
    let cropper = null;

    /** @type {HTMLImageElement|null} */
    let imageEl = null;

    /** @type {number} Track cumulative scale for flips */
    let scaleX = 1;
    let scaleY = 1;

    /**
     * Initialise Cropper.js on the given <img> element.
     *
     * @param {HTMLImageElement} img - The image element to attach Cropper.js to.
     * @param {Function} [onReady] - Callback fired when Cropper is fully ready.
     * @returns {Cropper} The Cropper.js instance.
     */
    function init(img, onReady) {
        destroy(); // Clean up any existing instance

        imageEl = img;
        scaleX = 1;
        scaleY = 1;

        cropper = new Cropper(img, {
            viewMode: 1,
            dragMode: "crop",
            autoCropArea: 0.8,
            responsive: true,
            restore: false,
            guides: false,       // We render our own guides via SVG
            center: false,
            highlight: false,
            background: false,
            movable: true,
            zoomable: true,
            rotatable: true,
            scalable: true,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
            ready() {
                if (typeof onReady === "function") onReady();
            },
            crop(event) {
                // Dispatch a custom event so app.js can update info bars
                document.dispatchEvent(new CustomEvent("rectify:crop", {
                    detail: event.detail,
                }));
            },
        });

        return cropper;
    }

    /**
     * Destroy the current Cropper.js instance and release resources.
     */
    function destroy() {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        imageEl = null;
    }

    /**
     * Return the current crop data from Cropper.js.
     *
     * @param {boolean} [rounded=true] - Whether to round values to integers.
     * @returns {object|null} Crop data with x, y, width, height, rotate, scaleX, scaleY.
     */
    function getData(rounded = true) {
        if (!cropper) return null;
        return cropper.getData(rounded);
    }

    /**
     * Return the canvas data (dimensions / position of the image canvas).
     * @returns {object|null}
     */
    function getCanvasData() {
        if (!cropper) return null;
        return cropper.getCanvasData();
    }

    /**
     * Return the crop box data (dimensions / position of the crop rectangle).
     * @returns {object|null}
     */
    function getCropBoxData() {
        if (!cropper) return null;
        return cropper.getCropBoxData();
    }

    /**
     * Rotate the image by the given number of degrees.
     * @param {number} degrees - Degrees to rotate (positive = clockwise visually).
     */
    function rotate(degrees) {
        if (!cropper) return;
        cropper.rotate(degrees);
    }

    /**
     * Flip the image horizontally.
     */
    function flipHorizontal() {
        if (!cropper) return;
        scaleX = -scaleX;
        cropper.scaleX(scaleX);
    }

    /**
     * Flip the image vertically.
     */
    function flipVertical() {
        if (!cropper) return;
        scaleY = -scaleY;
        cropper.scaleY(scaleY);
    }

    /**
     * Reset Cropper.js to the initial state.
     */
    function reset() {
        if (!cropper) return;
        scaleX = 1;
        scaleY = 1;
        cropper.reset();
    }

    /**
     * Set the aspect ratio of the crop box.
     * @param {number} ratio - width / height. Use NaN for free crop.
     */
    function setAspectRatio(ratio) {
        if (!cropper) return;
        cropper.setAspectRatio(ratio);
    }

    /**
     * Get the cropped canvas as a Blob.
     *
     * @param {string} [type="image/png"] - MIME type.
     * @param {number} [quality=0.95] - Quality for lossy formats.
     * @returns {Promise<Blob>}
     */
    function getCroppedBlob(type = "image/png", quality = 0.95) {
        return new Promise((resolve, reject) => {
            if (!cropper) return reject(new Error("No active cropper instance."));
            cropper.getCroppedCanvas().toBlob(
                (blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed.")),
                type,
                quality
            );
        });
    }

    /**
     * Replace the image source without rebuilding the cropper.
     * @param {string} url
     */
    function replace(url) {
        if (!cropper) return;
        cropper.replace(url);
    }

    /** @returns {boolean} Whether a cropper instance is active. */
    function isActive() {
        return cropper !== null;
    }

    return {
        init,
        destroy,
        getData,
        getCanvasData,
        getCropBoxData,
        rotate,
        flipHorizontal,
        flipVertical,
        reset,
        setAspectRatio,
        getCroppedBlob,
        replace,
        isActive,
    };
})();
