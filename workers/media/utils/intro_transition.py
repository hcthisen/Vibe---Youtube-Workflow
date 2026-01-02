"""
Intro Transition Wrapper - Add 3D swivel intro transition using overlay approach.

Overlays a Remotion-generated 3D transition on top of the video while preserving
the original audio track. This approach is simpler and faster than splitting/inserting.

Requirements:
- Node.js (for Remotion rendering)
- Remotion dependencies installed in "Initial Templates - execution/video_effects/"
"""
import logging
import subprocess
import os
import sys
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def check_remotion_available() -> tuple[bool, str]:
    """
    Check if Remotion is available for rendering transitions.
    
    Returns:
        (available: bool, error_message: str)
    """
    # Check Node.js
    try:
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return False, "Node.js not found - required for Remotion rendering"
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False, "Node.js not found - required for Remotion rendering"
    
    # Check if video_effects directory exists with node_modules
    project_root = Path(__file__).parent.parent.parent.parent
    video_effects_dir = project_root / "Initial Templates - execution" / "video_effects"
    
    if not video_effects_dir.exists():
        return False, f"video_effects directory not found at {video_effects_dir}"
    
    node_modules = video_effects_dir / "node_modules"
    if not node_modules.exists():
        return False, f"Remotion dependencies not installed - run 'npm install' in {video_effects_dir}"
    
    # Check if @remotion/cli is installed
    remotion_cli = node_modules / "@remotion" / "cli"
    if not remotion_cli.exists():
        return False, f"@remotion/cli not found - run 'npm install' in {video_effects_dir}"
    
    # Quick check if npx remotion works
    try:
        result = subprocess.run(
            ["npx", "remotion", "versions"],
            cwd=str(video_effects_dir),
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode != 0:
            return False, f"Remotion CLI not working - try 'npm install' in {video_effects_dir}"
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return False, f"Remotion CLI check failed: {e}"
    
    return True, ""


def add_intro_transition(
    input_path: str,
    output_path: str,
    insert_at: float = 3.0,
    duration: float = 5.0,
    teaser_start: float = 60.0,
    bg_image_path: str = None
) -> dict:
    """
    Add 3D swivel intro transition to video using overlay approach.
    
    The transition is overlaid on top of the original video from insert_at to 
    insert_at+duration, while the original audio continues playing uninterrupted.
    
    Args:
        input_path: Input video path
        output_path: Output video path
        insert_at: Time to overlay transition (seconds, default: 3.0)
        duration: Duration of transition (seconds, default: 5.0)
        teaser_start: Where to preview content from (seconds, default: 60.0)
        bg_image_path: Background image path (optional)
    
    Returns:
        Dict with success status and transition_applied boolean
    """
    logger.info(f"Adding intro transition overlay at {insert_at}s (duration: {duration}s)")
    
    # Check if Remotion is available
    remotion_available, error_msg = check_remotion_available()
    
    if not remotion_available:
        logger.warning(f"Remotion not available: {error_msg}")
        logger.warning("Falling back to copying video without transition")
        
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
                capture_output=True,
                check=True
            )
            return {
                "success": True,
                "transition_applied": False,
                "note": f"Remotion not available: {error_msg}"
            }
        except Exception as e:
            logger.error(f"Failed to copy video: {e}")
            return {"success": False, "error": str(e)}
    
    # Import pan_3d_transition module
    try:
        project_root = Path(__file__).parent.parent.parent.parent
        execution_dir = project_root / "Initial Templates - execution"
        
        # Add to path temporarily
        sys.path.insert(0, str(execution_dir))
        
        try:
            from pan_3d_transition import create_transition, get_video_info
        finally:
            # Remove from path
            if str(execution_dir) in sys.path:
                sys.path.remove(str(execution_dir))
        
    except Exception as e:
        logger.error(f"Failed to import pan_3d_transition: {e}")
        logger.warning("Falling back to copying video")
        
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
                capture_output=True,
                check=True
            )
            return {
                "success": True,
                "transition_applied": False,
                "note": f"Could not import transition module: {e}"
            }
        except Exception as copy_error:
            return {"success": False, "error": str(copy_error)}
    
    # Get video info to validate teaser_start
    try:
        video_info = get_video_info(input_path)
        video_duration = video_info["duration"]
        
        # Adjust teaser_start if it exceeds video duration
        if teaser_start >= video_duration:
            logger.warning(
                f"teaser_start ({teaser_start}s) >= video duration ({video_duration:.1f}s), "
                f"adjusting to start at {video_duration * 0.5:.1f}s"
            )
            teaser_start = video_duration * 0.5
        
        # Ensure we have enough content for the transition
        available_content = video_duration - teaser_start
        if available_content < 1.0:
            logger.warning(
                f"Not enough content after {teaser_start}s ({available_content:.1f}s available), "
                f"adjusting teaser_start to {video_duration * 0.3:.1f}s"
            )
            teaser_start = video_duration * 0.3
        
    except Exception as e:
        logger.error(f"Failed to get video info: {e}")
        return {"success": False, "error": f"Failed to analyze video: {e}"}
    
    # Generate the 3D transition
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as transition_file:
        transition_path = transition_file.name
    
    try:
        logger.info(f"Generating 3D transition (teaser from {teaser_start}s)")
        logger.info("This may take 30-60 seconds...")
        
        # Set timeout for transition generation (2 minutes max)
        import signal
        
        def timeout_handler(signum, frame):
            raise TimeoutError("Transition generation timed out after 2 minutes")
        
        # Only use signal timeout on Unix systems
        if hasattr(signal, 'SIGALRM'):
            old_handler = signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(120)  # 2 minute timeout
        
        try:
            create_transition(
                input_path=input_path,
                output_path=transition_path,
                start=teaser_start,
                output_duration=duration,
                bg_image=bg_image_path
            )
        finally:
            if hasattr(signal, 'SIGALRM'):
                signal.alarm(0)  # Cancel alarm
                signal.signal(signal.SIGALRM, old_handler)
        
        logger.info(f"3D transition generated: {transition_path}")
        
    except TimeoutError as e:
        logger.error(f"Transition generation timed out: {e}")
        # Clean up
        if os.path.exists(transition_path):
            os.remove(transition_path)
        
        # Fallback: copy video
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
                capture_output=True,
                check=True,
                timeout=60
            )
            return {
                "success": True,
                "transition_applied": False,
                "note": f"Transition generation timed out - copied video instead"
            }
        except Exception as copy_error:
            return {"success": False, "error": str(copy_error)}
    except Exception as e:
        logger.error(f"Failed to generate transition: {e}")
        # Clean up
        if os.path.exists(transition_path):
            os.remove(transition_path)
        
        # Fallback: copy video
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
                capture_output=True,
                check=True,
                timeout=60
            )
            return {
                "success": True,
                "transition_applied": False,
                "note": f"Transition generation failed: {e}"
            }
        except Exception as copy_error:
            return {"success": False, "error": str(copy_error)}
    
    # Overlay the transition on the video
    try:
        logger.info(f"Overlaying transition on video at {insert_at}s")
        
        # Calculate overlay end time
        overlay_end = insert_at + duration
        
        # Try to get hardware encoder args (from vad_processor if available)
        encoder_args = []
        try:
            # Import hardware encoder detection
            sys.path.insert(0, str(Path(__file__).parent))
            try:
                from vad_processor import get_cached_encoder_args
                encoder_args = get_cached_encoder_args()
                logger.info(f"Using hardware encoding: {' '.join(encoder_args)}")
            finally:
                sys.path.pop(0)
        except Exception:
            # Fallback to software encoding
            encoder_args = ["-c:v", "libx264", "-preset", "medium", "-crf", "23"]
            logger.info("Using software encoding (libx264)")
        
        # Build FFmpeg command
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,           # [0] = original video
            "-i", transition_path,       # [1] = transition video
            "-filter_complex",
            f"[0:v][1:v]overlay=enable='between(t,{insert_at},{overlay_end})':x=0:y=0[v]",
            "-map", "[v]",              # Use the overlaid video
            "-map", "0:a",              # Use original audio
            "-c:a", "copy",             # Copy audio without re-encoding
        ] + encoder_args + [
            output_path
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode != 0:
            logger.error(f"FFmpeg overlay failed: {result.stderr}")
            raise RuntimeError(f"FFmpeg overlay failed: {result.stderr}")
        
        logger.info(f"Transition overlay complete: {output_path}")
        
        return {
            "success": True,
            "transition_applied": True,
            "overlay_start": insert_at,
            "overlay_end": overlay_end,
            "teaser_start": teaser_start
        }
        
    except Exception as e:
        logger.error(f"Failed to overlay transition: {e}")
        return {"success": False, "error": str(e)}
    
    finally:
        # Clean up transition file
        if os.path.exists(transition_path):
            try:
                os.remove(transition_path)
            except:
                pass

