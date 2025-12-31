"""
Transcription Handler - Generate transcripts using Whisper.
"""
import os
import json
import logging
from typing import Any, Dict
import subprocess

from .base import BaseHandler
from config import Config

logger = logging.getLogger(__name__)


class TranscribeHandler(BaseHandler):
    """Handler for video transcription jobs."""

    def __init__(self, supabase, temp_dir: str):
        super().__init__(supabase, temp_dir)
        self.model = None  # Lazy load

    def _load_model(self):
        """Load Whisper model (lazy)."""
        if self.model is None:
            import whisper
            logger.info(f"Loading Whisper model: {Config.WHISPER_MODEL}")
            self.model = whisper.load_model(Config.WHISPER_MODEL)
        return self.model

    def process(self, job_id: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transcribe a video."""
        try:
            asset_id = input_data.get("asset_id")

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
            audio_path = os.path.join(self.temp_dir, f"{job_id}_audio.wav")

            try:
                # Download video
                logger.info(f"Downloading video from {bucket}/{path}")
                if not self.download_asset(bucket, path, input_path):
                    return {"success": False, "error": "Failed to download video"}

                # Extract audio
                logger.info("Extracting audio")
                subprocess.run(
                    [
                        "ffmpeg",
                        "-i", input_path,
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

                # Transcribe
                logger.info("Transcribing audio")
                model = self._load_model()
                result = model.transcribe(audio_path, verbose=False)

                # Format transcript
                segments = []
                for segment in result.get("segments", []):
                    segments.append({
                        "start_ms": int(segment["start"] * 1000),
                        "end_ms": int(segment["end"] * 1000),
                        "text": segment["text"].strip(),
                    })

                transcript = {
                    "segments": segments,
                    "full_text": result.get("text", "").strip(),
                    "language": result.get("language", "en"),
                }

                # Save transcript
                transcript_path = path.replace(".mp4", "_transcript.json").replace(
                    ".mov", "_transcript.json"
                ).replace(".webm", "_transcript.json")

                transcript_local_path = os.path.join(self.temp_dir, f"{job_id}_transcript.json")
                with open(transcript_local_path, "w") as f:
                    json.dump(transcript, f)

                logger.info(f"Uploading transcript to {transcript_path}")
                if not self.upload_asset(
                    "project-transcripts",
                    transcript_path,
                    transcript_local_path,
                    "application/json"
                ):
                    return {"success": False, "error": "Failed to upload transcript"}

                # Create asset record
                transcript_asset_id = self.create_asset_record(
                    user_id=user_id,
                    project_id=project_id,
                    asset_type="transcript",
                    bucket="project-transcripts",
                    path=transcript_path,
                    metadata={
                        "source_asset_id": asset_id,
                        "language": transcript["language"],
                        "segment_count": len(segments),
                    }
                )

                # Get duration
                duration_ms = segments[-1]["end_ms"] if segments else 0

                return {
                    "success": True,
                    "output": {
                        "transcript_asset_id": transcript_asset_id,
                        "language": transcript["language"],
                        "duration_ms": duration_ms,
                    },
                }

            finally:
                # Cleanup
                for f in [input_path, audio_path]:
                    if os.path.exists(f):
                        os.remove(f)

        except Exception as e:
            logger.exception("Transcription failed")
            return {"success": False, "error": str(e)}

