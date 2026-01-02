"""
Thumbnail Iteration Handler
Refines existing thumbnails using Google AI Studio (Gemini) API
"""

import os
import json
import base64
import time
import logging
from typing import Dict, Any, List, Optional
import requests
from supabase import Client
from .base import BaseHandler

logger = logging.getLogger(__name__)


class ThumbnailIterateHandler(BaseHandler):
    """Handler for thumbnail_iterate job type"""

    def process(self, job_id: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process a thumbnail iteration job"""
        try:
            project_id = input_data.get("project_id")
            previous_thumbnail_asset_id = input_data.get("previous_thumbnail_asset_id")
            headshot_id = input_data.get("headshot_id")
            text_modifications = input_data.get("text_modifications")
            refinement_prompt = input_data.get("refinement_prompt")
            idea_brief_markdown = input_data.get("idea_brief_markdown")
            count = input_data.get("count", 2)
            
            if not project_id:
                return {"success": False, "error": "Missing required input: project_id"}
            if not previous_thumbnail_asset_id:
                return {"success": False, "error": "Missing required input: previous_thumbnail_asset_id"}
            if not refinement_prompt:
                return {"success": False, "error": "Missing required input: refinement_prompt"}
            
            logger.info(f"Iterating on thumbnail {previous_thumbnail_asset_id} for project {project_id}")
        
            # Step 1: Get project details
            project = self.supabase.table("projects").select("title, user_id").eq("id", project_id).single().execute()
            if not project.data:
                return {"success": False, "error": f"Project {project_id} not found"}
            
            project_data = project.data
            user_id = project_data["user_id"]
            title = project_data["title"]
            
            # Step 2: Get user profile for display name
            profile = self.supabase.table("profiles").select("display_name").eq("id", user_id).single().execute()
            user_name = profile.data.get("display_name") if profile.data else None
            
            # Step 3: Get previous thumbnail
            prev_asset = self.supabase.table("project_assets").select("bucket, path, metadata").eq("id", previous_thumbnail_asset_id).single().execute()
            if not prev_asset.data:
                return {"success": False, "error": f"Previous thumbnail {previous_thumbnail_asset_id} not found"}
            
            prev_asset_data = prev_asset.data
            prev_bucket = prev_asset_data["bucket"]
            prev_path = prev_asset_data["path"]
            
            # Download previous thumbnail
            logger.info(f"Downloading previous thumbnail from {prev_bucket}/{prev_path}")
            prev_thumbnail_bytes = self.download_from_storage(prev_bucket, prev_path)
            if not prev_thumbnail_bytes:
                return {"success": False, "error": "Failed to download previous thumbnail from storage"}
            
            prev_thumbnail_base64 = base64.b64encode(prev_thumbnail_bytes).decode("utf-8")
            
            # Step 4: Get headshot if swapping
            headshot_base64 = None
            if headshot_id:
                headshot = self.supabase.table("headshots").select("bucket, path").eq("id", headshot_id).single().execute()
                if not headshot.data:
                    return {"success": False, "error": f"Headshot {headshot_id} not found"}
                
                headshot_data = headshot.data
                headshot_bucket = headshot_data["bucket"]
                headshot_path = headshot_data["path"]
                
                logger.info(f"Downloading headshot from {headshot_bucket}/{headshot_path}")
                headshot_bytes = self.download_from_storage(headshot_bucket, headshot_path)
                if not headshot_bytes:
                    return {"success": False, "error": "Failed to download headshot from storage"}
                
                headshot_base64 = base64.b64encode(headshot_bytes).decode("utf-8")
            else:
                # Use headshot from previous thumbnail metadata
                metadata = prev_asset_data.get("metadata") or {}
                if metadata.get("headshot_id"):
                    headshot_id = metadata["headshot_id"]
                    headshot = self.supabase.table("headshots").select("bucket, path").eq("id", headshot_id).single().execute()
                    if headshot.data:
                        headshot_data = headshot.data
                        headshot_bucket = headshot_data["bucket"]
                        headshot_path = headshot_data["path"]
                        
                        logger.info(f"Using headshot from previous thumbnail: {headshot_bucket}/{headshot_path}")
                        headshot_bytes = self.download_from_storage(headshot_bucket, headshot_path)
                        if headshot_bytes:
                            headshot_base64 = base64.b64encode(headshot_bytes).decode("utf-8")
            
            # Step 5: Build prompt
            prompt = self.build_iteration_prompt(
                user_name=user_name,
                title=title,
                refinement_prompt=refinement_prompt,
                text_modifications=text_modifications,
                idea_brief_markdown=idea_brief_markdown
            )
            
            # Step 6: Generate iterated thumbnails via Gemini API
            logger.info(f"Generating {count} iterated thumbnails via Gemini API")
            generated_images = self.generate_thumbnails_via_gemini(
                headshot_base64=headshot_base64,
                reference_base64=prev_thumbnail_base64,
                reference_mime_type="image/png",
                prompt=prompt,
                count=count
            )
            
            if not generated_images:
                return {"success": False, "error": "No thumbnails generated from Gemini API"}
        
            # Step 7: Upload thumbnails to storage and create asset records
            thumbnails = []
            timestamp = int(time.time() * 1000)
            
            for i, image_base64 in enumerate(generated_images):
                path = f"{user_id}/{project_id}/thumbnail_iter_{timestamp}_{i}.png"
                
                # Upload to storage
                logger.info(f"Uploading iterated thumbnail {i+1}/{len(generated_images)} to storage")
                image_bytes = base64.b64decode(image_base64)
                
                upload_result = self.supabase.storage.from_("project-thumbnails").upload(
                    path=path,
                    file=image_bytes,
                    file_options={"content-type": "image/png"}
                )
                
                if upload_result.status_code not in [200, 201]:
                    logger.error(f"Failed to upload iterated thumbnail {i}: {upload_result}")
                    continue
                
                # Create asset record
                asset_result = self.supabase.table("project_assets").insert({
                    "user_id": user_id,
                    "project_id": project_id,
                    "type": "thumbnail",
                    "bucket": "project-thumbnails",
                    "path": path,
                    "metadata": {
                        "previous_asset_id": previous_thumbnail_asset_id,
                        "headshot_id": headshot_id,
                        "refinement_prompt": refinement_prompt,
                        "text_modifications": text_modifications,
                        "idea_brief_markdown": idea_brief_markdown,
                        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
                    }
                }).execute()
                
                if asset_result.data and len(asset_result.data) > 0:
                    asset_id = asset_result.data[0]["id"]
                    # Get public URL
                    public_url = self.supabase.storage.from_("project-thumbnails").get_public_url(path)
                    thumbnails.append({
                        "asset_id": asset_id,
                        "url": public_url
                    })
            
            logger.info(f"Successfully generated {len(thumbnails)} iterated thumbnails")
            
            return {
                "success": True,
                "output": {
                    "thumbnails": thumbnails,
                    "headshot_used": headshot_id,
                    "count_generated": len(thumbnails)
                }
            }
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Thumbnail iteration failed: {error_msg}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return {"success": False, "error": error_msg}
    
    def download_from_storage(self, bucket: str, path: str) -> Optional[bytes]:
        """Download a file from Supabase storage"""
        try:
            result = self.supabase.storage.from_(bucket).download(path)
            return result
        except Exception as e:
            logger.error(f"Failed to download from storage: {e}")
            return None
    
    def build_iteration_prompt(
        self,
        user_name: Optional[str],
        title: str,
        refinement_prompt: str,
        text_modifications: Optional[str],
        idea_brief_markdown: Optional[str]
    ) -> str:
        """Build the prompt for thumbnail iteration"""
        user_name = user_name or "the person"
        
        prompt = f"""IMAGE 1: Reference photo of {user_name}'s face (if provided).
IMAGE 2: The thumbnail to refine.

TASK: Refine the thumbnail based on the following instructions:

{refinement_prompt}

Video title context: "{title}"

{f'Text changes (follow exactly): {text_modifications}' if text_modifications else 'TEXT TASK: Replace the main headline text to match the Idea Brief (prefer any "Thumbnail Text Ideas" list inside it). Do NOT keep the existing headline unless it matches.'}
"""
        
        if idea_brief_markdown:
            prompt += f"""\n\nIdea Brief: {idea_brief_markdown}
When adding or modifying text on the thumbnail, ensure it aligns with the core concepts and message from this idea brief.
"""
        
        prompt += "\n\nOutput in 16:9 format."
        
        return prompt
    
    def generate_thumbnails_via_gemini(
        self,
        headshot_base64: Optional[str],
        reference_base64: str,
        reference_mime_type: str,
        prompt: str,
        count: int
    ) -> List[str]:
        """
        Generate thumbnails using Google Gemini API.
        Returns list of base64-encoded images.
        """
        api_key = os.getenv("GOOGLE_AI_STUDIO_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_AI_STUDIO_API_KEY environment variable not set")
        
        endpoint = os.getenv("NANO_BANANA_ENDPOINT", "https://generativelanguage.googleapis.com/v1beta")
        model = os.getenv("NANO_BANANA_MODEL", "gemini-2.5-flash-exp-image-8s")
        
        # Build request body - if headshot provided, send both images; otherwise just the reference
        parts = []
        
        if headshot_base64:
            parts.append({
                "inlineData": {
                    "mimeType": "image/jpeg",
                    "data": headshot_base64
                }
            })
        
        parts.append({
            "inlineData": {
                "mimeType": reference_mime_type,
                "data": reference_base64
            }
        })
        
        parts.append({
            "text": prompt
        })
        
        request_body = {
            "contents": [{
                "role": "user",
                "parts": parts
            }],
            "generationConfig": {
                "temperature": 0.4,
                "topK": 32,
                "topP": 1,
                "maxOutputTokens": 8192,
            }
        }
        
        generated_images: List[str] = []
        
        for i in range(count):
            try:
                logger.info(f"Generating iterated thumbnail {i+1}/{count}...")
                
                url = f"{endpoint}/models/{model}:generateContent?key={api_key}"
                response = requests.post(url, json=request_body, timeout=120)
                
                if response.status_code != 200:
                    logger.error(f"Gemini API error: {response.status_code} {response.text}")
                    continue
                
                result = response.json()
                
                # Extract image from response
                if "candidates" in result and len(result["candidates"]) > 0:
                    candidate = result["candidates"][0]
                    if "content" in candidate and "parts" in candidate["content"]:
                        for part in candidate["content"]["parts"]:
                            if "inlineData" in part and part["inlineData"]["mimeType"].startswith("image/"):
                                generated_images.append(part["inlineData"]["data"])
                                logger.info(f"Generated iterated thumbnail {i+1}")
                                break
                
            except Exception as e:
                logger.error(f"Failed to generate iterated thumbnail {i+1}: {e}")
        
        return generated_images

