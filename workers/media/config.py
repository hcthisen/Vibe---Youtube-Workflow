"""
Configuration for the media worker.
"""
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class Config:
    # Database
    DATABASE_URL = os.getenv("DATABASE_URL")
    
    # Supabase
    SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    # Worker
    WORKER_SECRET = os.getenv("WORKER_SHARED_SECRET")
    POLL_INTERVAL = int(os.getenv("WORKER_POLL_INTERVAL", "5"))  # seconds
    
    # Processing
    TEMP_DIR = os.getenv("WORKER_TEMP_DIR", "/tmp/yt-worker")
    
    # Whisper
    WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
    
    # Upload settings
    UPLOAD_TIMEOUT_SECONDS = int(os.getenv("UPLOAD_TIMEOUT_SECONDS", "600"))  # 10 min
    # IMPORTANT: keep this small (Supabase storage gateway/proxies can reject large request bodies).
    # Frontend uses 6MB chunks for resumable uploads, so mirror that here.
    UPLOAD_CHUNK_SIZE_MB = int(os.getenv("UPLOAD_CHUNK_SIZE_MB", "6"))  # 6MB chunks
    UPLOAD_MAX_RETRIES = int(os.getenv("UPLOAD_MAX_RETRIES", "3"))
    
    @classmethod
    def validate(cls):
        """Validate that all required config is present."""
        required = [
            ("DATABASE_URL", cls.DATABASE_URL),
            ("SUPABASE_URL", cls.SUPABASE_URL),
            ("SUPABASE_SERVICE_KEY", cls.SUPABASE_SERVICE_KEY),
        ]
        
        missing = [name for name, value in required if not value]
        
        if missing:
            raise ValueError(f"Missing required configuration: {', '.join(missing)}")
        
        return True

