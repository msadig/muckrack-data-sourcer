#!/bin/bash

# Docker build script for Multilogin container
# Supports both AMD64 and ARM64 architectures

echo "======================================"
echo "Building Multilogin Docker Container"
echo "======================================"

# Detect system architecture
ARCH=$(uname -m)
echo "System architecture: $ARCH"

# Set Docker platform based on architecture
if [[ "$ARCH" == "x86_64" ]]; then
    PLATFORM="linux/amd64"
elif [[ "$ARCH" == "arm64" ]] || [[ "$ARCH" == "aarch64" ]]; then
    PLATFORM="linux/arm64"
    echo "Note: Building for ARM64. The container will use emulation for x86_64 Multilogin binary."
    echo "This may impact performance. For best results, use an x86_64 system."
else
    echo "Unsupported architecture: $ARCH"
    exit 1
fi

# Check if docker compose or docker-compose is available
if command -v docker compose &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "Error: docker compose not found. Please install Docker Compose."
    exit 1
fi

# Build options
BUILD_OPTS="--no-cache"
if [[ "$1" == "--cached" ]]; then
    BUILD_OPTS=""
    echo "Using cached layers for faster build..."
fi

# Build with docker-compose
echo "Building with platform: $PLATFORM"
$COMPOSE_CMD build $BUILD_OPTS

if [ $? -eq 0 ]; then
    echo ""
    echo "======================================"
    echo "Build completed successfully!"
    echo "======================================"
    echo ""
    echo "To run the container, use:"
    echo "  ./docker-run.sh"
    echo ""
    echo "Or with docker-compose:"
    echo "  $COMPOSE_CMD up -d"
    echo ""
else
    echo ""
    echo "======================================"
    echo "Build failed!"
    echo "======================================"
    exit 1
fi