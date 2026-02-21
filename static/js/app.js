/**
 * Rectify — Main Application Controller.
 *
 * Orchestrates file upload, editor initialisation, overlay rendering,
 * toolbar actions (rotate, flip, crop, download), and server communication
 * via the Fetch API.
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {

    // ── DOM References ──────────────────────────────────────────────────
    const uploadSection = document.getElementById("upload-section");
    const editorSection = document.getElementById("editor-section");
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");
    const uploadError = document.getElementById("upload-error");
    const editorImage = document.getElementById("editor-image");
    const overlaySvg = document.getElementById("overlay-svg");
    const overlaySelect = document.getElementById("overlay-select");
    const opacitySlider = document.getElementById("opacity-slider");
    const opacityValue = document.getElementById("opacity-value");
    const btnRotateLeft = document.getElementById("btn-rotate-left");
    const btnRotateRight = document.getElementById("btn-rotate-right");
    const btnFlipH = document.getElementById("btn-flip-h");
    const btnFlipV = document.getElementById("btn-flip-v");
    const btnCrop = document.getElementById("btn-crop");
    const btnReset = document.getElementById("btn-reset");
    const btnNew = document.getElementById("btn-new");
    const infoDimensions = document.getElementById("info-dimensions");
    const infoCropSize = document.getElementById("info-crop-size");
    const loadingOverlay = document.getElementById("loading-overlay");
    const downloadModal = document.getElementById("download-modal");
    const previewImage = document.getElementById("preview-image");
    const btnDownload = document.getElementById("btn-download");
    const btnContinue = document.getElementById("btn-continue");
    const modalClose = document.getElementById("modal-close");

    // ── State ───────────────────────────────────────────────────────────
    const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]')?.content || "";
    const DEFAULT_OVERLAY = document.querySelector('meta[name="default-overlay"]')?.content || "rule-of-thirds";

    let currentFilename = null;
    let currentSessionId = null;
    let originalWidth = 0;
    let originalHeight = 0;

    // ── Helpers ─────────────────────────────────────────────────────────

    function showLoading() { loadingOverlay.style.display = "flex"; }
    function hideLoading() { loadingOverlay.style.display = "none"; }

    function showError(msg) {
        uploadError.querySelector(".error-text").textContent = msg;
        uploadError.style.display = "block";
    }

    function hideError() { uploadError.style.display = "none"; }

    function switchToEditor() {
        uploadSection.style.display = "none";
        editorSection.style.display = "block";
    }

    function switchToUpload() {
        editorSection.style.display = "none";
        uploadSection.style.display = "block";
        CropperManager.destroy();
        overlaySvg.innerHTML = "";
        currentFilename = null;
        currentSessionId = null;
    }

    /**
     * Make an API request with CSRF token and JSON handling.
     * @param {string} url
     * @param {object} [options]
     * @returns {Promise<Response>}
     */
    function apiFetch(url, options = {}) {
        const headers = options.headers || {};
        headers["X-CSRFToken"] = CSRF_TOKEN;
        return fetch(url, { ...options, headers });
    }

    // ── Upload Logic ────────────────────────────────────────────────────

    function handleFile(file) {
        hideError();

        const maxSize = 10 * 1024 * 1024; // 10 MB
        if (file.size > maxSize) {
            showError("File exceeds the 10 MB size limit.");
            return;
        }

        const validTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!validTypes.includes(file.type)) {
            showError("Unsupported format. Please use JPEG, PNG, or WebP.");
            return;
        }

        const formData = new FormData();
        formData.append("file", file);

        showLoading();

        apiFetch("/api/upload", { method: "POST", body: formData })
            .then(res => res.json())
            .then(data => {
                hideLoading();
                if (data.error) {
                    showError(data.error);
                    return;
                }
                currentFilename = data.filename;
                currentSessionId = data.session_id;
                originalWidth = data.width;
                originalHeight = data.height;

                infoDimensions.textContent = `${data.width} × ${data.height}`;

                // Load image into editor
                editorImage.src = `/api/download/${data.session_id}/${data.filename}`;
                editorImage.onload = () => {
                    switchToEditor();
                    initEditor();
                };
            })
            .catch(err => {
                hideLoading();
                showError("Upload failed. Please try again.");
                console.error("Upload error:", err);
            });
    }

    // Dropzone events
    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInput.click();
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("drag-over");
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("drag-over");
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("drag-over");
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    // Dismiss error notification
    uploadError.querySelector(".delete")?.addEventListener("click", hideError);

    // ── Editor Initialisation ───────────────────────────────────────────

    function initEditor() {
        // Set default overlay
        overlaySelect.value = DEFAULT_OVERLAY;
        opacitySlider.value = 50;
        opacityValue.textContent = "50%";

        CropperManager.init(editorImage, () => {
            updateOverlay();
        });
    }

    // ── Overlay Rendering ───────────────────────────────────────────────

    function updateOverlay() {
        const name = overlaySelect.value;
        const opacity = parseInt(opacitySlider.value, 10) / 100;

        const cropBoxData = CropperManager.getCropBoxData();
        if (!cropBoxData) {
            overlaySvg.innerHTML = "";
            return;
        }

        const { left, top, width, height } = cropBoxData;

        // Position SVG exactly over the crop box
        overlaySvg.style.left = left + "px";
        overlaySvg.style.top = top + "px";
        overlaySvg.style.width = width + "px";
        overlaySvg.style.height = height + "px";
        overlaySvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        overlaySvg.style.opacity = opacity;

        overlaySvg.innerHTML = Overlays.render(name, width, height);
    }

    // Listen for Cropper.js crop events to reposition overlay
    document.addEventListener("rectify:crop", () => {
        updateOverlay();
        updateCropInfo();
    });

    function updateCropInfo() {
        const data = CropperManager.getData(true);
        if (data) {
            infoCropSize.textContent = `Crop: ${data.width} × ${data.height}`;
        }
    }

    // ── Toolbar Event Handlers ──────────────────────────────────────────

    overlaySelect.addEventListener("change", updateOverlay);

    opacitySlider.addEventListener("input", () => {
        opacityValue.textContent = opacitySlider.value + "%";
        overlaySvg.style.opacity = parseInt(opacitySlider.value, 10) / 100;
    });

    btnRotateLeft.addEventListener("click", () => {
        CropperManager.rotate(-90);
    });

    btnRotateRight.addEventListener("click", () => {
        CropperManager.rotate(90);
    });

    btnFlipH.addEventListener("click", () => {
        CropperManager.flipHorizontal();
    });

    btnFlipV.addEventListener("click", () => {
        CropperManager.flipVertical();
    });

    btnReset.addEventListener("click", () => {
        CropperManager.reset();
    });

    btnNew.addEventListener("click", switchToUpload);

    // ── Crop & Download ─────────────────────────────────────────────────

    btnCrop.addEventListener("click", () => {
        const data = CropperManager.getData(true);
        if (!data || !currentFilename) return;

        const payload = {
            filename: currentFilename,
            x: data.x,
            y: data.y,
            width: data.width,
            height: data.height,
            rotate: data.rotate || 0,
            flipH: data.scaleX === -1,
            flipV: data.scaleY === -1,
        };

        showLoading();

        apiFetch("/api/crop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })
            .then(res => res.json())
            .then(result => {
                hideLoading();
                if (result.error) {
                    showError(result.error);
                    switchToUpload();
                    return;
                }

                // Show preview modal
                const downloadUrl = `/api/download/${result.session_id}/${result.filename}`;
                previewImage.src = downloadUrl;
                btnDownload.href = downloadUrl;
                btnDownload.download = result.filename;
                downloadModal.classList.add("is-active");

                // Update for continued editing
                currentFilename = result.filename;
            })
            .catch(err => {
                hideLoading();
                showError("Crop failed. Please try again.");
                console.error("Crop error:", err);
            });
    });

    // ── Modal Controls ──────────────────────────────────────────────────

    function closeModal() {
        downloadModal.classList.remove("is-active");
    }

    modalClose.addEventListener("click", closeModal);
    downloadModal.querySelector(".modal-background").addEventListener("click", closeModal);

    btnContinue.addEventListener("click", () => {
        closeModal();
        // Reload the cropped image into the editor
        if (currentFilename && currentSessionId) {
            editorImage.src = `/api/download/${currentSessionId}/${currentFilename}`;
            editorImage.onload = () => {
                CropperManager.destroy();
                initEditor();
            };
        }
    });

    // ── Keyboard Shortcuts ──────────────────────────────────────────────
    document.addEventListener("keydown", (e) => {
        if (!CropperManager.isActive()) return;
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

        switch (e.key) {
            case "Enter":
                e.preventDefault();
                btnCrop.click();
                break;
            case "r":
                e.preventDefault();
                CropperManager.rotate(90);
                break;
            case "h":
                e.preventDefault();
                CropperManager.flipHorizontal();
                break;
            case "v":
                e.preventDefault();
                CropperManager.flipVertical();
                break;
            case "Escape":
                if (downloadModal.classList.contains("is-active")) {
                    closeModal();
                } else {
                    CropperManager.reset();
                }
                break;
        }
    });
});
