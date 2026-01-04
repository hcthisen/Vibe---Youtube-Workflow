FROM python:3.10-slim

# Install system dependencies required for video processing
RUN apt-get update && apt-get install -y \
    build-essential \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libsndfile1 \
    libglib2.0-0 \
    libgl1 \
    python3-dev \
    pkg-config \
    wget \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for better Docker layer caching
COPY workers/media/requirements.txt ./workers/media/
RUN pip install --no-cache-dir -r workers/media/requirements.txt

# Copy worker code
COPY workers/media/ ./workers/media/
COPY supabase/ ./supabase/
COPY ["Initial Templates - execution/video_effects", "/app/Initial Templates - execution/video_effects"]
COPY ["Initial Templates - execution/pan_3d_transition.py", "/app/Initial Templates - execution/pan_3d_transition.py"]

WORKDIR /app/Initial\ Templates\ -\ execution/video_effects
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Create temp directory for video processing
RUN mkdir -p /tmp/yt-worker && chmod 777 /tmp/yt-worker

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV WORKER_TEMP_DIR=/tmp/yt-worker

# Run the worker
WORKDIR /app/workers/media
CMD ["python", "worker.py"]
