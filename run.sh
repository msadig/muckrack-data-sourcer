#!/bin/bash

# Multilogin startup script
echo "Starting Multilogin service..."

# Check if credentials are provided
if [ -z "$ML_USERNAME" ] || [ -z "$ML_PASSWORD" ]; then
    echo "Error: ML_USERNAME and ML_PASSWORD environment variables must be set"
    exit 1
fi

# Find Multilogin installation paths
ML_CLI=$(find /opt/mlm /opt/multilogin /usr/local/bin /usr/bin -name "cli.sh" 2>/dev/null | head -1)
ML_HEADLESS=$(find /opt/mlm /opt/multilogin /usr/local/bin /usr/bin -name "headless.sh" 2>/dev/null | head -1)
ML_BIN=$(find /opt/mlm /opt/multilogin /usr/local/bin /usr/bin -name "multilogin" -type f 2>/dev/null | head -1)

# If specific scripts not found, try to use the main binary
if [ -z "$ML_CLI" ] || [ -z "$ML_HEADLESS" ]; then
    echo "Warning: Could not find cli.sh or headless.sh scripts"

    if [ -n "$ML_BIN" ]; then
        echo "Found Multilogin binary at: $ML_BIN"

        # Try to login using the binary directly
        echo "Attempting login with credentials..."
        $ML_BIN --login --username "$ML_USERNAME" --password "$ML_PASSWORD" 2>&1

        # Start Multilogin in headless mode on internal ports
        # socat will forward external ports (35000, 45001) to these internal ports
        echo "Starting Multilogin in headless mode on internal ports..."
        $ML_BIN --headless --port 35001 --automation-port 45002 2>&1
    else
        echo "Error: Could not find Multilogin installation"
        echo "Attempting fallback methods..."

        # Try direct paths from documentation
        if [ -f "/opt/mlm/cli.sh" ]; then
            bash /opt/mlm/cli.sh -login -u "$ML_USERNAME" -p "$ML_PASSWORD"
            bash /opt/mlm/headless.sh -port 35000
        else
            echo "Fatal: Multilogin installation not found in any expected location"
            exit 1
        fi
    fi
else
    echo "Found Multilogin scripts:"
    echo "CLI: $ML_CLI"
    echo "Headless: $ML_HEADLESS"

    # Login to Multilogin
    echo "Logging in to Multilogin..."
    bash "$ML_CLI" -login -u "$ML_USERNAME" -p "$ML_PASSWORD"

    # Check login status
    if [ $? -ne 0 ]; then
        echo "Error: Failed to login to Multilogin"
        exit 1
    fi

    echo "Login successful"

    # Start Multilogin in headless mode
    echo "Starting Multilogin in headless mode..."
    echo "API Port: 35000"
    echo "Automation Port: 45001"

    # Start with both ports configured
    bash "$ML_HEADLESS" -port 35000 -automation-port 45001
fi

# Keep the script running
while true; do
    sleep 10
    # Check if Multilogin is still running
    if ! pgrep -f multilogin > /dev/null; then
        echo "Multilogin process died, restarting..."
        exec "$0"
    fi
done