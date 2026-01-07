"""
Audio normalization utilities for YouTube loudness targets.
"""
import logging
import shutil
import subprocess

logger = logging.getLogger(__name__)

DEFAULT_TARGET_LUFS = -14.0
DEFAULT_TRUE_PEAK = -1.5
DEFAULT_LRA = 11.0
DEFAULT_AUDIO_BITRATE = "192k"


def _has_audio_stream(input_path: str) -> bool:
    """Return True if the input contains at least one audio stream."""
    ffprobe_path = shutil.which("ffprobe")
    if not ffprobe_path:
        logger.warning("ffprobe not found; assuming audio exists for %s", input_path)
        return True

    cmd = [
        ffprobe_path,
        "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=index",
        "-of", "csv=p=0",
        input_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        details = (result.stderr or "").strip() or (result.stdout or "").strip()
        logger.warning("ffprobe failed to inspect audio streams: %s", details or "unknown error")
        return True

    return bool(result.stdout.strip())


def normalize_audio_loudness(
    input_path: str,
    output_path: str,
    target_lufs: float = DEFAULT_TARGET_LUFS,
    true_peak_db: float = DEFAULT_TRUE_PEAK,
    lra: float = DEFAULT_LRA,
    audio_bitrate: str = DEFAULT_AUDIO_BITRATE,
) -> dict:
    """
    Normalize audio loudness using FFmpeg loudnorm filter.

    Returns:
        Dict with success status, normalization status, and settings.
    """
    if not _has_audio_stream(input_path):
        shutil.copy(input_path, output_path)
        return {
            "success": True,
            "normalized": False,
            "status": "skipped_no_audio",
            "note": "No audio stream detected; copied input without changes.",
        }

    filter_arg = f"loudnorm=I={target_lufs}:TP={true_peak_db}:LRA={lra}"
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-c:v", "copy",
        "-af", filter_arg,
        "-c:a", "aac",
        "-b:a", audio_bitrate,
        "-movflags", "+faststart",
        "-loglevel", "error",
        output_path,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError as e:
        if e.filename in ("ffmpeg", "ffprobe"):
            return {
                "success": False,
                "error": (
                    f"Required tool '{e.filename}' was not found. Install FFmpeg "
                    "(includes ffprobe) and ensure it's on your PATH."
                ),
            }
        return {"success": False, "error": str(e)}

    if result.returncode != 0:
        details = (result.stderr or "").strip() or (result.stdout or "").strip()
        return {
            "success": False,
            "error": f"ffmpeg failed to normalize audio: {details or 'unknown error'}",
        }

    return {
        "success": True,
        "normalized": True,
        "status": "applied",
        "target_lufs": target_lufs,
        "true_peak_db": true_peak_db,
        "lra": lra,
        "audio_bitrate": audio_bitrate,
    }
