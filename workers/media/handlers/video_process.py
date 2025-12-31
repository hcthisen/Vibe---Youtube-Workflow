"""
Video Processing Handler - Silence removal and transitions.
"""
import os
import json
import logging
from typing import Any, Dict
import subprocess
import tempfile

from .base import BaseHandler

logger = logging.getLogger(__name__)


class VideoProcessHandler(BaseHandler):
    """Handler for video processing jobs."""

    def process(self, job_id: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process a video: remove silence, apply transitions."""
        try:
            asset_id = input_data.get("asset_id")
            silence_threshold_ms = input_data.get("silence_threshold_ms", 500)
            retake_markers = input_data.get("retake_markers", [])
            apply_transition = input_data.get("apply_intro_transition", False)

            # Get asset info
            asset = self.supabase.table("project_assets").select("*").eq(
                "id", asset_id
            ).single().execute()

            if not asset.data:
                return {"success": False, "error": "Asset not found"}

            asset_data = asset.data
            user_id = asset_data["user_id"]
            project_id = asset_data["project_id"]
            bucket = asset_data["bucket"]
            path = asset_data["path"]

            # Create temp files
            input_path = os.path.join(self.temp_dir, f"{job_id}_input.mp4")
            output_path = os.path.join(self.temp_dir, f"{job_id}_output.mp4")
            audio_path = os.path.join(self.temp_dir, f"{job_id}_audio.wav")

            try:
                # Download video
                logger.info(f"Downloading video from {bucket}/{path}")
                if not self.download_asset(bucket, path, input_path):
                    return {"success": False, "error": "Failed to download video"}

                # Get original duration
                original_duration = self._get_duration(input_path)

                # Extract audio
                logger.info("Extracting audio for analysis")
                self._extract_audio(input_path, audio_path)

                # Detect speech segments using VAD
                logger.info("Detecting speech segments")
                speech_segments = self._detect_speech(audio_path, silence_threshold_ms)

                # Generate cut list
                cuts = self._generate_cuts(speech_segments, original_duration, silence_threshold_ms)

                # Apply cuts
                logger.info(f"Applying {len(cuts)} cuts")
                self._apply_cuts(input_path, output_path, speech_segments)

                # Get processed duration
                processed_duration = self._get_duration(output_path)

                # Calculate stats
                total_silence_removed = original_duration - processed_duration

                # Upload processed video
                output_storage_path = path.replace(".mp4", "_processed.mp4").replace(
                    ".mov", "_processed.mp4"
                ).replace(".webm", "_processed.mp4")

                logger.info(f"Uploading processed video to {output_storage_path}")
                if not self.upload_asset(
                    "project-processed-videos",
                    output_storage_path,
                    output_path,
                    "video/mp4"
                ):
                    return {"success": False, "error": "Failed to upload processed video"}

                # Create asset record
                processed_asset_id = self.create_asset_record(
                    user_id=user_id,
                    project_id=project_id,
                    asset_type="processed_video",
                    bucket="project-processed-videos",
                    path=output_storage_path,
                    metadata={
                        "original_asset_id": asset_id,
                        "original_duration_ms": int(original_duration * 1000),
                        "processed_duration_ms": int(processed_duration * 1000),
                        "total_silence_removed_ms": int(total_silence_removed * 1000),
                        "cuts_count": len(cuts),
                    }
                )

                # Create edit report
                edit_report = {
                    "original_duration_ms": int(original_duration * 1000),
                    "processed_duration_ms": int(processed_duration * 1000),
                    "total_silence_removed_ms": int(total_silence_removed * 1000),
                    "cuts": cuts,
                }

                report_path = path.replace(".mp4", "_report.json").replace(
                    ".mov", "_report.json"
                ).replace(".webm", "_report.json")

                # Save and upload report
                report_local_path = os.path.join(self.temp_dir, f"{job_id}_report.json")
                with open(report_local_path, "w") as f:
                    json.dump(edit_report, f)

                if self.upload_asset(
                    "project-reports",
                    report_path,
                    report_local_path,
                    "application/json"
                ):
                    report_asset_id = self.create_asset_record(
                        user_id=user_id,
                        project_id=project_id,
                        asset_type="edit_report",
                        bucket="project-reports",
                        path=report_path,
                        metadata=edit_report
                    )
                else:
                    report_asset_id = None

                return {
                    "success": True,
                    "output": {
                        "processed_asset_id": processed_asset_id,
                        "edit_report_asset_id": report_asset_id,
                        "edit_report": {
                            "original_duration_ms": edit_report["original_duration_ms"],
                            "processed_duration_ms": edit_report["processed_duration_ms"],
                            "total_silence_removed_ms": edit_report["total_silence_removed_ms"],
                            "cuts_count": len(cuts),
                        },
                    },
                }

            finally:
                # Cleanup temp files
                for f in [input_path, output_path, audio_path]:
                    if os.path.exists(f):
                        os.remove(f)

        except Exception as e:
            logger.exception("Video processing failed")
            return {"success": False, "error": str(e)}

    def _get_duration(self, path: str) -> float:
        """Get video duration in seconds."""
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path
            ],
            capture_output=True,
            text=True
        )
        return float(result.stdout.strip())

    def _extract_audio(self, video_path: str, audio_path: str):
        """Extract audio from video."""
        subprocess.run(
            [
                "ffmpeg",
                "-i", video_path,
                "-vn",
                "-acodec", "pcm_s16le",
                "-ar", "16000",
                "-ac", "1",
                audio_path,
                "-y"
            ],
            capture_output=True,
            check=True
        )

    def _detect_speech(self, audio_path: str, silence_threshold_ms: int) -> list:
        """Detect speech segments using WebRTC VAD."""
        import webrtcvad
        import wave

        vad = webrtcvad.Vad(3)  # Aggressiveness 0-3

        with wave.open(audio_path, "rb") as wf:
            sample_rate = wf.getframerate()
            audio = wf.readframes(wf.getnframes())

        # Frame size in ms (10, 20, or 30)
        frame_duration_ms = 30
        frame_size = int(sample_rate * frame_duration_ms / 1000) * 2  # 2 bytes per sample

        segments = []
        in_speech = False
        speech_start = 0

        for i in range(0, len(audio) - frame_size, frame_size):
            frame = audio[i:i + frame_size]
            timestamp_ms = (i // 2) * 1000 // sample_rate

            is_speech = vad.is_speech(frame, sample_rate)

            if is_speech and not in_speech:
                # Speech started
                in_speech = True
                speech_start = timestamp_ms
            elif not is_speech and in_speech:
                # Speech ended
                in_speech = False
                segments.append({
                    "start_ms": speech_start,
                    "end_ms": timestamp_ms,
                })

        # Handle case where audio ends during speech
        if in_speech:
            segments.append({
                "start_ms": speech_start,
                "end_ms": len(audio) // 2 * 1000 // sample_rate,
            })

        # Merge segments that are close together (less than silence_threshold)
        merged = []
        for segment in segments:
            if merged and segment["start_ms"] - merged[-1]["end_ms"] < silence_threshold_ms:
                merged[-1]["end_ms"] = segment["end_ms"]
            else:
                merged.append(segment)

        return merged

    def _generate_cuts(self, speech_segments: list, total_duration: float, threshold_ms: int) -> list:
        """Generate list of cuts (silence removed)."""
        cuts = []
        prev_end = 0

        for segment in speech_segments:
            start = segment["start_ms"]
            if start - prev_end > threshold_ms:
                cuts.append({
                    "start_ms": prev_end,
                    "end_ms": start,
                    "duration_ms": start - prev_end,
                    "reason": "silence",
                })
            prev_end = segment["end_ms"]

        # Check for trailing silence
        total_ms = int(total_duration * 1000)
        if total_ms - prev_end > threshold_ms:
            cuts.append({
                "start_ms": prev_end,
                "end_ms": total_ms,
                "duration_ms": total_ms - prev_end,
                "reason": "silence",
            })

        return cuts

    def _apply_cuts(self, input_path: str, output_path: str, speech_segments: list):
        """Apply cuts using ffmpeg concat."""
        if not speech_segments:
            # No cuts needed, just copy
            subprocess.run(
                ["ffmpeg", "-i", input_path, "-c", "copy", output_path, "-y"],
                capture_output=True,
                check=True
            )
            return

        # Create concat file
        concat_file = os.path.join(self.temp_dir, "concat.txt")
        segment_files = []

        for i, segment in enumerate(speech_segments):
            start_sec = segment["start_ms"] / 1000
            end_sec = segment["end_ms"] / 1000
            segment_file = os.path.join(self.temp_dir, f"segment_{i}.mp4")
            segment_files.append(segment_file)

            subprocess.run(
                [
                    "ffmpeg",
                    "-i", input_path,
                    "-ss", str(start_sec),
                    "-to", str(end_sec),
                    "-c", "copy",
                    segment_file,
                    "-y"
                ],
                capture_output=True,
                check=True
            )

        # Write concat file
        with open(concat_file, "w") as f:
            for seg_file in segment_files:
                f.write(f"file '{seg_file}'\n")

        # Concatenate segments
        subprocess.run(
            [
                "ffmpeg",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_file,
                "-c", "copy",
                output_path,
                "-y"
            ],
            capture_output=True,
            check=True
        )

        # Cleanup segment files
        for seg_file in segment_files:
            if os.path.exists(seg_file):
                os.remove(seg_file)
        os.remove(concat_file)

