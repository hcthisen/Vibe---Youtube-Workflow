"""
Video Processing Handler - Complete pipeline with VAD, transcription, LLM cuts, and intro transition.
"""
import os
import json
import logging
from typing import Any, Dict

from .base import BaseHandler
from utils.vad_processor import process_video_vad
from utils.transcription import transcribe_video, search_transcript_for_phrases, remove_segments_from_transcript
from utils.llm_cuts import analyze_retake_cuts, apply_cuts_to_video, normalize_llm_model
from utils.intro_transition import add_intro_transition

logger = logging.getLogger(__name__)


class VideoProcessHandler(BaseHandler):
    """Handler for video processing jobs with complete pipeline."""

    def process(self, job_id: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a video through the complete pipeline:
        1. VAD silence removal
        2. Transcription
        3. Retake marker detection & LLM cuts (if enabled)
        4. Intro transition (if enabled)
        5. Upload all assets
        """
        try:
            asset_id = input_data.get("asset_id")
            silence_threshold_ms = input_data.get("silence_threshold_ms", 500)
            retake_detection_enabled = input_data.get("retake_detection_enabled", False)
            retake_markers = input_data.get("retake_markers", [])
            apply_intro_transition = input_data.get("apply_intro_transition", False)
            
            # Enhanced retake detection settings
            retake_context_window = input_data.get("retake_context_window_seconds", 30)
            retake_min_confidence = input_data.get("retake_min_confidence", 0.7)
            retake_prefer_sentence_boundaries = input_data.get("retake_prefer_sentence_boundaries", True)
            llm_model = input_data.get("llm_model", "gpt-4.1")
            llm_model = normalize_llm_model(llm_model)

            logger.info(f"Starting video processing pipeline for asset {asset_id}")

            if not asset_id:
                return {"success": False, "error": "Missing required input: asset_id"}

            # Get asset info
            asset_res = self.supabase.table("project_assets").select("*").eq(
                "id", asset_id
            ).execute()
            asset_rows = asset_res.data or []

            if len(asset_rows) == 0:
                return {"success": False, "error": "Asset not found"}

            if len(asset_rows) > 1:
                return {
                    "success": False,
                    "error": f"Expected 1 asset row, found {len(asset_rows)} for asset_id={asset_id}",
                }

            asset_data = asset_rows[0]
            user_id = asset_data["user_id"]
            project_id = asset_data["project_id"]
            bucket = asset_data["bucket"]
            path = asset_data["path"]

            # Create temp files
            input_path = os.path.join(self.temp_dir, f"{job_id}_input.mp4")
            vad_output_path = os.path.join(self.temp_dir, f"{job_id}_vad.mp4")
            cuts_output_path = os.path.join(self.temp_dir, f"{job_id}_cuts.mp4")
            final_output_path = os.path.join(self.temp_dir, f"{job_id}_final.mp4")

            try:
                # Download video
                logger.info(f"Downloading video from {bucket}/{path}")
                if not self.download_asset(bucket, path, input_path):
                    return {"success": False, "error": "Failed to download video"}

                # ===== STEP 1: VAD Silence Removal =====
                logger.info("Step 1: VAD silence removal")
                vad_result = process_video_vad(
                    input_path=input_path,
                    output_path=vad_output_path,
                    min_silence=silence_threshold_ms / 1000,
                    min_speech=0.25,
                    padding_ms=100,
                    merge_gap=0.3,
                    keep_start=True
                )

                if not vad_result["success"]:
                    return {"success": False, "error": vad_result.get("error", "VAD processing failed")}

                original_duration_ms = vad_result["original_duration_ms"]
                after_vad_duration_ms = vad_result["processed_duration_ms"]
                silence_removed_ms = vad_result["silence_removed_ms"]

                # ===== STEP 2: Transcription =====
                logger.info("Step 2: Transcription")
                transcription_result = transcribe_video(
                    video_path=vad_output_path,
                    model_name="base"
                )

                if not transcription_result["success"]:
                    logger.warning(f"Transcription failed: {transcription_result.get('error')}")
                    transcript_words = []
                    transcript_plaintext = ""
                else:
                    transcript_words = transcription_result["words"]
                    transcript_plaintext = transcription_result["plaintext"]

                # ===== STEP 3: Retake Marker Detection & LLM Cuts (if enabled) =====
                retake_cuts = []
                after_cuts_duration_ms = after_vad_duration_ms
                current_video_path = vad_output_path

                if retake_detection_enabled and retake_markers and transcript_words:
                    logger.info(f"Step 3: Retake marker detection (markers: {retake_markers})")
                    
                    # Search for retake phrases
                    retake_matches = search_transcript_for_phrases(transcript_words, retake_markers)
                    
                    if retake_matches:
                        logger.info(f"Found {len(retake_matches)} retake markers")
                        
                        # Get OpenAI API key from environment
                        openai_api_key = os.getenv("OPENAI_API_KEY")
                        
                        if openai_api_key:
                            # Use LLM to analyze cuts with enhanced settings
                            cut_instructions = analyze_retake_cuts(
                                transcript_words=transcript_words,
                                retake_matches=retake_matches,
                                api_key=openai_api_key,
                                context_window_seconds=retake_context_window,
                                min_confidence=retake_min_confidence,
                                prefer_sentence_boundaries=retake_prefer_sentence_boundaries,
                                model=llm_model,
                                vad_segments=vad_result.get("speech_segments")
                            )
                            
                            if cut_instructions:
                                # Apply cuts
                                cuts_result = apply_cuts_to_video(
                                    input_path=vad_output_path,
                                    output_path=cuts_output_path,
                                    cut_instructions=cut_instructions,
                                    original_segments=vad_result.get("speech_segments", [])
                                )
                                
                                if cuts_result["success"]:
                                    # Update transcript to remove words in cut segments
                                    transcript_words = remove_segments_from_transcript(
                                        transcript_words,
                                        cut_instructions
                                    )
                                    transcript_plaintext = " ".join([w["word"] for w in transcript_words])
                                    
                                    retake_cuts = cut_instructions
                                    current_video_path = cuts_output_path
                                    
                                    # Calculate new duration
                                    from utils.vad_processor import get_duration
                                    after_cuts_duration_ms = int(get_duration(cuts_output_path) * 1000)
                        else:
                            logger.warning("OPENAI_API_KEY not set - skipping LLM retake analysis")
                    else:
                        logger.info("No retake markers found in transcript")
                else:
                    logger.info("Step 3: Skipping retake detection (not enabled or no transcript)")

                # ===== STEP 4: Intro Transition (if enabled) =====
                intro_applied = False
                if apply_intro_transition:
                    logger.info("Step 4: Adding intro transition")
                    intro_result = add_intro_transition(
                        input_path=current_video_path,
                        output_path=final_output_path
                    )
                    
                    if intro_result["success"]:
                        intro_applied = intro_result.get("transition_applied", False)
                        current_video_path = final_output_path
                    else:
                        logger.warning(f"Intro transition failed: {intro_result.get('error')}")
                else:
                    logger.info("Step 4: Skipping intro transition (not enabled)")
                    # Copy to final output
                    import shutil
                    shutil.copy(current_video_path, final_output_path)
                    current_video_path = final_output_path

                # ===== STEP 5: Upload Assets =====
                logger.info("Step 5: Uploading assets")
                
                # Upload processed video
                output_storage_path = path.replace(".mp4", "_processed.mp4").replace(
                    ".mov", "_processed.mp4"
                ).replace(".webm", "_processed.mp4")

                # Log file size for context
                file_size_mb = os.path.getsize(current_video_path) / 1024 / 1024
                logger.info(f"  Processed video size: {file_size_mb:.2f}MB")

                if not self.upload_asset(
                    "project-processed-videos",
                    output_storage_path,
                    current_video_path,
                    "video/mp4"
                ):
                    return {"success": False, "error": "Failed to upload processed video"}

                processed_asset_id = self.create_asset_record(
                    user_id=user_id,
                    project_id=project_id,
                    asset_type="processed_video",
                    bucket="project-processed-videos",
                    path=output_storage_path,
                    metadata={
                        "original_asset_id": asset_id,
                        "original_duration_ms": original_duration_ms,
                        "processed_duration_ms": after_cuts_duration_ms,
                    }
                )

                # Upload transcript (JSON)
                if transcript_words:
                    transcript_json_path = path.replace(".mp4", "_transcript.json").replace(
                        ".mov", "_transcript.json"
                    ).replace(".webm", "_transcript.json")
                    
                    transcript_local_path = os.path.join(self.temp_dir, f"{job_id}_transcript.json")
                    with open(transcript_local_path, "w") as f:
                        json.dump(transcript_words, f, indent=2)
                    
                    if self.upload_asset(
                        "project-transcripts",
                        transcript_json_path,
                        transcript_local_path,
                        "application/json"
                    ):
                        self.create_asset_record(
                            user_id=user_id,
                            project_id=project_id,
                            asset_type="transcript",
                            bucket="project-transcripts",
                            path=transcript_json_path,
                            metadata={
                                "format": "json",
                                "word_count": len(transcript_words)
                            }
                        )
                    
                    # Upload transcript (plaintext)
                    transcript_txt_path = path.replace(".mp4", "_transcript.txt").replace(
                        ".mov", "_transcript.txt"
                    ).replace(".webm", "_transcript.txt")
                    
                    transcript_txt_local_path = os.path.join(self.temp_dir, f"{job_id}_transcript.txt")
                    with open(transcript_txt_local_path, "w") as f:
                        f.write(transcript_plaintext)
                    
                    if self.upload_asset(
                        "project-transcripts",
                        transcript_txt_path,
                        transcript_txt_local_path,
                        "text/plain"
                    ):
                        self.create_asset_record(
                            user_id=user_id,
                            project_id=project_id,
                            asset_type="transcript",
                            bucket="project-transcripts",
                            path=transcript_txt_path,
                            metadata={
                                "format": "plaintext",
                                "word_count": len(transcript_words)
                            }
                        )

                # Create and upload edit report with enhanced LLM info
                edit_report = {
                    "original_duration_ms": original_duration_ms,
                    "after_silence_removal_ms": after_vad_duration_ms,
                    "after_retake_cuts_ms": after_cuts_duration_ms,
                    "final_duration_ms": after_cuts_duration_ms,
                    "silence_removed_ms": silence_removed_ms,
                    "retake_cuts": retake_cuts,
                    "retake_cuts_detailed": [
                        {
                            "start_time": cut["start_time"],
                            "end_time": cut["end_time"],
                            "duration_seconds": cut["end_time"] - cut["start_time"],
                            "reason": cut["reason"],
                            "confidence": cut.get("confidence"),
                            "pattern": cut.get("pattern"),
                            "method": cut.get("method"),
                            "llm_reasoning": cut.get("llm_reasoning")
                        }
                        for cut in retake_cuts
                    ] if retake_cuts else [],
                    "retake_analysis_settings": {
                        "llm_model": llm_model,
                        "context_window_seconds": retake_context_window,
                        "min_confidence": retake_min_confidence,
                        "prefer_sentence_boundaries": retake_prefer_sentence_boundaries
                    } if retake_cuts else None,
                    "intro_transition_applied": intro_applied,
                    "transcript_word_count": len(transcript_words),
                    "transcript_words_removed": transcription_result.get("word_count", 0) - len(transcript_words),
                    "processing_steps": [
                        "vad_silence_removal",
                        "transcription",
                        "llm_retake_cuts" if retake_cuts else None,
                        "intro_transition" if intro_applied else None
                    ]
                }
                # Remove None values
                edit_report["processing_steps"] = [s for s in edit_report["processing_steps"] if s]

                report_path = path.replace(".mp4", "_report.json").replace(
                    ".mov", "_report.json"
                ).replace(".webm", "_report.json")

                report_local_path = os.path.join(self.temp_dir, f"{job_id}_report.json")
                with open(report_local_path, "w") as f:
                    json.dump(edit_report, f, indent=2)

                report_asset_id = None
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

                logger.info("Video processing pipeline completed successfully")

                return {
                    "success": True,
                    "output": {
                        "processed_asset_id": processed_asset_id,
                        "edit_report_asset_id": report_asset_id,
                        "edit_report": {
                            "original_duration_ms": original_duration_ms,
                            "processed_duration_ms": after_cuts_duration_ms,
                            "silence_removed_ms": silence_removed_ms,
                            "retake_cuts_count": len(retake_cuts),
                            "transcript_word_count": len(transcript_words),
                        },
                    },
                }

            finally:
                # Cleanup temp files
                for f in [input_path, vad_output_path, cuts_output_path, final_output_path]:
                    if os.path.exists(f):
                        try:
                            os.remove(f)
                        except:
                            pass

        except Exception as e:
            logger.exception("Video processing failed")
            return {"success": False, "error": str(e)}
