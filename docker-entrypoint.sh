#!/bin/bash
set -e

# Docker entrypoint script for Multilogin
echo "======================================"
echo "Multilogin Docker Container Starting"
echo "======================================"

# Function to check if a port is available
check_port() {
    local port=$1
    if netstat -ln | grep -q ":$port "; then
        echo "Warning: Port $port is already in use"
        return 1
    fi
    return 0
}

# Validate environment variables
if [ -z "$ML_USERNAME" ] || [ -z "$ML_PASSWORD" ]; then
    echo "Warning: ML_USERNAME or ML_PASSWORD not set."
    echo "Please set these environment variables for Multilogin authentication."
    echo "Example: docker run -e ML_USERNAME=your_username -e ML_PASSWORD=your_password ..."
fi

# Setup display for GUI applications
export DISPLAY=${DISPLAY:-:99}
echo "Display set to: $DISPLAY"

# Create necessary directories
mkdir -p /root/.local/share/multilogin/profiles
mkdir -p /root/.config/multilogin
mkdir -p /var/run/supervisor

# Check for required ports
echo "Checking port availability..."
check_port 35000 || echo "Multilogin API port (35000) may have conflicts"
check_port 45001 || echo "Multilogin automation port (45001) may have conflicts"
check_port 5900 || echo "VNC port (5900) may have conflicts"
check_port 6080 || echo "noVNC port (6080) may have conflicts"

# Set VNC password if provided
if [ -n "$VNC_PASSWORD" ]; then
    echo "Setting VNC password..."
    mkdir -p /root/.vnc
    x11vnc -storepasswd "$VNC_PASSWORD" /root/.vnc/passwd
fi

# Check Multilogin installation
echo "Checking Multilogin installation..."
ML_LOCATIONS=(
    "/opt/multilogin/multilogin"
    "/usr/local/bin/multilogin"
    "/usr/bin/multilogin"
    "/opt/mlm/multilogin"
)

ML_FOUND=false
for location in "${ML_LOCATIONS[@]}"; do
    if [ -f "$location" ]; then
        echo "Found Multilogin at: $location"
        ML_FOUND=true
        break
    fi
done

if [ "$ML_FOUND" = false ]; then
    echo "Warning: Multilogin binary not found in expected locations"
    echo "Searching system..."
    find / -name "multilogin" -type f 2>/dev/null | head -5
fi

# Create a simple health check endpoint
cat > /opt/multilogin/health_check.sh << 'EOF'
#!/bin/bash
# Simple health check for Multilogin
if pgrep -f multilogin > /dev/null; then
    echo "Multilogin is running"
    exit 0
else
    echo "Multilogin is not running"
    exit 1
fi
EOF
chmod +x /opt/multilogin/health_check.sh

# Print connection information
echo ""
echo "======================================"
echo "Container Configuration:"
echo "======================================"
echo "Multilogin API Port: 35000"
echo "Multilogin Automation Port: 45001"
echo "VNC Port: 5900"
echo "noVNC Web Port: 6080"
echo ""
echo "To access the browser:"
echo "1. VNC: vnc://localhost:5900"
echo "2. Web Browser (noVNC): http://localhost:6080/vnc.html"
echo ""
echo "To use Multilogin API:"
echo "curl http://localhost:35000/api/v2/profile/list"
echo ""
echo "======================================"

# Execute the command passed to docker run
exec "$@"