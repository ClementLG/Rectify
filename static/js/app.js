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
    const rotationSlider = document.getElementById("rotation-slider");
    const rotationValue = document.getElementById("rotation-value");
    const btnRotateLeft = document.getElementById("btn-rotate-left");
    const btnRotateRight = document.getElementById("btn-rotate-right");
    const btnFlipH = document.getElementById("btn-flip-h");
    const btnFlipV = document.getElementById("btn-flip-v");
    const btnLockRatio = document.getElementById("btn-lock-ratio");
    const gridColorPicker = document.getElementById("grid-color-picker");
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
    const qualitySlider = document.getElementById("quality-slider");
    const qualityValue = document.getElementById("quality-value");

    // ── State ───────────────────────────────────────────────────────────
    const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]')?.content || "";
    const DEFAULT_OVERLAY = document.querySelector('meta[name="default-overlay"]')?.content || "rule-of-thirds";

    let currentFilename = null;
    let currentSessionId = null;
    let originalWidth = 0;
    let originalHeight = 0;
    let aspectLocked = false;
    let lastCropPayload = null;  // stored for quality re-export
    let pendingResultFilename = null; // stored for Continue Editing

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
        pendingResultFilename = null;
        fileInput.value = "";
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

        // Reset rotation slider
        rotationSlider.value = 0;
        rotationValue.textContent = "0°";

        // Reset lock state
        aspectLocked = false;
        btnLockRatio.classList.remove("is-active");
        btnLockRatio.querySelector("i").className = "fas fa-lock-open";

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

            // Sync rotation slider if not actively dragging it
            if (document.activeElement !== rotationSlider) {
                let deg = data.rotate || 0;
                // Normalize to -179...180 range
                deg = ((deg % 360) + 360) % 360;
                if (deg > 180) deg -= 360;

                rotationSlider.value = deg;
                rotationValue.textContent = deg + "°";
            }
        }
    }

    // ── Toolbar Event Handlers ──────────────────────────────────────────

    overlaySelect.addEventListener("change", updateOverlay);

    opacitySlider.addEventListener("input", () => {
        opacityValue.textContent = opacitySlider.value + "%";
        overlaySvg.style.opacity = parseInt(opacitySlider.value, 10) / 100;
    });

    rotationSlider.addEventListener("input", () => {
        const degree = parseInt(rotationSlider.value, 10);
        rotationValue.textContent = degree + "°";
        CropperManager.rotateTo(degree);
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
        // Reset lock state on reset
        aspectLocked = false;
        btnLockRatio.classList.remove("is-active");
        btnLockRatio.querySelector("i").className = "fas fa-lock-open";
    });

    btnNew.addEventListener("click", switchToUpload);

    // ── Lock Aspect Ratio ───────────────────────────────────────────────

    function toggleAspectLock() {
        aspectLocked = !aspectLocked;
        if (aspectLocked) {
            const data = CropperManager.getData(true);
            if (data && data.width && data.height) {
                CropperManager.setAspectRatio(data.width / data.height);
            }
            btnLockRatio.classList.add("is-active");
            btnLockRatio.querySelector("i").className = "fas fa-lock";
        } else {
            CropperManager.setAspectRatio(NaN);
            btnLockRatio.classList.remove("is-active");
            btnLockRatio.querySelector("i").className = "fas fa-lock-open";
        }
    }

    btnLockRatio.addEventListener("click", toggleAspectLock);

    // ── Grid Color Picker ───────────────────────────────────────────────

    gridColorPicker.addEventListener("input", () => {
        Overlays.setColor(gridColorPicker.value);
        updateOverlay();
    });

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
            quality: 100,
        };

        // Store for potential re-export at different quality
        lastCropPayload = { ...payload };

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

                // Reset quality slider to maximum
                qualitySlider.value = 100;
                qualityValue.textContent = "100%";

                const downloadUrl = `/api/download/${result.session_id}/${result.filename}`;
                btnDownload.href = downloadUrl;
                btnDownload.download = result.filename;

                // Show instant client-side preview
                const canvas = CropperManager.getCroppedCanvas();
                if (canvas) {
                    previewImage.src = canvas.toDataURL("image/png");
                } else {
                    previewImage.src = downloadUrl;
                }

                downloadModal.classList.add("is-active");

                // Store for "Continue Editing" without modifying active state yet
                // This prevents state drift if the user closes the modal.
                pendingResultFilename = result.filename;
            })
            .catch(err => {
                hideLoading();
                showError("Crop failed. Please try again.");
                console.error("Crop error:", err);
            });
    });

    // ── Quality Slider ──────────────────────────────────────────────────

    qualitySlider.addEventListener("input", () => {
        qualityValue.textContent = qualitySlider.value + "%";
    });

    /**
     * When the user clicks Download, re-crop at the chosen quality
     * (if quality < 100) to produce a smaller file, then trigger download.
     */
    btnDownload.addEventListener("click", (e) => {
        const chosenQuality = parseInt(qualitySlider.value, 10);

        // If quality is already 100, the current file is fine — let the
        // default <a href download> behaviour handle it.
        if (chosenQuality >= 100 || !lastCropPayload) return;

        e.preventDefault();
        showLoading();

        const reExportPayload = { ...lastCropPayload, quality: chosenQuality };

        apiFetch("/api/crop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reExportPayload),
        })
            .then(res => res.json())
            .then(result => {
                hideLoading();
                if (result.error) {
                    console.error("Re-export error:", result.error);
                    return;
                }
                // Trigger download of the re-exported file
                const url = `/api/download/${result.session_id}/${result.filename}`;
                const a = document.createElement("a");
                a.href = url;
                a.download = result.filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
            })
            .catch(err => {
                hideLoading();
                console.error("Re-export error:", err);
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
        if (pendingResultFilename && currentSessionId) {
            currentFilename = pendingResultFilename;
            editorImage.src = `/api/download/${currentSessionId}/${currentFilename}`;
            editorImage.onload = () => {
                CropperManager.destroy();
                initEditor();
            };
            pendingResultFilename = null;
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
            case "l":
                e.preventDefault();
                toggleAspectLock();
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
