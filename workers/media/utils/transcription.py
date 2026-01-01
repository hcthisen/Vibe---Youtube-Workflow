"""
Transcription Utility - Local Whisper transcription with word-level timestamps.

No file size limits - local Whisper can handle any length video.
"""
import subprocess
import tempfile
import os
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


def extract_audio_for_transcription(video_path: str, audio_path: str):
    """Extract audio from video for transcription."""
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-ar", "16000", "-ac", "1",
        "-acodec", "pcm_s16le",
        "-loglevel", "error",
        audio_path
    ]
    subprocess.run(cmd, capture_output=True, check=True)


def transcribe_with_whisper(
    audio_path: str,
    model_name: str = "base"
) -> List[Dict]:
    """
    Transcribe audio with Whisper to get word-level timestamps.
    
    Returns list of {word, start, end} dicts.
    """
    import whisper

    logger.info(f"Transcribing with Whisper ({model_name})...")
    model = whisper.load_model(model_name)
    result = model.transcribe(audio_path, word_timestamps=True)

    words = []
    for segment in result.get("segments", []):
        for word_info in segment.get("words", []):
            words.append({
                "word": word_info["word"].strip(),
                "start": word_info["start"],
                "end": word_info["end"]
            })

    logger.info(f"Transcribed {len(words)} words")
    return words


def transcribe_video(
    video_path: str,
    model_name: str = "base"
) -> dict:
    """
    Transcribe video using local Whisper model.
    
    Returns dict with transcript data and plaintext version.
    """
    logger.info(f"Transcribing video: {video_path}")
    
    # Extract audio
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_path = tmp.name

    try:
        logger.info("Extracting audio for transcription...")
        extract_audio_for_transcription(video_path, audio_path)

        # Transcribe
        words = transcribe_with_whisper(audio_path, model_name)

        # Generate plaintext version
        plaintext = " ".join([w["word"] for w in words])

        return {
            "success": True,
            "words": words,
            "plaintext": plaintext,
            "word_count": len(words)
        }

    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "words": [],
            "plaintext": "",
            "word_count": 0
        }

    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)


def filter_transcript_by_time(
    words: List[Dict],
    start_time: float,
    end_time: float
) -> List[Dict]:
    """
    Filter transcript to exclude words within a time range.
    Used to remove words from cut segments.
    """
    filtered = []
    for word in words:
        # Keep words that are completely outside the cut range
        if word["end"] < start_time or word["start"] > end_time:
            filtered.append(word)
    
    return filtered


def remove_segments_from_transcript(
    words: List[Dict],
    cut_segments: List[Dict]
) -> List[Dict]:
    """
    Remove words that fall within cut segments.
    
    cut_segments: List of {start_time, end_time, reason} dicts
    """
    filtered_words = words.copy()
    
    for segment in cut_segments:
        start_time = segment["start_time"]
        end_time = segment["end_time"]
        filtered_words = filter_transcript_by_time(filtered_words, start_time, end_time)
    
    return filtered_words


def search_transcript_for_phrases(
    words: List[Dict],
    phrases: List[str]
) -> List[Dict]:
    """
    Search transcript for specific phrases.
    
    Returns list of matches with {phrase, start, end, word_index} dicts.
    """
    matches = []
    
    for phrase in phrases:
        phrase_words = phrase.lower().split()
        phrase_len = len(phrase_words)

        for i in range(len(words) - phrase_len + 1):
            # Check if this position matches the phrase
            match = True
            for j, target_word in enumerate(phrase_words):
                actual_word = words[i + j]["word"].strip().lower()
                # Remove punctuation for comparison
                actual_word = ''.join(c for c in actual_word if c.isalnum())
                if actual_word != target_word:
                    match = False
                    break

            if match:
                # Found a match
                phrase_start = words[i]["start"]
                phrase_end = words[i + phrase_len - 1]["end"]
                matches.append({
                    "phrase": phrase,
                    "start": phrase_start,
                    "end": phrase_end,
                    "word_index": i
                })
                logger.info(f"Found '{phrase}' at {phrase_start:.2f}s")

    return matches

