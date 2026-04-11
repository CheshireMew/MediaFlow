"""
Pillow-based Subtitle Renderer (Placeholder)
=============================================

Alternative rendering approach that bypasses ASS/libass entirely.
Uses PIL/Pillow to render each subtitle as a transparent PNG,
then overlays them onto the video via FFmpeg's `overlay` filter.

Advantages over ASS approach:
  - Precise font metrics (real text measurement, no heuristic estimation)
  - Full control over line spacing, padding, background shape
  - No libass dependency (no libunibreak, no CJK wrapping issues)
  - Supports rounded corners, gradients, and other advanced effects

Trade-offs:
  - Requires generating one PNG per subtitle segment
  - More complex FFmpeg filter chain (one overlay per segment)
  - Potentially slower for videos with many subtitles

Architecture:
  Current (ASS):
    SRT -> TextShaper -> SubtitleWriter (ASS) -> FFmpeg subtitles filter -> libass

  Future (Pillow):
    SRT -> PillowSubtitleRenderer (PNG per segment) -> FFmpeg overlay filter chain

  The Pillow path renders text directly using freetype via Pillow,
  giving pixel-perfect control over layout, spacing, and styling,
  without any dependency on libass or the ASS format.

TODO:
  - [ ] Implement render_subtitle_image() using PIL.ImageDraw + PIL.ImageFont
  - [ ] Implement build_overlay_filter() to generate FFmpeg overlay chain
  - [ ] Integrate with VideoSynthesizer as alternative to SubtitleWriter
  - [ ] Add font discovery (system fonts, bundled fonts)
  - [ ] Support CJK text wrapping via Pillow's textbbox() for precise measurement
  - [ ] Support background box with configurable padding and opacity
  - [ ] Support vertical alignment modes (bottom/center/top)
"""

import logging

logger = logging.getLogger(__name__)


class PillowSubtitleRenderer:
    """Placeholder for Pillow-based subtitle rendering."""

    def __init__(self, **style_options):
        self.style_options = style_options
        logger.info("PillowSubtitleRenderer initialized (placeholder)")

    def render(self, text: str, width: int, height: int) -> str:
        """
        Render a subtitle text as a transparent PNG image.

        Args:
            text: Subtitle text (may contain newlines)
            width: Video width in pixels
            height: Video height in pixels

        Returns:
            Path to the generated PNG file.

        Raises:
            NotImplementedError: This is a placeholder.
        """
        raise NotImplementedError(
            "PillowSubtitleRenderer is a placeholder. "
            "Implement render() to replace ASS-based subtitle rendering."
        )
