"""
LLM Cuts Analyzer - Use LLM to analyze retake markers and generate cut instructions.
"""
import logging
import json
from typing import List, Dict
from openai import OpenAI

logger = logging.getLogger(__name__)


def analyze_retake_cuts(
    transcript_words: List[Dict],
    retake_matches: List[Dict],
    api_key: str
) -> List[Dict]:
    """
    Use OpenAI GPT-4 to analyze transcript and generate cut instructions.
    
    Args:
        transcript_words: Full transcript with word-level timestamps
        retake_matches: List of retake phrase matches from search
        api_key: OpenAI API key
    
    Returns:
        List of cut instructions: [{start_time, end_time, reason}, ...]
    """
    if not retake_matches:
        return []
    
    logger.info(f"Analyzing {len(retake_matches)} retake markers with LLM...")
    
    client = OpenAI(api_key=api_key)
    
    # Build context for LLM
    # Include transcript with timestamps
    transcript_text = "\n".join([
        f"[{w['start']:.2f}s - {w['end']:.2f}s] {w['word']}"
        for w in transcript_words
    ])
    
    # List retake marker locations
    retake_locations = "\n".join([
        f"- Retake phrase '{m['phrase']}' found at {m['start']:.2f}s - {m['end']:.2f}s"
        for m in retake_matches
    ])
    
    prompt = f"""You are analyzing a video transcript to identify segments that should be removed based on retake markers.

When a speaker says a retake phrase (like "cut cut"), it means:
1. They made a mistake in the PREVIOUS segment
2. They want to remove that mistake AND the retake phrase itself
3. They will redo the content after the retake phrase

Your task:
- For each retake phrase, identify the segment BEFORE it that contains the mistake
- Also mark the retake phrase segment itself for removal
- The redo content (after the retake phrase) should be KEPT

Transcript with timestamps:
{transcript_text}

Retake markers found:
{retake_locations}

Generate cut instructions in JSON format. For each retake marker, create TWO cuts:
1. The segment containing the mistake (before the retake phrase)
2. The retake phrase segment itself

Return ONLY a JSON array with this structure:
[
  {{
    "start_time": <start in seconds>,
    "end_time": <end in seconds>,
    "reason": "<description of what's being removed>"
  }},
  ...
]

Important:
- Use precise timestamps from the transcript
- The mistake segment typically ends just before the retake phrase
- Include natural pause/silence in the cuts
- Be conservative - better to cut less than too much
"""
    
    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a video editing assistant that analyzes transcripts to identify segments to remove."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=2000
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Extract JSON from response (handle markdown code blocks)
        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0].strip()
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0].strip()
        
        cut_instructions = json.loads(result_text)
        
        logger.info(f"LLM generated {len(cut_instructions)} cut instructions")
        for cut in cut_instructions:
            logger.info(f"  Cut: {cut['start_time']:.2f}s - {cut['end_time']:.2f}s ({cut['reason']})")
        
        return cut_instructions
        
    except Exception as e:
        logger.error(f"LLM analysis failed: {e}")
        # Fallback: simple heuristic cuts
        logger.warning("Falling back to simple heuristic cuts")
        return generate_fallback_cuts(transcript_words, retake_matches)


def generate_fallback_cuts(
    transcript_words: List[Dict],
    retake_matches: List[Dict]
) -> List[Dict]:
    """
    Fallback heuristic if LLM fails.
    
    Simple rule: Remove retake phrase + previous 10 seconds.
    """
    cuts = []
    
    for match in retake_matches:
        retake_start = match["start"]
        retake_end = match["end"]
        
        # Cut 1: Previous segment (10 seconds before retake phrase)
        mistake_start = max(0, retake_start - 10.0)
        mistake_end = retake_start
        
        cuts.append({
            "start_time": mistake_start,
            "end_time": mistake_end,
            "reason": f"Mistake before '{match['phrase']}'"
        })
        
        # Cut 2: Retake phrase itself
        cuts.append({
            "start_time": retake_start,
            "end_time": retake_end,
            "reason": f"Retake phrase '{match['phrase']}'"
        })
    
    return cuts


def apply_cuts_to_video(
    input_path: str,
    output_path: str,
    cut_instructions: List[Dict],
    original_segments: List[tuple]
) -> dict:
    """
    Apply LLM-generated cuts to video.
    
    Args:
        input_path: Input video path
        output_path: Output video path
        cut_instructions: List of {start_time, end_time, reason} dicts
        original_segments: Original speech segments from VAD
    
    Returns:
        Dict with processing stats
    """
    import subprocess
    import tempfile
    import os
    
    if not cut_instructions:
        # No cuts, just copy
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
            capture_output=True,
            check=True
        )
        return {
            "success": True,
            "cuts_applied": 0
        }
    
    logger.info(f"Applying {len(cut_instructions)} cuts to video...")
    
    # Build keep segments (inverse of cuts)
    # Start with full duration
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", input_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    duration = float(result.stdout.strip())
    
    # Sort cuts by start time
    sorted_cuts = sorted(cut_instructions, key=lambda x: x["start_time"])
    
    # Generate keep segments
    keep_segments = []
    current_time = 0.0
    
    for cut in sorted_cuts:
        # Keep segment before this cut
        if current_time < cut["start_time"]:
            keep_segments.append((current_time, cut["start_time"]))
        current_time = max(current_time, cut["end_time"])
    
    # Keep remaining segment after last cut
    if current_time < duration:
        keep_segments.append((current_time, duration))
    
    logger.info(f"Generated {len(keep_segments)} keep segments from cuts")
    
    # Concatenate keep segments
    with tempfile.TemporaryDirectory() as tmpdir:
        segment_files = []

        for i, (start, end) in enumerate(keep_segments):
            seg_path = os.path.join(tmpdir, f"seg_{i:04d}.mp4")
            seg_duration = end - start

            cmd = [
                "ffmpeg", "-y",
                "-i", input_path,
                "-ss", str(start),
                "-t", str(seg_duration),
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
    
    logger.info(f"Cuts applied successfully: {output_path}")
    
    return {
        "success": True,
        "cuts_applied": len(cut_instructions),
        "keep_segments": keep_segments
    }

