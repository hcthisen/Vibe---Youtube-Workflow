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
    pkg-config \
    python3-dev \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for better Docker layer caching
COPY workers/media/requirements.txt ./workers/media/
RUN pip install --no-cache-dir -r workers/media/requirements.txt

# Copy worker code
COPY workers/media/ ./workers/media/
COPY supabase/ ./supabase/

# Create temp directory for video processing
RUN mkdir -p /tmp/yt-worker && chmod 777 /tmp/yt-worker

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV WORKER_TEMP_DIR=/tmp/yt-worker

# Run the worker
WORKDIR /app/workers/media
CMD ["python", "worker.py"]
