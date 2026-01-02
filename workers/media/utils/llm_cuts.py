"""
LLM Cuts Analyzer - Use LLM to analyze retake markers and generate cut instructions.

This module uses OpenAI GPT-4 to intelligently analyze video transcripts with retake markers
and determine optimal cut points for video editing. It handles variable-length retake sessions,
from quick 2-3 second mistakes to long 30+ second false starts.

Key Features:
- Flexible context-aware cut detection
- Pattern recognition (quick fix, full redo, multiple attempts)
- Confidence scoring for manual review triggers
- Sentence boundary detection for natural cuts
- Robust fallback heuristics when LLM fails

Architecture:
1. Extract context window around retake markers
2. Identify retake patterns and sentence boundaries
3. Send contextual transcript to LLM with reasoning prompts
4. Parse enhanced response with confidence scores
5. Apply cuts via FFmpeg or fallback to heuristics
"""
import logging
import json
import re
import time
from typing import List, Dict, Optional, Tuple
from openai import OpenAI

logger = logging.getLogger(__name__)

# Default configuration
DEFAULT_CONTEXT_WINDOW_SECONDS = 30
DEFAULT_MIN_CONFIDENCE = 0.7
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 2.0


def extract_context_window(
    transcript_words: List[Dict],
    marker_time: float,
    window_seconds: float = DEFAULT_CONTEXT_WINDOW_SECONDS
) -> Tuple[List[Dict], int, int]:
    """
    Extract a context window of transcript around a retake marker.
    
    Args:
        transcript_words: Full transcript with word-level timestamps
        marker_time: Time of the retake marker (seconds)
        window_seconds: Size of context window before/after marker (default: 30s)
    
    Returns:
        Tuple of (context_words, start_index, end_index)
        - context_words: Words within the context window
        - start_index: Index of first word in context
        - end_index: Index of last word in context
    """
    if not transcript_words:
        return [], 0, 0
    
    start_time = max(0, marker_time - window_seconds)
    end_time = marker_time + window_seconds
    
    context_words = []
    start_index = -1
    end_index = -1
    
    for i, word in enumerate(transcript_words):
        if start_time <= word["start"] <= end_time:
            if start_index == -1:
                start_index = i
            context_words.append(word)
            end_index = i
    
    return context_words, start_index, end_index


def identify_sentence_boundaries(
    transcript_words: List[Dict],
    min_pause_seconds: float = 0.5
) -> List[int]:
    """
    Identify sentence boundaries in transcript based on punctuation and pauses.
    
    Args:
        transcript_words: Transcript with word-level timestamps
        min_pause_seconds: Minimum pause duration to consider a boundary (default: 0.5s)
    
    Returns:
        List of word indices that mark sentence boundaries
    """
    boundaries = []
    
    for i in range(len(transcript_words) - 1):
        word = transcript_words[i]["word"].strip()
        
        # Check for sentence-ending punctuation
        has_punctuation = bool(re.search(r'[.!?]$', word))
        
        # Check for pause between this word and next
        pause_duration = transcript_words[i + 1]["start"] - transcript_words[i]["end"]
        has_pause = pause_duration >= min_pause_seconds
        
        if has_punctuation or has_pause:
            boundaries.append(i)
    
    # Always include the last word as a boundary
    if transcript_words:
        boundaries.append(len(transcript_words) - 1)
    
    return boundaries


def detect_retake_pattern(
    context_words: List[Dict],
    retake_match: Dict,
    transcript_words: List[Dict]
) -> str:
    """
    Classify the type of retake pattern based on context analysis.
    
    Patterns:
    - "quick_fix": 2-5 second mistake, speaker continues same thought
    - "full_redo": 10+ second segment, speaker restarts from beginning
    - "multiple_attempts": Multiple retake markers in quick succession
    
    Args:
        context_words: Context window around the retake marker
        retake_match: The retake marker match info
        transcript_words: Full transcript for pattern detection
    
    Returns:
        Pattern type string
    """
    retake_time = retake_match["start"]
    
    # Find words before the retake marker
    before_words = [w for w in context_words if w["end"] < retake_time]
    
    if not before_words:
        return "unknown"
    
    # Calculate duration of content before retake
    first_word_time = before_words[0]["start"]
    duration_before = retake_time - first_word_time
    
    # Quick fix: short duration before retake
    if duration_before < 5.0:
        return "quick_fix"
    
    # Check for multiple retake markers nearby
    nearby_markers = [
        w for w in transcript_words
        if w.get("word", "").lower().strip(".,!?") in ["cut", "retake", "oops"]
        and abs(w["start"] - retake_time) < 20.0
        and w["start"] != retake_time
    ]
    
    if len(nearby_markers) >= 2:
        return "multiple_attempts"
    
    # Full redo: longer duration before retake
    if duration_before >= 10.0:
        return "full_redo"
    
    return "medium_segment"


def find_nearest_sentence_boundary(
    transcript_words: List[Dict],
    target_time: float,
    boundaries: List[int],
    search_direction: str = "before"
) -> Optional[float]:
    """
    Find the nearest sentence boundary to a target time.
    
    Args:
        transcript_words: Full transcript with timestamps
        target_time: Target time to search from (seconds)
        boundaries: List of word indices marking sentence boundaries
        search_direction: "before" or "after" the target time
    
    Returns:
        Timestamp of nearest boundary, or None if not found
    """
    if not boundaries or not transcript_words:
        return None
    
    if search_direction == "before":
        # Find latest boundary before target time
        for i in reversed(boundaries):
            if i < len(transcript_words) and transcript_words[i]["end"] <= target_time:
                return transcript_words[i]["end"]
    else:  # after
        # Find earliest boundary after target time
        for i in boundaries:
            if i < len(transcript_words) and transcript_words[i]["start"] >= target_time:
                return transcript_words[i]["start"]
    
    return None


def analyze_retake_cuts(
    transcript_words: List[Dict],
    retake_matches: List[Dict],
    api_key: str,
    context_window_seconds: float = DEFAULT_CONTEXT_WINDOW_SECONDS,
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
    prefer_sentence_boundaries: bool = True,
    model: str = "gpt-4",
    vad_segments: Optional[List[Tuple[float, float]]] = None
) -> List[Dict]:
    """
    Use OpenAI GPT to analyze transcript and generate intelligent cut instructions.
    
    This function provides flexible, context-aware cut detection that handles
    variable-length retake sessions. It sends contextual transcript windows to
    the LLM with reasoning prompts to determine optimal cut points.
    
    Args:
        transcript_words: Full transcript with word-level timestamps
        retake_matches: List of retake phrase matches from search
        api_key: OpenAI API key
        context_window_seconds: Size of context window around markers (default: 30s)
        min_confidence: Minimum confidence score to accept cuts (default: 0.7)
        prefer_sentence_boundaries: Use sentence boundaries for natural cuts (default: True)
        model: OpenAI model to use (default: "gpt-4")
        vad_segments: Optional VAD speech segments for better boundary detection
    
    Returns:
        List of enhanced cut instructions with confidence scores and patterns:
        [{
            "start_time": float,
            "end_time": float,
            "reason": str,
            "confidence": float,
            "pattern": str,
            "method": "llm",
            "llm_reasoning": str
        }, ...]
    """
    if not retake_matches:
        return []
    
    logger.info(f"Analyzing {len(retake_matches)} retake markers with LLM ({model})...")
    logger.info(f"  Context window: {context_window_seconds}s, Min confidence: {min_confidence}")
    
    client = OpenAI(api_key=api_key)
    
    # Pre-compute sentence boundaries for natural cuts
    sentence_boundaries = []
    if prefer_sentence_boundaries:
        sentence_boundaries = identify_sentence_boundaries(transcript_words)
        logger.info(f"  Identified {len(sentence_boundaries)} sentence boundaries")
    
    all_cuts = []
    
    # Process each retake marker separately for better context
    for idx, match in enumerate(retake_matches):
        logger.info(f"  Processing retake marker {idx + 1}/{len(retake_matches)} at {match['start']:.2f}s")
        
        # Extract context window
        context_words, start_idx, end_idx = extract_context_window(
            transcript_words,
            match["start"],
            context_window_seconds
        )
        
        if not context_words:
            logger.warning(f"  No context words found for marker at {match['start']:.2f}s")
            continue
        
        # Detect retake pattern
        pattern = detect_retake_pattern(context_words, match, transcript_words)
        logger.info(f"  Detected pattern: {pattern}")
        
        # Build contextual transcript for LLM
        context_text = "\n".join([
            f"[{w['start']:.2f}s - {w['end']:.2f}s] {w['word']}"
            for w in context_words
        ])
        
        # Build enhanced prompt with reasoning steps
        prompt = f"""You are an expert video editing assistant analyzing a retake marker in a video transcript.

**Context:**
A speaker said the retake phrase "{match['phrase']}" at {match['start']:.2f}s - {match['end']:.2f}s.
This indicates they made a mistake and want to redo that part.

**Pattern Type:** {pattern}
- quick_fix: Short 2-5 second mistake, continues same thought
- full_redo: Longer 10+ second segment, restarts completely  
- multiple_attempts: Multiple retakes in quick succession
- medium_segment: 5-10 second mistake

**Transcript Context ({context_window_seconds}s window):**
{context_text}

**Your Task:**
Analyze the content BEFORE the retake marker and determine what should be cut out.

**Think step-by-step:**
1. What was the speaker trying to say before "{match['phrase']}"?
2. Where does the mistake/unwanted content actually BEGIN?
   - Look for false starts, repeated words, or topic shifts
   - Consider sentence boundaries for natural cut points
   - The mistake might be 2 seconds or 30+ seconds before the marker
3. Where should the cut END? (Usually just before the retake phrase)
4. What will remain after the cut? Will the flow be natural?

**Important Guidelines:**
- Be FLEXIBLE with cut length - analyze context, don't assume fixed duration
- Use precise timestamps from the transcript
- The redo content AFTER "{match['phrase']}" should be KEPT
- Include the retake phrase itself in the cuts (remove it)
- Consider natural pauses and sentence boundaries
- Be conservative if unsure - better to cut less than too much

**Output Format:**
Return a JSON object with your analysis:
{{
  "cuts": [
    {{
      "start_time": <float>,
      "end_time": <float>, 
      "reason": "<clear description of what's being removed>"
    }}
  ],
  "reasoning": "<explain your decision-making process>",
  "confidence": <float 0-1, your confidence in this analysis>
}}

Include AT LEAST two cuts:
1. The mistake segment before the retake phrase
2. The retake phrase itself ({match['start']:.2f}s - {match['end']:.2f}s)

You may include additional cuts if the pattern shows multiple failed attempts."""
        
        try:
            # Call LLM with retry logic
            cuts_for_marker = _call_llm_with_retry(
                client, model, prompt, match, pattern, max_retries=DEFAULT_MAX_RETRIES
            )
            
            # Filter by confidence if needed
            if min_confidence > 0:
                original_count = len(cuts_for_marker)
                cuts_for_marker = [
                    cut for cut in cuts_for_marker 
                    if cut.get("confidence", 1.0) >= min_confidence
                ]
                if len(cuts_for_marker) < original_count:
                    logger.warning(
                        f"  Filtered {original_count - len(cuts_for_marker)} cuts below "
                        f"confidence threshold {min_confidence}"
                    )
            
            all_cuts.extend(cuts_for_marker)
            
        except Exception as e:
            logger.error(f"  LLM analysis failed for marker at {match['start']:.2f}s: {e}")
            # Fallback for this specific marker
            logger.warning(f"  Using fallback heuristic for this marker")
            fallback_cuts = generate_fallback_cuts(
                transcript_words, 
                [match],
                vad_segments=vad_segments,
                sentence_boundaries=sentence_boundaries if prefer_sentence_boundaries else None
            )
            all_cuts.extend(fallback_cuts)
    
    # Merge overlapping cuts
    all_cuts = merge_overlapping_cuts(all_cuts)
    
    logger.info(f"LLM generated {len(all_cuts)} total cut instructions")
    for cut in all_cuts:
        confidence_str = f", confidence: {cut.get('confidence', 'N/A')}" if 'confidence' in cut else ""
        pattern_str = f", pattern: {cut.get('pattern', 'N/A')}" if 'pattern' in cut else ""
        logger.info(f"  Cut: {cut['start_time']:.2f}s - {cut['end_time']:.2f}s{confidence_str}{pattern_str}")
        if 'llm_reasoning' in cut:
            logger.info(f"    Reasoning: {cut['llm_reasoning'][:100]}...")
    
    return all_cuts


def _call_llm_with_retry(
    client: OpenAI,
    model: str,
    prompt: str,
    match: Dict,
    pattern: str,
    max_retries: int = DEFAULT_MAX_RETRIES
) -> List[Dict]:
    """
    Call LLM API with retry logic and exponential backoff.
    
    Args:
        client: OpenAI client instance
        model: Model name to use
        prompt: Prompt to send
        match: Retake match info
        pattern: Detected pattern type
        max_retries: Maximum number of retry attempts
    
    Returns:
        List of cut instructions with enhanced metadata
    
    Raises:
        Exception if all retries fail
    """
    last_error = None
    
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert video editing assistant that analyzes transcripts to identify optimal cut points. You provide detailed reasoning and confidence scores."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,  # Lower temperature for more consistent results
                max_tokens=3000
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # Extract JSON from response (handle markdown code blocks)
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0].strip()
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0].strip()
            
            result = json.loads(result_text)
            
            # Extract fields
            cuts = result.get("cuts", [])
            reasoning = result.get("reasoning", "No reasoning provided")
            confidence = result.get("confidence", 0.8)
            
            # Enhance cuts with metadata
            enhanced_cuts = []
            for cut in cuts:
                enhanced_cut = {
                    "start_time": cut["start_time"],
                    "end_time": cut["end_time"],
                    "reason": cut["reason"],
                    "confidence": confidence,
                    "pattern": pattern,
                    "method": "llm",
                    "llm_reasoning": reasoning
                }
                enhanced_cuts.append(enhanced_cut)
            
            return enhanced_cuts
            
        except json.JSONDecodeError as e:
            last_error = e
            logger.warning(f"  JSON parse error on attempt {attempt + 1}/{max_retries}: {e}")
        except Exception as e:
            last_error = e
            logger.warning(f"  LLM API error on attempt {attempt + 1}/{max_retries}: {e}")
        
        # Exponential backoff before retry
        if attempt < max_retries - 1:
            delay = DEFAULT_RETRY_DELAY * (2 ** attempt)
            logger.info(f"  Retrying in {delay}s...")
            time.sleep(delay)
    
    # All retries failed
    raise Exception(f"LLM call failed after {max_retries} attempts: {last_error}")


def merge_overlapping_cuts(cuts: List[Dict]) -> List[Dict]:
    """
    Merge overlapping or adjacent cut segments.
    
    Args:
        cuts: List of cut instructions
    
    Returns:
        List of merged cut instructions
    """
    if not cuts:
        return []
    
    # Sort by start time
    sorted_cuts = sorted(cuts, key=lambda x: x["start_time"])
    
    merged = [sorted_cuts[0].copy()]
    
    for current in sorted_cuts[1:]:
        last = merged[-1]
        
        # Check if current overlaps or is adjacent to last (within 0.5s)
        if current["start_time"] <= last["end_time"] + 0.5:
            # Merge: extend the end time and combine reasons
            last["end_time"] = max(last["end_time"], current["end_time"])
            
            # Combine reasons if different
            if current["reason"] not in last["reason"]:
                last["reason"] = f"{last['reason']} + {current['reason']}"
            
            # Use lower confidence
            if "confidence" in current and "confidence" in last:
                last["confidence"] = min(last["confidence"], current["confidence"])
            
            # Keep reasoning from higher confidence cut
            if "llm_reasoning" in current and "llm_reasoning" in last:
                if current.get("confidence", 0) > last.get("confidence", 0):
                    last["llm_reasoning"] = current["llm_reasoning"]
        else:
            # No overlap, add as new cut
            merged.append(current.copy())
    
    return merged


def generate_fallback_cuts(
    transcript_words: List[Dict],
    retake_matches: List[Dict],
    vad_segments: Optional[List[Tuple[float, float]]] = None,
    sentence_boundaries: Optional[List[int]] = None
) -> List[Dict]:
    """
    Enhanced fallback heuristic if LLM fails.
    
    Uses intelligent heuristics based on:
    - Sentence boundaries for natural cuts
    - VAD segments to find silence gaps
    - Configurable lookback based on content density
    - Pattern-based duration estimation
    
    Args:
        transcript_words: Full transcript with word-level timestamps
        retake_matches: List of retake phrase matches
        vad_segments: Optional VAD speech segments for boundary detection
        sentence_boundaries: Optional pre-computed sentence boundary indices
    
    Returns:
        List of cut instructions with fallback method marker
    """
    cuts = []
    
    logger.info(f"Using enhanced fallback heuristic for {len(retake_matches)} markers")
    
    for match in retake_matches:
        retake_start = match["start"]
        retake_end = match["end"]
        
        # Determine lookback distance based on available context
        # Find the last natural break point before the retake
        
        # Strategy 1: Use sentence boundaries if available
        mistake_start = None
        if sentence_boundaries and transcript_words:
            # Find nearest sentence boundary before retake
            for boundary_idx in reversed(sentence_boundaries):
                if boundary_idx < len(transcript_words):
                    boundary_time = transcript_words[boundary_idx]["end"]
                    # Look for boundaries within reasonable range (2-30 seconds)
                    if 2.0 <= (retake_start - boundary_time) <= 30.0:
                        mistake_start = boundary_time
                        logger.info(f"  Fallback: Using sentence boundary at {mistake_start:.2f}s")
                        break
        
        # Strategy 2: Use VAD silence gaps if available and no sentence boundary found
        if mistake_start is None and vad_segments:
            for i in range(len(vad_segments) - 1):
                gap_end = vad_segments[i][1]
                gap_start_next = vad_segments[i + 1][0]
                
                # Check if there's a silence gap before the retake
                if gap_end < retake_start < gap_start_next:
                    # This retake is after a silence gap
                    if 2.0 <= (retake_start - gap_end) <= 30.0:
                        mistake_start = gap_end
                        logger.info(f"  Fallback: Using VAD gap at {mistake_start:.2f}s")
                        break
        
        # Strategy 3: Default heuristic based on speech density
        if mistake_start is None:
            # Calculate word density before retake
            words_before = [w for w in transcript_words if w["end"] <= retake_start]
            
            if len(words_before) >= 10:
                # Get last 10 words before retake
                recent_words = words_before[-10:]
                time_span = retake_start - recent_words[0]["start"]
                words_per_second = 10 / time_span if time_span > 0 else 2.0
                
                # Adjust lookback based on speech rate
                # Fast speech (3+ words/sec): shorter lookback
                # Slow speech (1-2 words/sec): longer lookback
                if words_per_second >= 3.0:
                    lookback = 8.0
                elif words_per_second >= 2.0:
                    lookback = 12.0
                else:
                    lookback = 15.0
                
                mistake_start = max(0, retake_start - lookback)
                logger.info(f"  Fallback: Using density-based lookback {lookback:.1f}s (rate: {words_per_second:.1f} w/s)")
            else:
                # Default: 10 seconds
                mistake_start = max(0, retake_start - 10.0)
                logger.info(f"  Fallback: Using default 10s lookback")
        
        mistake_end = retake_start
        
        # Cut 1: Mistake segment before retake phrase
        cuts.append({
            "start_time": mistake_start,
            "end_time": mistake_end,
            "reason": f"Mistake before '{match['phrase']}' (fallback heuristic)",
            "confidence": 0.5,  # Lower confidence for fallback
            "pattern": "fallback",
            "method": "fallback_heuristic"
        })
        
        # Cut 2: Retake phrase itself
        cuts.append({
            "start_time": retake_start,
            "end_time": retake_end,
            "reason": f"Retake phrase '{match['phrase']}'",
            "confidence": 0.9,  # High confidence for the phrase itself
            "pattern": "retake_phrase",
            "method": "fallback_heuristic"
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
    try:
        from utils.vad_processor import get_duration

        duration = get_duration(input_path)
    except Exception as e:
        logger.error(f"Failed to determine video duration: {e}")
        return {"success": False, "error": str(e)}
    
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

