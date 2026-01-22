"""
Pose Analysis Handler - Analyze face direction in headshots.
"""
import os
import logging
from typing import Any, Dict
import numpy as np
from urllib.parse import urljoin

from .base import BaseHandler
from utils.url_safety import validate_external_url

logger = logging.getLogger(__name__)

MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_DOWNLOAD_BYTES", str(10 * 1024 * 1024)))
MAX_REDIRECTS = 3


class PoseAnalyzeHandler(BaseHandler):
    """Handler for headshot pose analysis jobs."""

    def __init__(self, supabase, temp_dir: str):
        super().__init__(supabase, temp_dir)
        self.face_mesh = None  # Lazy load

    def _load_face_mesh(self):
        """Load MediaPipe Face Mesh (lazy)."""
        if self.face_mesh is None:
            import mediapipe as mp
            self.face_mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=True,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5
            )
        return self.face_mesh

    def process(self, job_id: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze pose in a headshot image."""
        try:
            headshot_id = input_data.get("headshot_id")
            image_url = input_data.get("image_url")

            # Get headshot info if ID provided
            if headshot_id:
                headshot = self.supabase.table("headshots").select("*").eq(
                    "id", headshot_id
                ).single().execute()

                if not headshot.data:
                    return {"success": False, "error": "Headshot not found"}

                headshot_data = headshot.data
                bucket = headshot_data["bucket"]
                path = headshot_data["path"]
            elif image_url:
                # Download from URL
                bucket = None
                path = None
            else:
                return {"success": False, "error": "No headshot_id or image_url provided"}

            # Create temp file
            input_path = os.path.join(self.temp_dir, f"{job_id}_headshot.jpg")

            try:
                # Download image
                if bucket:
                    logger.info(f"Downloading headshot from {bucket}/{path}")
                    if not self.download_asset(bucket, path, input_path):
                        return {"success": False, "error": "Failed to download headshot"}
                else:
                    # Download from URL
                    import httpx
                    current_url = image_url
                    downloaded = False

                    for _ in range(MAX_REDIRECTS + 1):
                        ok, reason, normalized_url = validate_external_url(current_url)
                        if not ok or not normalized_url:
                            return {"success": False, "error": reason or "Invalid image_url"}

                        with httpx.stream(
                            "GET",
                            normalized_url,
                            follow_redirects=False,
                            timeout=30.0,
                        ) as response:
                            if response.status_code in (301, 302, 303, 307, 308):
                                location = response.headers.get("location")
                                if not location:
                                    return {"success": False, "error": "Redirect without location header"}
                                current_url = urljoin(normalized_url, location)
                                continue

                            if response.status_code >= 400:
                                return {
                                    "success": False,
                                    "error": f"Failed to download image_url (HTTP {response.status_code})",
                                }

                            content_type = response.headers.get("content-type", "")
                            if content_type and not content_type.startswith("image/"):
                                return {
                                    "success": False,
                                    "error": f"image_url did not return an image (content-type: {content_type})",
                                }

                            content_length = response.headers.get("content-length")
                            if content_length and int(content_length) > MAX_IMAGE_BYTES:
                                return {"success": False, "error": "image_url file too large"}

                            total = 0
                            with open(input_path, "wb") as f:
                                for chunk in response.iter_bytes():
                                    if not chunk:
                                        continue
                                    total += len(chunk)
                                    if total > MAX_IMAGE_BYTES:
                                        return {"success": False, "error": "image_url file too large"}
                                    f.write(chunk)

                            downloaded = True
                            break

                    if not downloaded:
                        return {"success": False, "error": "Too many redirects while fetching image_url"}

                # Analyze pose
                logger.info("Analyzing face pose")
                yaw, pitch = self._analyze_pose(input_path)

                # Determine bucket
                pose_bucket = self._get_pose_bucket(yaw, pitch)

                logger.info(f"Pose: yaw={yaw:.1f}, pitch={pitch:.1f}, bucket={pose_bucket}")

                # Update headshot record if ID provided
                if headshot_id:
                    self.supabase.table("headshots").update({
                        "pose_yaw": yaw,
                        "pose_pitch": pitch,
                        "pose_bucket": pose_bucket,
                    }).eq("id", headshot_id).execute()

                return {
                    "success": True,
                    "output": {
                        "yaw": yaw,
                        "pitch": pitch,
                        "bucket": pose_bucket,
                    },
                }

            finally:
                # Cleanup
                if os.path.exists(input_path):
                    os.remove(input_path)

        except Exception as e:
            logger.exception("Pose analysis failed")
            return {"success": False, "error": str(e)}

    def _analyze_pose(self, image_path: str) -> tuple:
        """Analyze face pose using solvePnP and return (yaw, pitch) in degrees."""
        import cv2

        # Read image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError("Could not read image")

        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        h, w = image.shape[:2]

        # Get face mesh
        face_mesh = self._load_face_mesh()
        results = face_mesh.process(rgb_image)

        if not results.multi_face_landmarks:
            # No face detected, return frontal
            return 0.0, 0.0

        landmarks = results.multi_face_landmarks[0]

        # Key landmarks for solvePnP:
        # Nose tip: 1, Chin: 152
        # Left eye outer: 33, Right eye outer: 263
        # Left mouth: 61, Right mouth: 291
        nose_tip = landmarks.landmark[1]
        chin = landmarks.landmark[152]
        left_eye_outer = landmarks.landmark[33]
        right_eye_outer = landmarks.landmark[263]
        left_mouth = landmarks.landmark[61]
        right_mouth = landmarks.landmark[291]

        # 2D image points from the image (in pixels)
        image_points = np.array([
            (nose_tip.x * w, nose_tip.y * h),        # Nose tip
            (chin.x * w, chin.y * h),                # Chin
            (left_eye_outer.x * w, left_eye_outer.y * h),   # Left eye outer corner
            (right_eye_outer.x * w, right_eye_outer.y * h), # Right eye outer corner
            (left_mouth.x * w, left_mouth.y * h),    # Left mouth corner
            (right_mouth.x * w, right_mouth.y * h),  # Right mouth corner
        ], dtype="double")

        # 3D model points. These are approximate generic face model points.
        # Values are in arbitrary units but must be consistent.
        model_points = np.array([
            (0.0, 0.0, 0.0),             # Nose tip
            (0.0, -63.6, -12.5),         # Chin
            (-43.3, 32.7, -26.0),        # Left eye outer corner
            (43.3, 32.7, -26.0),         # Right eye outer corner
            (-28.9, -28.9, -24.1),       # Left mouth corner
            (28.9, -28.9, -24.1),        # Right mouth corner
        ], dtype="double")

        # Camera internals (approximate)
        focal_length = w
        center = (w / 2, h / 2)
        camera_matrix = np.array(
            [
                [focal_length, 0, center[0]],
                [0, focal_length, center[1]],
                [0, 0, 1],
            ],
            dtype="double",
        )

        # Assume no lens distortion
        dist_coeffs = np.zeros((4, 1))

        # Solve for pose
        success, rotation_vector, _translation_vector = cv2.solvePnP(
            model_points, image_points, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
        )

        if not success:
            return 0.0, 0.0

        rotation_matrix, _ = cv2.Rodrigues(rotation_vector)

        pitch_deg, yaw_deg, _roll_deg = self._rotation_matrix_to_euler(rotation_matrix)

        # Convention:
        # - yaw > 0  => face turned LEFT
        # - yaw < 0  => face turned RIGHT
        # - pitch > 0 => looking DOWN
        # - pitch < 0 => looking UP
        return float(yaw_deg), float(pitch_deg)

    def _rotation_matrix_to_euler(self, rmat: np.ndarray) -> tuple:
        """
        Convert a rotation matrix to Euler angles (pitch, yaw, roll) in degrees.

        Uses a standard decomposition with handling for gimbal lock.
        """
        sy = np.sqrt(rmat[0, 0] * rmat[0, 0] + rmat[1, 0] * rmat[1, 0])
        singular = sy < 1e-6

        if not singular:
            x = np.arctan2(rmat[2, 1], rmat[2, 2])   # pitch
            y = np.arctan2(-rmat[2, 0], sy)          # yaw
            z = np.arctan2(rmat[1, 0], rmat[0, 0])   # roll
        else:
            x = np.arctan2(-rmat[1, 2], rmat[1, 1])
            y = np.arctan2(-rmat[2, 0], sy)
            z = 0.0

        return np.degrees(x), np.degrees(y), np.degrees(z)

    def _get_pose_bucket(self, yaw: float, pitch: float) -> str:
        """Determine pose bucket from yaw and pitch."""
        # Thresholds (degrees). Tuned for solvePnP-based angles.
        # User feedback: front should be ±25°, level should be ±10° from ±180
        yaw_thresh = 25.0
        
        # Horizontal: yaw > 0 => left, yaw < 0 => right
        if abs(yaw) < yaw_thresh:
            horizontal = "front"
        elif yaw > 0:
            horizontal = "left"
        else:
            horizontal = "right"

        # Vertical: pitch near ±180 is level (face looking straight at camera)
        # Calculate distance from ±180
        pitch_from_level = min(abs(pitch - 180), abs(pitch + 180))
        
        if pitch_from_level < 10:  # Within 10° of ±180 is "level"
            vertical = ""
        elif pitch > 0 and pitch < 180:
            # Pitch between 0 and 180 (closer to 0) = looking down
            vertical = "down"
        else:
            # Pitch between 0 and -180 (closer to -180) = looking up
            vertical = "up"

        if not vertical:
            return horizontal
        elif horizontal == "front":
            return vertical
        else:
            return f"{vertical}-{horizontal}"
