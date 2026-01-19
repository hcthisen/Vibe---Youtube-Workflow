"""
VAD Processor - Silero VAD-based silence removal.

Ported from Initial Templates - execution/jump_cut_vad.py
"""
import subprocess
import tempfile
import os
import re
import logging
import shutil
import threading
from typing import List, Tuple

logger = logging.getLogger(__name__)


_silero_lock = threading.Lock()
_silero_model = None
_silero_utils = None

_hardware_encoder_available = None


def _check_hardware_encoder_available(encoder: str) -> bool:
    try:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return encoder in (result.stdout or "")
    except Exception:
        return False


def get_cached_encoder_args() -> list[str]:
    """
    Return FFmpeg video encoder args, preferring hardware encoding when available.

    Currently detects Apple Silicon's `h264_videotoolbox` and falls back to libx264.
    """
    global _hardware_encoder_available

    if _hardware_encoder_available is None:
        _hardware_encoder_available = _check_hardware_encoder_available("h264_videotoolbox")
        if _hardware_encoder_available:
            logger.info("Hardware encoding enabled (h264_videotoolbox)")
        else:
            logger.info("Using software encoding (libx264)")

    if _hardware_encoder_available:
        return ["-c:v", "h264_videotoolbox", "-b:v", "10M"]

    return ["-c:v", "libx264", "-preset", "fast", "-crf", "18"]


def _has_stream(input_path: str, stream_selector: str) -> bool:
    ffprobe_path = shutil.which("ffprobe")
    if not ffprobe_path:
        ffmpeg_path = shutil.which("ffmpeg")
        if not ffmpeg_path:
            return True

        result = subprocess.run(
            [ffmpeg_path, "-hide_banner", "-i", input_path],
            capture_output=True,
            text=True,
        )
        combined = f"{result.stderr or ''}\n{result.stdout or ''}"
        if stream_selector == "a":
            return bool(re.search(r"Stream #\d+:\d+(?:\([^)]*\))?: Audio:", combined))
        if stream_selector == "v":
            return bool(re.search(r"Stream #\d+:\d+(?:\([^)]*\))?: Video:", combined))
        return True

    cmd = [
        ffprobe_path,
        "-v",
        "error",
        "-select_streams",
        stream_selector,
        "-show_entries",
        "stream=index",
        "-of",
        "csv=p=0",
        input_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return True

    return bool((result.stdout or "").strip())


def extract_audio(video_path: str, audio_path: str, sample_rate: int = 16000):
    """Extract audio from video as WAV for VAD processing."""
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-ar", str(sample_rate), "-ac", "1",
        "-acodec", "pcm_s16le",
        "-loglevel", "error", audio_path
    ]
    subprocess.run(cmd, capture_output=True, check=True)


def get_speech_timestamps_silero(
    audio_path: str,
    min_speech_duration: float = 0.25,
    min_silence_duration: float = 0.5
) -> List[Tuple[float, float]]:
    """
    Use Silero VAD to detect speech segments.
    Returns list of (start, end) tuples in seconds.
    """
    import torch

    global _silero_model, _silero_utils
    if _silero_model is None or _silero_utils is None:
        with _silero_lock:
            if _silero_model is None or _silero_utils is None:
                model, utils = torch.hub.load(
                    repo_or_dir="snakers4/silero-vad",
                    model="silero_vad",
                    force_reload=False,
                    trust_repo=True,
                )
                _silero_model = model
                _silero_utils = utils

    model = _silero_model
    utils = _silero_utils

    (get_speech_timestamps, save_audio, read_audio, VADIterator, collect_chunks) = utils

    # Read audio
    SAMPLE_RATE = 16000
    wav = read_audio(audio_path, sampling_rate=SAMPLE_RATE)

    # Get speech timestamps
    speech_timestamps = get_speech_timestamps(
        wav,
        model,
        sampling_rate=SAMPLE_RATE,
        threshold=0.5,
        min_speech_duration_ms=int(min_speech_duration * 1000),
        min_silence_duration_ms=int(min_silence_duration * 1000),
        speech_pad_ms=100,
    )

    # Convert from samples to seconds
    segments = []
    for ts in speech_timestamps:
        start_sec = ts['start'] / SAMPLE_RATE
        end_sec = ts['end'] / SAMPLE_RATE
        segments.append((start_sec, end_sec))

    return segments


def merge_close_segments(
    segments: List[Tuple[float, float]],
    max_gap: float
) -> List[Tuple[float, float]]:
    """Merge segments that are very close together."""
    if not segments:
        return []

    merged = [segments[0]]
    for start, end in segments[1:]:
        prev_start, prev_end = merged[-1]

        # If gap is small enough, merge
        if start - prev_end <= max_gap:
            merged[-1] = (prev_start, end)
        else:
            merged.append((start, end))

    return merged


def add_padding(
    segments: List[Tuple[float, float]],
    padding_s: float,
    duration: float
) -> List[Tuple[float, float]]:
    """Add padding around segments and merge any overlaps."""
    if not segments:
        return []

    padded = []
    for start, end in segments:
        new_start = max(0, start - padding_s)
        new_end = min(duration, end + padding_s)
        padded.append((new_start, new_end))

    # Merge overlapping segments
    merged = [padded[0]]
    for start, end in padded[1:]:
        prev_start, prev_end = merged[-1]
        if start <= prev_end:
            merged[-1] = (prev_start, max(prev_end, end))
        else:
            merged.append((start, end))

    return merged


def get_duration(video_path: str) -> float:
    """Get video duration in seconds.

    Tries `ffprobe` first (preferred). If `ffprobe` is unavailable, falls back to
    parsing `ffmpeg` output.
    """
    ffprobe_path = shutil.which("ffprobe")
    if ffprobe_path:
        cmd = [
            ffprobe_path,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            video_path,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return float(result.stdout.strip())
        except subprocess.CalledProcessError as e:
            details = (e.stderr or "").strip() or (e.stdout or "").strip() or str(e)
            raise RuntimeError(f"ffprobe failed to read duration for '{video_path}': {details}")
        except ValueError:
            raise RuntimeError(
                f"ffprobe returned a non-numeric duration for '{video_path}': {result.stdout!r}"
            )

    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        raise RuntimeError(
            "Required tool 'ffprobe' was not found (and 'ffmpeg' is also missing). "
            "Install FFmpeg (includes ffprobe) and ensure it's on your PATH. "
            "macOS (Homebrew): `brew install ffmpeg`."
        )

    # Fallback: parse the "Duration: HH:MM:SS.xx" line from ffmpeg output.
    result = subprocess.run(
        [ffmpeg_path, "-hide_banner", "-i", video_path],
        capture_output=True,
        text=True,
    )
    combined = f"{result.stderr or ''}\n{result.stdout or ''}"
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", combined)
    if not match:
        tail = "\n".join(combined.strip().splitlines()[-8:])
        raise RuntimeError(
            "Unable to determine video duration. 'ffprobe' is missing and parsing 'ffmpeg' output failed. "
            "Ensure FFmpeg is installed and the input file is readable.\n"
            f"ffmpeg output (tail):\n{tail}"
        )

    hours = int(match.group(1))
    minutes = int(match.group(2))
    seconds = float(match.group(3))
    return hours * 3600 + minutes * 60 + seconds


def concatenate_segments(
    input_path: str,
    segments: List[Tuple[float, float]],
    output_path: str
):
    """Extract and concatenate video segments using a single FFmpeg pass."""
    if not segments:
        # No cuts needed, just copy
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
            capture_output=True,
            check=True
        )
        return

    logger.info(f"Concatenating {len(segments)} segments...")

    try:
        duration = get_duration(input_path)
        if (
            len(segments) == 1
            and segments[0][0] <= 0.001
            and segments[0][1] >= max(0.0, duration - 0.001)
        ):
            subprocess.run(
                ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
                capture_output=True,
                check=True,
            )
            return
    except Exception:
        pass

    has_audio = _has_stream(input_path, "a")

    filter_lines: list[str] = []
    concat_inputs: list[str] = []
    for i, (start, end) in enumerate(segments):
        filter_lines.append(
            f"[0:v]trim=start={start:.6f}:end={end:.6f},setpts=PTS-STARTPTS[v{i}];"
        )
        concat_inputs.append(f"[v{i}]")
        if has_audio:
            filter_lines.append(
                f"[0:a]atrim=start={start:.6f}:end={end:.6f},asetpts=PTS-STARTPTS[a{i}];"
            )
            concat_inputs.append(f"[a{i}]")

    if has_audio:
        filter_lines.append(
            f"{''.join(concat_inputs)}concat=n={len(segments)}:v=1:a=1[outv][outa]"
        )
    else:
        filter_lines.append(
            f"{''.join(concat_inputs)}concat=n={len(segments)}:v=1:a=0[outv]"
        )

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as tmp:
        filter_script_path = tmp.name
        tmp.write("\n".join(filter_lines))

    try:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-filter_complex_script",
            filter_script_path,
            "-map",
            "[outv]",
        ]
        if has_audio:
            cmd += ["-map", "[outa]"]

        cmd += get_cached_encoder_args()
        if has_audio:
            cmd += ["-c:a", "aac", "-b:a", "192k"]

        cmd += ["-movflags", "+faststart", "-loglevel", "error", output_path]

        subprocess.run(cmd, capture_output=True, check=True)
    finally:
        if os.path.exists(filter_script_path):
            os.remove(filter_script_path)

    logger.info(f"Concatenation complete: {output_path}")


def process_video_vad(
    input_path: str,
    output_path: str,
    min_silence: float = 0.5,
    min_speech: float = 0.25,
    padding_ms: int = 100,
    merge_gap: float = 0.3,
    keep_start: bool = True
) -> dict:
    """
    Process video with Silero VAD silence removal.
    
    Returns dict with processing stats.
    """
    logger.info(f"Processing video with VAD: {input_path}")
    
    # Get video duration
    try:
        duration = get_duration(input_path)
    except Exception as e:
        return {"success": False, "error": str(e)}
    logger.info(f"Video duration: {duration:.2f}s")

    # Extract audio for VAD
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_path = tmp.name

    try:
        logger.info("Extracting audio...")
        try:
            extract_audio(input_path, audio_path)
        except FileNotFoundError as e:
            if e.filename in ("ffmpeg", "ffprobe"):
                return {
                    "success": False,
                    "error": (
                        f"Required tool '{e.filename}' was not found. Install FFmpeg (includes ffprobe) "
                        "and ensure it's on your PATH. macOS (Homebrew): `brew install ffmpeg`."
                    ),
                }
            return {"success": False, "error": str(e)}
        except subprocess.CalledProcessError as e:
            details = (
                (e.stderr or b"").decode(errors="ignore")
                if isinstance(e.stderr, (bytes, bytearray))
                else (e.stderr or "")
            )
            return {
                "success": False,
                "error": f"ffmpeg failed while extracting audio: {details.strip() or str(e)}",
            }

        # Run Silero VAD
        logger.info(f"Running Silero VAD (min_silence={min_silence}s, min_speech={min_speech}s)...")
        speech_segments = get_speech_timestamps_silero(
            audio_path,
            min_speech_duration=min_speech,
            min_silence_duration=min_silence
        )
        logger.info(f"Found {len(speech_segments)} speech segments")

    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)

    if not speech_segments:
        logger.warning("No speech detected!")
        return {
            "success": False,
            "error": "No speech detected in video"
        }

    # Merge close segments
    speech_segments = merge_close_segments(speech_segments, merge_gap)
    logger.info(f"After merging close segments: {len(speech_segments)} segments")

    # Add padding
    padding_s = padding_ms / 1000
    speech_segments = add_padding(speech_segments, padding_s, duration)
    logger.info(f"After adding {padding_ms}ms padding: {len(speech_segments)} segments")

    # Keep start: force first segment to start at 0:00
    if keep_start and speech_segments and speech_segments[0][0] > 0:
        first_start, first_end = speech_segments[0]
        speech_segments[0] = (0.0, first_end)
        logger.info("Preserving intro: extended first segment to start at 0:00")

    # Concatenate
    try:
        concatenate_segments(input_path, speech_segments, output_path)
    except FileNotFoundError as e:
        if e.filename in ("ffmpeg", "ffprobe"):
            return {
                "success": False,
                "error": (
                    f"Required tool '{e.filename}' was not found. Install FFmpeg (includes ffprobe) "
                    "and ensure it's on your PATH. macOS (Homebrew): `brew install ffmpeg`."
                ),
            }
        return {"success": False, "error": str(e)}
    except subprocess.CalledProcessError as e:
        details = (e.stderr or b"").decode(errors="ignore") if isinstance(e.stderr, (bytes, bytearray)) else (e.stderr or "")
        return {"success": False, "error": f"ffmpeg failed while cutting/concatenating: {details.strip() or str(e)}"}

    # Calculate stats
    try:
        new_duration = get_duration(output_path)
    except Exception as e:
        return {"success": False, "error": str(e)}
    removed = duration - new_duration

    return {
        "success": True,
        "original_duration_ms": int(duration * 1000),
        "processed_duration_ms": int(new_duration * 1000),
        "silence_removed_ms": int(removed * 1000),
        "segments_count": len(speech_segments),
        "speech_segments": speech_segments
    }

