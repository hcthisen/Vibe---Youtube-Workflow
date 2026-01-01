#!/bin/bash

# Search Processor Worker Start Script
# Runs the worker with auto-restart on failure

echo "Starting Search Processor Worker..."

while true; do
    npm run start
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "Worker exited cleanly"
        break
    else
        echo "Worker crashed with exit code $EXIT_CODE"
        echo "Restarting in 5 seconds..."
        sleep 5
    fi
done

