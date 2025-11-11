#!/bin/bash

# Multilogin startup script - API-based authentication approach
echo "Starting Multilogin service..."

# Find Multilogin installation paths
ML_HEADLESS=$(find /opt /usr/local/bin /usr/bin -name "headless.sh" 2>/dev/null | head -1)

if [ -z "$ML_HEADLESS" ]; then
    echo "Error: Could not find headless.sh script"
    echo "Searching for Multilogin installation..."
    find /opt -name "*multilogin*" -type f 2>/dev/null | head -10
    exit 1
fi

echo "Found Multilogin headless script: $ML_HEADLESS"

# Start Multilogin in headless mode WITHOUT login
# Authentication will be handled by the Node.js client using cloud API
echo "Starting Multilogin in headless mode..."
echo "API Port: 35000"
echo "Launcher Port: 45001"
echo ""
echo "Note: Skipping cli.sh login - authentication handled via cloud API"
echo ""

# Start headless mode
bash "$ML_HEADLESS" -port 35000 2>&1 &

HEADLESS_PID=$!
echo "Multilogin headless started with PID: $HEADLESS_PID"

# Keep the script running and monitor the process
while true; do
    sleep 10

    # Check if Multilogin is still running
    if ! pgrep -f "multilogin.*headless" > /dev/null; then
        echo "Multilogin process died, restarting..."
        exec "$0"
    fi
done
