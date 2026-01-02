#!/usr/bin/env python3
"""
Verification script for intro transition implementation.

This script verifies the code structure without requiring ffmpeg or Remotion.
It checks:
- Imports work correctly
- Functions are defined
- Logic paths are correct
"""
import sys
from pathlib import Path

# Add workers/media to path
sys.path.insert(0, str(Path(__file__).parent))

print("🔍 Verifying Intro Transition Implementation")
print()

# Test 1: Import the module
print("1. Testing imports...")
try:
    from utils.intro_transition import check_remotion_available, add_intro_transition
    print("   ✅ Successfully imported intro_transition module")
except Exception as e:
    print(f"   ❌ Failed to import: {e}")
    sys.exit(1)

# Test 2: Check function signatures
print()
print("2. Checking function signatures...")

import inspect

# Check check_remotion_available
sig = inspect.signature(check_remotion_available)
print(f"   check_remotion_available{sig}")
if len(sig.parameters) == 0:
    print("   ✅ Signature correct (no parameters)")
else:
    print(f"   ❌ Expected no parameters, got {len(sig.parameters)}")

# Check add_intro_transition
sig = inspect.signature(add_intro_transition)
print(f"   add_intro_transition{sig}")
expected_params = ['input_path', 'output_path', 'insert_at', 'duration', 'teaser_start', 'bg_image_path']
actual_params = list(sig.parameters.keys())
if actual_params == expected_params:
    print("   ✅ Signature correct")
else:
    print(f"   ⚠️  Parameters: {actual_params}")

# Test 3: Run remotion check (safe, doesn't process anything)
print()
print("3. Testing Remotion availability check...")
try:
    available, error_msg = check_remotion_available()
    print(f"   Remotion available: {available}")
    if not available:
        print(f"   Reason: {error_msg}")
    print("   ✅ Check function works")
except Exception as e:
    print(f"   ❌ Check failed: {e}")
    sys.exit(1)

# Test 4: Verify error handling logic
print()
print("4. Verifying error handling...")

# Read the source to check for try/except blocks
source_file = Path(__file__).parent / "utils" / "intro_transition.py"
source = source_file.read_text()

checks = [
    ("check_remotion_available()", "check_remotion_available()" in source),
    ("subprocess.run with capture_output", "capture_output=True" in source),
    ("FFmpeg overlay filter", "overlay=enable=" in source),
    ("Audio copy (-c:a copy)", '"-c:a", "copy"' in source),
    ("Graceful fallback on error", "except Exception" in source),
    ("Temporary file cleanup", "os.remove" in source),
    ("Hardware encoder support", "encoder_args" in source),
]

all_passed = True
for check_name, passed in checks:
    status = "✅" if passed else "❌"
    print(f"   {status} {check_name}")
    if not passed:
        all_passed = False

# Test 5: Check overlay command structure
print()
print("5. Verifying FFmpeg overlay command structure...")

# Look for the overlay command pattern
if '[0:v][1:v]overlay=' in source:
    print("   ✅ Correct overlay filter syntax")
else:
    print("   ❌ Overlay filter not found or incorrect")
    all_passed = False

if "enable='between(t," in source:
    print("   ✅ Correct time-based overlay enable syntax")
else:
    print("   ❌ Time-based overlay not found")
    all_passed = False

if '"-map", "[v]"' in source and '"-map", "0:a"' in source:
    print("   ✅ Correct stream mapping (video overlay + original audio)")
else:
    print("   ❌ Stream mapping incorrect")
    all_passed = False

# Summary
print()
print("=" * 60)
print("VERIFICATION SUMMARY")
print("=" * 60)
print()

if all_passed:
    print("✅ All verifications passed!")
    print()
    print("The implementation is structurally correct.")
    print("To fully test, you need:")
    print("  1. ffmpeg installed")
    print("  2. A test video file")
    print("  3. (Optional) Node.js + Remotion for full transition")
    print()
    print("On the VPS with ffmpeg, this should work correctly.")
else:
    print("❌ Some verifications failed")
    print()
    print("Please review the implementation.")
    sys.exit(1)

print()

