#!/bin/bash

# Docker run script for Multilogin container

echo "======================================"
echo "Starting Multilogin Docker Container"
echo "======================================"

# Load environment variables from .env if it exists
if [ -f .env ]; then
    echo "Loading environment variables from .env file..."
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check for required environment variables
if [ -z "$MULTILOGIN_EMAIL" ] || [ -z "$MULTILOGIN_PASSWORD" ]; then
    echo "Error: MULTILOGIN_EMAIL and MULTILOGIN_PASSWORD must be set"
    echo ""
    echo "Please set these in your .env file or export them:"
    echo "  export MULTILOGIN_EMAIL=your_email"
    echo "  export MULTILOGIN_PASSWORD=your_password"
    echo ""
    echo "Or run with inline environment variables:"
    echo "  MULTILOGIN_EMAIL=your_email MULTILOGIN_PASSWORD=your_password ./docker-run.sh"
    exit 1
fi

# Set default VNC password if not provided
VNC_PASSWORD=${VNC_PASSWORD:-"vncpass"}

# Check if docker compose or docker-compose is available
if command -v docker compose &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "Error: docker compose not found. Please install Docker Compose."
    exit 1
fi

# Stop existing container if running
echo "Checking for existing containers..."
$COMPOSE_CMD down 2>/dev/null

# Start the container
echo "Starting Multilogin container..."
$COMPOSE_CMD up -d

# Wait for container to be ready
echo "Waiting for container to be ready..."
sleep 5

# Check container status
if $COMPOSE_CMD ps | grep -q "multilogin-browser.*Up"; then
    echo ""
    echo "======================================"
    echo "Container started successfully!"
    echo "======================================"
    echo ""
    echo "Access points:"
    echo "  - Multilogin API: http://localhost:35000"
    echo "  - Automation Port: http://localhost:45001"
    echo "  - VNC Viewer: vnc://localhost:5900 (password: $VNC_PASSWORD)"
    echo "  - Web Browser (noVNC): http://localhost:6080/vnc.html"
    echo ""
    echo "To view logs:"
    echo "  $COMPOSE_CMD logs -f multilogin"
    echo ""
    echo "To stop the container:"
    echo "  $COMPOSE_CMD down"
    echo ""
    echo "To check API health:"
    echo "  curl http://localhost:35000/api/v2/profile/list"
    echo ""
else
    echo ""
    echo "======================================"
    echo "Container failed to start!"
    echo "======================================"
    echo ""
    echo "Check logs with:"
    echo "  $COMPOSE_CMD logs multilogin"
    exit 1
fi