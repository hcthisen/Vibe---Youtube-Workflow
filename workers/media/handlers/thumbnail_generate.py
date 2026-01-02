"""
Thumbnail Generation Handler
Generates thumbnails using Google AI Studio (Gemini) API
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


class ThumbnailGenerateHandler(BaseHandler):
    """Handler for thumbnail_generate job type"""

    def process(self, job_id: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process a thumbnail generation job"""
        try:
            project_id = input_data.get("project_id")
            reference_thumbnail_url = input_data.get("reference_thumbnail_url")
            headshot_id = input_data.get("headshot_id")
            preset_style_id = input_data.get("preset_style_id")
            text_modifications = input_data.get("text_modifications")
            prompt_additions = input_data.get("prompt_additions")
            idea_brief_markdown = input_data.get("idea_brief_markdown")
            count = input_data.get("count", 2)
            
            if not project_id:
                return {"success": False, "error": "Missing required input: project_id"}
            if not reference_thumbnail_url:
                return {"success": False, "error": "Missing required input: reference_thumbnail_url"}
            if not headshot_id:
                return {"success": False, "error": "Missing required input: headshot_id"}
            
            logger.info(f"Generating {count} thumbnails for project {project_id}")
        
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
            
            # Step 3: Get headshot details and download
            headshot = self.supabase.table("headshots").select("bucket, path").eq("id", headshot_id).single().execute()
            if not headshot.data:
                return {"success": False, "error": f"Headshot {headshot_id} not found"}
        
            headshot_data = headshot.data
            headshot_bucket = headshot_data["bucket"]
            headshot_path = headshot_data["path"]
            
            # Download headshot
            logger.info(f"Downloading headshot from {headshot_bucket}/{headshot_path}")
            headshot_bytes = self.download_from_storage(headshot_bucket, headshot_path)
            if not headshot_bytes:
                return {"success": False, "error": "Failed to download headshot from storage"}
            
            headshot_base64 = base64.b64encode(headshot_bytes).decode("utf-8")
            
            # Step 4: Download reference thumbnail
            logger.info(f"Downloading reference thumbnail from {reference_thumbnail_url}")
            reference_base64, reference_mime_type = self.download_image_from_url(reference_thumbnail_url)
            if not reference_base64:
                return {"success": False, "error": f"Failed to download reference thumbnail from {reference_thumbnail_url}"}
        
            # Step 5: Build prompt
            prompt = self.build_face_swap_prompt(
                user_name=user_name,
                title=title,
                text_modifications=text_modifications,
                prompt_additions=prompt_additions,
                idea_brief_markdown=idea_brief_markdown
            )
            
            # Step 6: Generate thumbnails via Gemini API
            logger.info(f"Generating thumbnails via Gemini API (count={count})")
            generated_images = self.generate_thumbnails_via_gemini(
                headshot_base64=headshot_base64,
                reference_base64=reference_base64,
                reference_mime_type=reference_mime_type,
                prompt=prompt,
                count=count
            )
            
            if not generated_images:
                return {"success": False, "error": "No thumbnails generated from Gemini API"}
        
            # Step 7: Upload thumbnails to storage and create asset records
            thumbnails = []
            timestamp = int(time.time() * 1000)
            
            for i, image_base64 in enumerate(generated_images):
                path = f"{user_id}/{project_id}/thumbnail_{timestamp}_{i}.png"
                
                # Upload to storage
                logger.info(f"Uploading thumbnail {i+1}/{len(generated_images)} to storage")
                image_bytes = base64.b64decode(image_base64)
                
                upload_result = self.supabase.storage.from_("project-thumbnails").upload(
                    path=path,
                    file=image_bytes,
                    file_options={"content-type": "image/png"}
                )
                
                if upload_result.status_code not in [200, 201]:
                    logger.error(f"Failed to upload thumbnail {i}: {upload_result}")
                    continue
                
                # Create asset record
                insert_res = self.supabase.table("project_assets").insert({
                    "user_id": user_id,
                    "project_id": project_id,
                    "type": "thumbnail",
                    "bucket": "project-thumbnails",
                    "path": path,
                    "metadata": {
                        "reference_url": reference_thumbnail_url,
                        "headshot_id": headshot_id,
                        "preset_style_id": preset_style_id,
                        "prompt_additions": prompt_additions,
                        "text_modifications": text_modifications,
                        "idea_brief_markdown": idea_brief_markdown,
                        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
                    }
                }, returning="representation").execute()

                asset_id = None
                if getattr(insert_res, "data", None):
                    if isinstance(insert_res.data, list) and len(insert_res.data) > 0:
                        asset_id = insert_res.data[0].get("id")
                    elif isinstance(insert_res.data, dict):
                        asset_id = insert_res.data.get("id")

                if asset_id:
                    # Get public URL
                    public_url = self.supabase.storage.from_("project-thumbnails").get_public_url(path)
                    thumbnails.append({
                        "asset_id": asset_id,
                        "url": public_url
                    })
                else:
                    logger.error(f"Failed to create asset record for thumbnail {i} (no id returned)")
            
            logger.info(f"Successfully generated {len(thumbnails)} thumbnails")
            
            # Update project status to thumbnail (if not already at a later stage)
            current_project = self.supabase.table("projects").select("status").eq("id", project_id).single().execute()
            if current_project.data and current_project.data["status"] != "done":
                self.supabase.table("projects").update({"status": "thumbnail"}).eq("id", project_id).execute()
            
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
            logger.error(f"Thumbnail generation failed: {error_msg}")
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
    
    def download_image_from_url(self, url: str) -> tuple[Optional[str], Optional[str]]:
        """
        Download an image from a URL and return base64 + mime type.
        Handles YouTube thumbnail URLs.
        """
        try:
            # Convert YouTube video URLs to thumbnail URLs
            if "youtube.com/watch" in url or "youtu.be/" in url:
                video_id = self.extract_youtube_video_id(url)
                if video_id:
                    url = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
                    logger.info(f"Converted YouTube video URL to thumbnail: {url}")
            
            # Download image
            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; ThumbnailGenerator/1.0)"
            }
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code != 200:
                # Try fallback quality for YouTube
                if "maxresdefault.jpg" in url:
                    logger.info("Trying fallback thumbnail quality...")
                    fallback_url = url.replace("maxresdefault.jpg", "hqdefault.jpg")
                    return self.download_image_from_url(fallback_url)
                return None, None
            
            # Get MIME type
            mime_type = response.headers.get("content-type", "image/jpeg")
            if "jpeg" in mime_type or "jpg" in mime_type:
                mime_type = "image/jpeg"
            elif "png" in mime_type:
                mime_type = "image/png"
            elif "webp" in mime_type:
                mime_type = "image/webp"
            else:
                mime_type = "image/jpeg"
            
            # Convert to base64
            image_base64 = base64.b64encode(response.content).decode("utf-8")
            
            logger.info(f"Downloaded image: {len(response.content)} bytes, MIME: {mime_type}")
            
            return image_base64, mime_type
        except Exception as e:
            logger.error(f"Failed to download image from {url}: {e}")
            return None, None
    
    def extract_youtube_video_id(self, url: str) -> Optional[str]:
        """Extract YouTube video ID from various URL formats"""
        import re
        patterns = [
            r"(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})",
            r"youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})"
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return None
    
    def build_face_swap_prompt(
        self,
        user_name: Optional[str],
        title: str,
        text_modifications: Optional[str],
        prompt_additions: Optional[str],
        idea_brief_markdown: Optional[str]
    ) -> str:
        """Build the prompt for face swap thumbnail generation"""
        user_name = user_name or "the person"
        
        prompt = f"""IMAGE 1: Reference photo of {user_name}'s face.
IMAGE 2: The thumbnail to edit.

TASK: Replace ONLY the face in the thumbnail with {user_name}'s exact face from IMAGE 1.

Keep the composition, background, colors, and layout identical to IMAGE 2.

{f'Text changes: {text_modifications}' if text_modifications else 'Keep all text exactly as shown in IMAGE 2.'}

Video title context: "{title}"
"""
        
        if idea_brief_markdown:
            prompt += f"""\n\nIdea Brief: {idea_brief_markdown}
When adding or modifying text on the thumbnail, ensure it aligns with the core concepts and message from this idea brief.
"""
        
        prompt += "\n\nOutput in 16:9 format."
        
        if prompt_additions:
            prompt += f"\n\nAdditional requirements: {prompt_additions}"
        
        return prompt
    
    def generate_thumbnails_via_gemini(
        self,
        headshot_base64: str,
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
        
        # Build request body
        request_body = {
            "contents": [{
                "role": "user",
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": "image/jpeg",  # Headshot
                            "data": headshot_base64
                        }
                    },
                    {
                        "inlineData": {
                            "mimeType": reference_mime_type,  # Reference thumbnail
                            "data": reference_base64
                        }
                    },
                    {
                        "text": prompt
                    }
                ]
            }],
            "generationConfig": {
                "responseModalities": ["IMAGE", "TEXT"],
                "imageConfig": {
                    "aspectRatio": "16:9"
                }
            }
        }
        
        # Add imageSize for gemini-3-pro-image-preview
        if model == "gemini-3-pro-image-preview":
            request_body["generationConfig"]["imageConfig"]["imageSize"] = "2K"
        
        # Generate images (one at a time, as Gemini typically returns 1 image per request)
        generated_images = []
        
        for i in range(count):
            logger.info(f"Generating thumbnail {i+1}/{count}...")
            
            try:
                response = requests.post(
                    f"{endpoint}/models/{model}:generateContent?key={api_key}",
                    headers={"Content-Type": "application/json"},
                    json=request_body,
                    timeout=120
                )
                
                if response.status_code != 200:
                    logger.error(f"Gemini API error: {response.status_code} {response.text}")
                    continue
                
                data = response.json()
                
                # Extract images from response
                if data.get("candidates") and data["candidates"][0].get("content", {}).get("parts"):
                    for part in data["candidates"][0]["content"]["parts"]:
                        if part.get("inlineData", {}).get("data"):
                            generated_images.append(part["inlineData"]["data"])
                            logger.info(f"Generated thumbnail {i+1}")
                
            except Exception as e:
                logger.error(f"Failed to generate thumbnail {i+1}: {e}")
        
        return generated_images

