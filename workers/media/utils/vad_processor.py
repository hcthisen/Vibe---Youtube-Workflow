"""
VAD Processor - Silero VAD-based silence removal.

Ported from Initial Templates - execution/jump_cut_vad.py
"""
import subprocess
import tempfile
import os
import logging
from typing import List, Tuple

logger = logging.getLogger(__name__)


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

    # Load Silero VAD model
    model, utils = torch.hub.load(
        repo_or_dir='snakers4/silero-vad',
        model='silero_vad',
        force_reload=False,
        trust_repo=True
    )

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
    """Get video duration in seconds."""
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(result.stdout.strip())


def concatenate_segments(
    input_path: str,
    segments: List[Tuple[float, float]],
    output_path: str
):
    """Extract and concatenate video segments using FFmpeg."""
    if not segments:
        # No cuts needed, just copy
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
            capture_output=True,
            check=True
        )
        return

    logger.info(f"Concatenating {len(segments)} segments...")

    with tempfile.TemporaryDirectory() as tmpdir:
        segment_files = []

        for i, (start, end) in enumerate(segments):
            seg_path = os.path.join(tmpdir, f"seg_{i:04d}.mp4")
            duration = end - start

            # Frame-accurate cutting with re-encode
            cmd = [
                "ffmpeg", "-y",
                "-i", input_path,
                "-ss", str(start),
                "-t", str(duration),
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-loglevel", "error",
                seg_path
            ]
            subprocess.run(cmd, capture_output=True, check=True)
            segment_files.append(seg_path)

        # Create concat file
        concat_path = os.path.join(tmpdir, "concat.txt")
        with open(concat_path, "w") as f:
            for seg_path in segment_files:
                f.write(f"file '{seg_path}'\n")

        # Concatenate
        cmd = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_path,
            "-c", "copy", "-loglevel", "error", output_path
        ]
        subprocess.run(cmd, capture_output=True, check=True)

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
    duration = get_duration(input_path)
    logger.info(f"Video duration: {duration:.2f}s")

    # Extract audio for VAD
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_path = tmp.name

    try:
        logger.info("Extracting audio...")
        extract_audio(input_path, audio_path)

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
    concatenate_segments(input_path, speech_segments, output_path)

    # Calculate stats
    new_duration = get_duration(output_path)
    removed = duration - new_duration

    return {
        "success": True,
        "original_duration_ms": int(duration * 1000),
        "processed_duration_ms": int(new_duration * 1000),
        "silence_removed_ms": int(removed * 1000),
        "segments_count": len(speech_segments),
        "speech_segments": speech_segments
    }

