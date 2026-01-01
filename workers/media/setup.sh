#!/bin/bash
# Setup script for media worker

set -e

echo "🎬 Setting up Video Processing Pipeline..."
echo ""

# Check for FFmpeg
echo "Checking for FFmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg not found!"
    echo "Please install FFmpeg:"
    echo "  macOS: brew install ffmpeg"
    echo "  Ubuntu: sudo apt install ffmpeg"
    exit 1
fi

if ! command -v ffprobe &> /dev/null; then
    echo "❌ FFprobe not found!"
    echo "Please install FFmpeg (includes ffprobe):"
    echo "  macOS: brew install ffmpeg"
    echo "  Ubuntu: sudo apt install ffmpeg"
    exit 1
fi

echo "✅ FFmpeg found: $(ffmpeg -version | head -n 1)"
echo ""

# Check for Python
echo "Checking for Python..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found!"
    exit 1
fi

echo "✅ Python found: $(python3 --version)"
echo ""

# Upgrade pip
echo "Upgrading pip..."
python3 -m pip install --upgrade pip
echo ""

# Install Python dependencies
echo "Installing Python dependencies..."
echo "⚠️  This will download ~60MB of packages (torch, torchaudio)"
echo "   Whisper models (~150MB) download on first use"
echo "   Press Ctrl+C to cancel, or wait 5 seconds to continue..."
sleep 5

pip3 install -r requirements.txt

echo ""
echo "✅ Dependencies installed!"
echo ""

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found"
    echo "Creating .env from template..."
    cat > .env << 'EOF'
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# OpenAI (for LLM retake analysis)
OPENAI_API_KEY=sk-...

# Worker Settings
POLL_INTERVAL=5
TEMP_DIR=/tmp/media-worker
EOF
    echo "✅ Created .env template"
    echo "⚠️  Please edit .env with your actual credentials"
    echo ""
fi

# Test imports
echo "Testing imports..."
python3 -c "
import torch
import whisper
from openai import OpenAI
print('✅ All imports successful')
"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your credentials"
echo "2. Run: python3 worker.py"
echo ""
echo "Test with project: http://localhost:3000/projects/2f597dc3-1ee2-476e-ac8d-472e02e5b58b"

