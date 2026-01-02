"""
Test Suite for LLM-Based Retake Detection

Tests various retake scenarios:
- Quick fixes (2-3 second mistakes)
- Full redos (20+ second false starts)
- Multiple attempts (3+ tries)
- Edge cases (no context, multiple markers nearby)
- Fallback heuristics
- API failure scenarios
"""
import pytest
import json
from typing import List, Dict
from unittest.mock import Mock, patch, MagicMock

# Import functions to test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.llm_cuts import (
    analyze_retake_cuts,
    extract_context_window,
    identify_sentence_boundaries,
    detect_retake_pattern,
    generate_fallback_cuts,
    merge_overlapping_cuts,
    find_nearest_sentence_boundary
)


# ===== Test Fixtures =====

@pytest.fixture
def sample_transcript():
    """Sample transcript with word-level timestamps."""
    return [
        {"word": "So", "start": 10.0, "end": 10.2},
        {"word": "today", "start": 10.2, "end": 10.5},
        {"word": "we're", "start": 10.5, "end": 10.8},
        {"word": "going", "start": 10.8, "end": 11.0},
        {"word": "to", "start": 11.0, "end": 11.2},
        {"word": "talk", "start": 11.2, "end": 11.5},
        {"word": "about", "start": 11.5, "end": 11.8},
        {"word": "um", "start": 12.0, "end": 12.2},
        {"word": "actually", "start": 12.2, "end": 12.6},
        {"word": "cut", "start": 13.0, "end": 13.3},
        {"word": "cut", "start": 13.3, "end": 13.6},
        {"word": "So", "start": 14.0, "end": 14.2},
        {"word": "today", "start": 14.2, "end": 14.5},
        {"word": "we're", "start": 14.5, "end": 14.8},
        {"word": "covering", "start": 14.8, "end": 15.2},
        {"word": "the", "start": 15.2, "end": 15.4},
        {"word": "basics", "start": 15.4, "end": 15.8},
        {"word": ".", "start": 15.8, "end": 15.9},
    ]


@pytest.fixture
def long_transcript():
    """Longer transcript with false start (20+ seconds)."""
    words = []
    time = 30.0
    
    # False start (20 seconds)
    false_start = ["So", "today", "we're", "going", "to", "talk", "about", "machine", "learning", 
                   "and", "how", "it", "works", "in", "practice", "with", "real", "examples", 
                   "from", "industry"]
    for word in false_start:
        words.append({"word": word, "start": time, "end": time + 0.3})
        time += 0.4
    
    # Retake marker
    words.extend([
        {"word": "cut", "start": 50.0, "end": 50.3},
        {"word": "cut", "start": 50.3, "end": 50.6},
    ])
    
    # Successful take
    time = 51.0
    success = ["Welcome", "everyone", ".", "Today", "we're", "covering", "machine", "learning", "."]
    for word in success:
        words.append({"word": word, "start": time, "end": time + 0.3})
        time += 0.4
    
    return words


@pytest.fixture
def multiple_attempts_transcript():
    """Transcript with 3 retake attempts."""
    return [
        # Attempt 1
        {"word": "The", "start": 40.0, "end": 40.2},
        {"word": "three", "start": 40.2, "end": 40.5},
        {"word": "main", "start": 40.5, "end": 40.8},
        {"word": "points", "start": 40.8, "end": 41.2},
        {"word": "are", "start": 41.2, "end": 41.5},
        {"word": "cut", "start": 45.0, "end": 45.3},
        {"word": "cut", "start": 45.3, "end": 45.6},
        # Attempt 2
        {"word": "So", "start": 46.0, "end": 46.2},
        {"word": "the", "start": 46.2, "end": 46.4},
        {"word": "three", "start": 46.4, "end": 46.7},
        {"word": "key", "start": 46.7, "end": 47.0},
        {"word": "concepts", "start": 47.0, "end": 47.5},
        {"word": "oops", "start": 52.0, "end": 52.4},
        # Attempt 3 (successful)
        {"word": "Alright", "start": 53.0, "end": 53.4},
        {"word": "the", "start": 53.4, "end": 53.6},
        {"word": "three", "start": 53.6, "end": 53.9},
        {"word": "essential", "start": 53.9, "end": 54.5},
        {"word": "points", "start": 54.5, "end": 54.9},
    ]


@pytest.fixture
def quick_fix_retake():
    """Retake match for quick fix scenario."""
    return {
        "phrase": "cut cut",
        "start": 13.0,
        "end": 13.6,
        "word_index": 9
    }


@pytest.fixture
def full_redo_retake():
    """Retake match for full redo scenario."""
    return {
        "phrase": "cut cut",
        "start": 50.0,
        "end": 50.6,
        "word_index": 20
    }


# ===== Test Context Extraction =====

def test_extract_context_window_basic(sample_transcript):
    """Test basic context window extraction."""
    context, start_idx, end_idx = extract_context_window(
        sample_transcript,
        marker_time=13.0,
        window_seconds=5.0
    )
    
    # Should get words from 8.0s to 18.0s (5s before/after)
    assert len(context) > 0
    assert context[0]["start"] >= 8.0
    assert context[-1]["end"] <= 18.0
    assert start_idx >= 0
    assert end_idx < len(sample_transcript)


def test_extract_context_window_at_start(sample_transcript):
    """Test context window at video start."""
    context, start_idx, end_idx = extract_context_window(
        sample_transcript,
        marker_time=11.0,
        window_seconds=15.0
    )
    
    # Should start at 0.0 (can't go negative)
    assert context[0]["start"] == 10.0  # First word in transcript


def test_extract_context_window_empty():
    """Test context window with empty transcript."""
    context, start_idx, end_idx = extract_context_window(
        [],
        marker_time=10.0,
        window_seconds=5.0
    )
    
    assert context == []
    assert start_idx == 0
    assert end_idx == 0


# ===== Test Sentence Boundary Detection =====

def test_identify_sentence_boundaries(sample_transcript):
    """Test sentence boundary identification."""
    boundaries = identify_sentence_boundaries(sample_transcript)
    
    # Should find boundary at word with "." (index 17)
    assert len(boundaries) > 0
    assert 17 in boundaries  # Word with period


def test_identify_sentence_boundaries_with_pauses():
    """Test boundary detection with pauses."""
    transcript_with_pauses = [
        {"word": "First", "start": 0.0, "end": 0.3},
        {"word": "sentence", "start": 0.3, "end": 0.8},
        # 0.7s pause
        {"word": "Second", "start": 1.5, "end": 1.9},
        {"word": "sentence", "start": 1.9, "end": 2.3},
    ]
    
    boundaries = identify_sentence_boundaries(transcript_with_pauses, min_pause_seconds=0.5)
    
    # Should detect boundary at index 1 (before long pause)
    assert 1 in boundaries


def test_identify_sentence_boundaries_empty():
    """Test boundary detection with empty transcript."""
    boundaries = identify_sentence_boundaries([])
    assert boundaries == []


# ===== Test Pattern Detection =====

def test_detect_retake_pattern_quick_fix(sample_transcript, quick_fix_retake):
    """Test pattern detection for quick fix."""
    context, _, _ = extract_context_window(sample_transcript, 13.0, 10.0)
    
    pattern = detect_retake_pattern(context, quick_fix_retake, sample_transcript)
    
    # Quick fix: ~3 seconds before retake
    assert pattern == "quick_fix"


def test_detect_retake_pattern_full_redo(long_transcript, full_redo_retake):
    """Test pattern detection for full redo."""
    context, _, _ = extract_context_window(long_transcript, 50.0, 30.0)
    
    pattern = detect_retake_pattern(context, full_redo_retake, long_transcript)
    
    # Full redo: 20+ seconds before retake
    assert pattern == "full_redo"


def test_detect_retake_pattern_unknown():
    """Test pattern detection with no context."""
    pattern = detect_retake_pattern([], {"start": 10.0}, [])
    assert pattern == "unknown"


# ===== Test Fallback Heuristics =====

def test_generate_fallback_cuts_basic(sample_transcript):
    """Test basic fallback cut generation."""
    retake_matches = [
        {"phrase": "cut cut", "start": 13.0, "end": 13.6}
    ]
    
    cuts = generate_fallback_cuts(sample_transcript, retake_matches)
    
    # Should generate 2 cuts: mistake + retake phrase
    assert len(cuts) >= 2
    assert all("start_time" in cut for cut in cuts)
    assert all("end_time" in cut for cut in cuts)
    assert all("confidence" in cut for cut in cuts)
    assert all(cut["method"] == "fallback_heuristic" for cut in cuts)


def test_generate_fallback_cuts_with_sentence_boundaries(sample_transcript):
    """Test fallback with sentence boundary preference."""
    retake_matches = [{"phrase": "cut cut", "start": 13.0, "end": 13.6}]
    boundaries = identify_sentence_boundaries(sample_transcript)
    
    cuts = generate_fallback_cuts(
        sample_transcript, 
        retake_matches,
        sentence_boundaries=boundaries
    )
    
    assert len(cuts) >= 2


def test_generate_fallback_cuts_with_vad_segments(sample_transcript):
    """Test fallback with VAD segment guidance."""
    retake_matches = [{"phrase": "cut cut", "start": 13.0, "end": 13.6}]
    vad_segments = [(10.0, 12.8), (14.0, 16.0)]  # Silence gap at 12.8-14.0
    
    cuts = generate_fallback_cuts(
        sample_transcript,
        retake_matches,
        vad_segments=vad_segments
    )
    
    assert len(cuts) >= 2
    # First cut should consider VAD gap
    assert cuts[0]["start_time"] >= 10.0


def test_generate_fallback_cuts_empty():
    """Test fallback with no retake matches."""
    cuts = generate_fallback_cuts([], [])
    assert cuts == []


# ===== Test Cut Merging =====

def test_merge_overlapping_cuts_basic():
    """Test merging overlapping cuts."""
    cuts = [
        {"start_time": 10.0, "end_time": 15.0, "reason": "Cut 1", "confidence": 0.8},
        {"start_time": 14.0, "end_time": 18.0, "reason": "Cut 2", "confidence": 0.9},
        {"start_time": 20.0, "end_time": 25.0, "reason": "Cut 3", "confidence": 0.7},
    ]
    
    merged = merge_overlapping_cuts(cuts)
    
    # First two should merge, third stays separate
    assert len(merged) == 2
    assert merged[0]["start_time"] == 10.0
    assert merged[0]["end_time"] == 18.0
    assert merged[1]["start_time"] == 20.0


def test_merge_overlapping_cuts_adjacent():
    """Test merging adjacent cuts (within 0.5s)."""
    cuts = [
        {"start_time": 10.0, "end_time": 15.0, "reason": "Cut 1", "confidence": 0.8},
        {"start_time": 15.3, "end_time": 18.0, "reason": "Cut 2", "confidence": 0.9},
    ]
    
    merged = merge_overlapping_cuts(cuts)
    
    # Should merge (gap < 0.5s)
    assert len(merged) == 1
    assert merged[0]["end_time"] == 18.0


def test_merge_overlapping_cuts_empty():
    """Test merging with no cuts."""
    merged = merge_overlapping_cuts([])
    assert merged == []


# ===== Test LLM Integration (Mocked) =====

@patch('utils.llm_cuts.OpenAI')
def test_analyze_retake_cuts_success(mock_openai_class, sample_transcript):
    """Test successful LLM analysis."""
    # Mock OpenAI response
    mock_client = Mock()
    mock_openai_class.return_value = mock_client
    
    mock_response = Mock()
    mock_response.choices = [Mock()]
    mock_response.choices[0].message.content = json.dumps({
        "cuts": [
            {"start_time": 12.0, "end_time": 13.0, "reason": "Verbal filler"},
            {"start_time": 13.0, "end_time": 14.0, "reason": "Retake phrase"}
        ],
        "reasoning": "Speaker caught verbal filler mid-sentence",
        "confidence": 0.95
    })
    mock_client.chat.completions.create.return_value = mock_response
    
    retake_matches = [{"phrase": "cut cut", "start": 13.0, "end": 13.6}]
    
    cuts = analyze_retake_cuts(
        transcript_words=sample_transcript,
        retake_matches=retake_matches,
        api_key="test-key",
        context_window_seconds=10,
        min_confidence=0.7
    )
    
    # Should return LLM-generated cuts
    assert len(cuts) >= 2
    assert cuts[0]["method"] == "llm"
    assert "confidence" in cuts[0]
    assert "llm_reasoning" in cuts[0]


@patch('utils.llm_cuts.OpenAI')
def test_analyze_retake_cuts_with_markdown_response(mock_openai_class, sample_transcript):
    """Test LLM response with markdown code blocks."""
    mock_client = Mock()
    mock_openai_class.return_value = mock_client
    
    # Response with markdown
    mock_response = Mock()
    mock_response.choices = [Mock()]
    mock_response.choices[0].message.content = """```json
{
    "cuts": [
        {"start_time": 12.0, "end_time": 13.0, "reason": "Test"}
    ],
    "reasoning": "Test reasoning",
    "confidence": 0.9
}
```"""
    mock_client.chat.completions.create.return_value = mock_response
    
    retake_matches = [{"phrase": "cut cut", "start": 13.0, "end": 13.6}]
    
    cuts = analyze_retake_cuts(
        sample_transcript,
        retake_matches,
        "test-key",
        context_window_seconds=10
    )
    
    # Should parse markdown-wrapped JSON
    assert len(cuts) >= 1


@patch('utils.llm_cuts.OpenAI')
def test_analyze_retake_cuts_low_confidence_filtered(mock_openai_class, sample_transcript):
    """Test filtering of low-confidence cuts."""
    mock_client = Mock()
    mock_openai_class.return_value = mock_client
    
    mock_response = Mock()
    mock_response.choices = [Mock()]
    mock_response.choices[0].message.content = json.dumps({
        "cuts": [
            {"start_time": 12.0, "end_time": 13.0, "reason": "Test"}
        ],
        "reasoning": "Uncertain",
        "confidence": 0.5  # Below threshold
    })
    mock_client.chat.completions.create.return_value = mock_response
    
    retake_matches = [{"phrase": "cut cut", "start": 13.0, "end": 13.6}]
    
    cuts = analyze_retake_cuts(
        sample_transcript,
        retake_matches,
        "test-key",
        min_confidence=0.7  # Higher than LLM confidence
    )
    
    # Should filter out low-confidence cuts
    # Will fall back to heuristic
    assert len(cuts) >= 0


@patch('utils.llm_cuts.OpenAI')
def test_analyze_retake_cuts_api_failure_fallback(mock_openai_class, sample_transcript):
    """Test fallback when API fails."""
    mock_client = Mock()
    mock_openai_class.return_value = mock_client
    
    # Simulate API failure
    mock_client.chat.completions.create.side_effect = Exception("API Error")
    
    retake_matches = [{"phrase": "cut cut", "start": 13.0, "end": 13.6}]
    
    cuts = analyze_retake_cuts(
        sample_transcript,
        retake_matches,
        "test-key"
    )
    
    # Should fall back to heuristics
    assert len(cuts) >= 2
    assert all(cut["method"] == "fallback_heuristic" for cut in cuts)


@patch('utils.llm_cuts.OpenAI')
def test_analyze_retake_cuts_json_parse_error_fallback(mock_openai_class, sample_transcript):
    """Test fallback when JSON parsing fails."""
    mock_client = Mock()
    mock_openai_class.return_value = mock_client
    
    mock_response = Mock()
    mock_response.choices = [Mock()]
    mock_response.choices[0].message.content = "Invalid JSON response"
    mock_client.chat.completions.create.return_value = mock_response
    
    retake_matches = [{"phrase": "cut cut", "start": 13.0, "end": 13.6}]
    
    cuts = analyze_retake_cuts(
        sample_transcript,
        retake_matches,
        "test-key"
    )
    
    # Should fall back to heuristics
    assert len(cuts) >= 2
    assert all(cut["method"] == "fallback_heuristic" for cut in cuts)


# ===== Test Edge Cases =====

def test_analyze_retake_cuts_empty_matches():
    """Test with no retake matches."""
    cuts = analyze_retake_cuts(
        [],
        [],
        "test-key"
    )
    
    assert cuts == []


def test_find_nearest_sentence_boundary_before():
    """Test finding boundary before target time."""
    transcript = [
        {"word": "Hello", "start": 0.0, "end": 0.5},
        {"word": ".", "start": 0.5, "end": 0.6},
        {"word": "World", "start": 1.0, "end": 1.5},
    ]
    boundaries = [1]  # Boundary at index 1 (period)
    
    boundary_time = find_nearest_sentence_boundary(
        transcript,
        target_time=1.2,
        boundaries=boundaries,
        search_direction="before"
    )
    
    assert boundary_time == 0.6  # End of period


def test_find_nearest_sentence_boundary_after():
    """Test finding boundary after target time."""
    transcript = [
        {"word": "Hello", "start": 0.0, "end": 0.5},
        {"word": "world", "start": 0.6, "end": 1.0},
        {"word": ".", "start": 1.0, "end": 1.1},
    ]
    boundaries = [2]  # Boundary at index 2 (period)
    
    boundary_time = find_nearest_sentence_boundary(
        transcript,
        target_time=0.7,
        boundaries=boundaries,
        search_direction="after"
    )
    
    assert boundary_time == 1.0  # Start of period


def test_find_nearest_sentence_boundary_none_found():
    """Test when no boundary found."""
    boundary_time = find_nearest_sentence_boundary(
        [],
        target_time=10.0,
        boundaries=[],
        search_direction="before"
    )
    
    assert boundary_time is None


# ===== Integration Tests =====

@patch('utils.llm_cuts.OpenAI')
def test_full_pipeline_quick_fix(mock_openai_class, sample_transcript):
    """Test complete pipeline for quick fix scenario."""
    mock_client = Mock()
    mock_openai_class.return_value = mock_client
    
    mock_response = Mock()
    mock_response.choices = [Mock()]
    mock_response.choices[0].message.content = json.dumps({
        "cuts": [
            {"start_time": 11.8, "end_time": 13.0, "reason": "Removed 'um actually'"},
            {"start_time": 13.0, "end_time": 14.0, "reason": "Removed retake phrase"}
        ],
        "reasoning": "Quick verbal stumble, natural pause at 11.8s",
        "confidence": 0.95
    })
    mock_client.chat.completions.create.return_value = mock_response
    
    retake_matches = [{"phrase": "cut cut", "start": 13.0, "end": 13.6}]
    
    cuts = analyze_retake_cuts(
        sample_transcript,
        retake_matches,
        "test-key",
        context_window_seconds=10,
        min_confidence=0.7,
        prefer_sentence_boundaries=True
    )
    
    # Verify cuts
    assert len(cuts) == 2
    assert cuts[0]["start_time"] == 11.8
    assert cuts[0]["confidence"] == 0.95
    assert cuts[0]["pattern"] == "quick_fix"
    assert cuts[0]["method"] == "llm"


@patch('utils.llm_cuts.OpenAI')
def test_full_pipeline_full_redo(mock_openai_class, long_transcript):
    """Test complete pipeline for full redo scenario."""
    mock_client = Mock()
    mock_openai_class.return_value = mock_client
    
    mock_response = Mock()
    mock_response.choices = [Mock()]
    mock_response.choices[0].message.content = json.dumps({
        "cuts": [
            {"start_time": 30.0, "end_time": 50.0, "reason": "Removed false start"},
            {"start_time": 50.0, "end_time": 51.0, "reason": "Removed retake phrase"}
        ],
        "reasoning": "Speaker completely restarted introduction",
        "confidence": 0.89
    })
    mock_client.chat.completions.create.return_value = mock_response
    
    retake_matches = [{"phrase": "cut cut", "start": 50.0, "end": 50.6}]
    
    cuts = analyze_retake_cuts(
        long_transcript,
        retake_matches,
        "test-key",
        context_window_seconds=30
    )
    
    # Verify cuts
    assert len(cuts) == 2
    assert cuts[0]["end_time"] - cuts[0]["start_time"] == 20.0  # 20 second cut
    assert cuts[0]["pattern"] == "full_redo"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

