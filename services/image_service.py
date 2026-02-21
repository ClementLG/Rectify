"""
Rectify — Image Processing Service.

Provides the core image manipulation pipeline: crop, rotate, and flip
operations powered by Pillow.  All transformations operate on copies,
leaving the original file untouched.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from PIL import Image


@dataclass(frozen=True)
class CropParams:
    """Immutable value object describing a crop + transform request.

    Attributes:
        x: Left edge of the crop rectangle (pixels).
        y: Top edge of the crop rectangle (pixels).
        width: Width of the crop rectangle (pixels).
        height: Height of the crop rectangle (pixels).
        rotate: Clockwise rotation in degrees (applied *before* cropping).
        flip_h: Mirror the result horizontally.
        flip_v: Mirror the result vertically.
    """

    x: float
    y: float
    width: float
    height: float
    rotate: float = 0.0
    flip_h: bool = False
    flip_v: bool = False
    quality: int = 100


class ImageService:
    """Stateless service for image crop / rotate / flip operations."""

    @staticmethod
    def crop(image: Image.Image, x: float, y: float,
             width: float, height: float) -> Image.Image:
        """Crop *image* to the given rectangle.

        Args:
            image: Source Pillow ``Image``.
            x: Left coordinate.
            y: Top coordinate.
            width: Rectangle width.
            height: Rectangle height.

        Returns:
            A new ``Image`` containing only the selected region.
        """
        box = (int(x), int(y), int(x + width), int(y + height))
        return image.crop(box)

    @staticmethod
    def rotate(image: Image.Image, degrees: float) -> Image.Image:
        """Rotate *image* counter-clockwise by *degrees*.

        Args:
            image: Source Pillow ``Image``.
            degrees: Rotation angle.  Positive = counter-clockwise.

        Returns:
            A new rotated ``Image`` with expanded canvas.
        """
        if degrees == 0:
            return image
        return image.rotate(degrees, resample=Image.BICUBIC, expand=True)

    @staticmethod
    def flip(image: Image.Image, horizontal: bool = False,
             vertical: bool = False) -> Image.Image:
        """Mirror *image* along the requested axes.

        Args:
            image: Source Pillow ``Image``.
            horizontal: Flip left ↔ right.
            vertical: Flip top ↔ bottom.

        Returns:
            The transformed ``Image``.
        """
        if horizontal:
            image = image.transpose(Image.FLIP_LEFT_RIGHT)
        if vertical:
            image = image.transpose(Image.FLIP_TOP_BOTTOM)
        return image

    @classmethod
    def process(cls, source_path: Path, params: CropParams,
                output_dir: Path) -> Path:
        """Run the full crop → rotate → flip pipeline and persist the result.

        Args:
            source_path: Path to the original uploaded image.
            params: A ``CropParams`` instance describing the transformations.
            output_dir: Directory where the result will be saved.

        Returns:
            ``Path`` to the saved output image.

        Raises:
            FileNotFoundError: If *source_path* does not exist.
            PIL.UnidentifiedImageError: If the file is not a valid image.
        """
        with Image.open(source_path) as img:
            # Preserve EXIF orientation
            img = _apply_exif_orientation(img)

            # 1. Rotate (before crop, matching Cropper.js behaviour)
            img = cls.rotate(img, params.rotate)

            # 2. Crop
            img = cls.crop(img, params.x, params.y,
                           params.width, params.height)

            # 3. Flip
            img = cls.flip(img, params.flip_h, params.flip_v)

            # Save with user-chosen quality (clamped 1–100)
            q = max(1, min(100, params.quality))
            ext = source_path.suffix.lower()
            out_name = f"cropped_{uuid.uuid4().hex[:8]}{ext}"
            out_path = output_dir / out_name

            save_kwargs: dict = {}
            if ext in (".jpg", ".jpeg"):
                save_kwargs["quality"] = q
                save_kwargs["subsampling"] = 0
            elif ext == ".png":
                save_kwargs["compress_level"] = 6  # lossless, quality N/A
            elif ext == ".webp":
                save_kwargs["quality"] = q

            img.save(out_path, **save_kwargs)
            return out_path


def _apply_exif_orientation(image: Image.Image) -> Image.Image:
    """Auto-rotate an image according to its EXIF Orientation tag.

    Args:
        image: A Pillow ``Image`` that may contain EXIF data.

    Returns:
        The correctly oriented ``Image``.
    """
    try:
        from PIL import ExifTags

        exif = image.getexif()
        orientation_key = next(
            (k for k, v in ExifTags.TAGS.items() if v == "Orientation"), None
        )
        if orientation_key is None:
            return image

        orientation = exif.get(orientation_key)
        transforms = {
            2: Image.FLIP_LEFT_RIGHT,
            3: Image.ROTATE_180,
            4: Image.FLIP_TOP_BOTTOM,
            5: Image.TRANSPOSE,
            6: Image.ROTATE_270,
            7: Image.TRANSVERSE,
            8: Image.ROTATE_90,
        }
        if orientation in transforms:
            image = image.transpose(transforms[orientation])
    except Exception:
        pass  # Graceful degradation if EXIF is missing or corrupt

    return image
