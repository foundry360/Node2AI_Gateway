#!/bin/bash
# Script to load Docker images from tar files for offline installation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Loading Node2AI Docker images..."

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not in PATH"
    exit 1
fi

# Load images
for image in *.tar.gz; do
    if [ -f "$image" ]; then
        echo "Loading $image..."
        docker load -i "$image"
    fi
done

# Also check for .tar files (without compression)
for image in *.tar; do
    if [ -f "$image" ]; then
        echo "Loading $image..."
        docker load -i "$image"
    fi
done

echo ""
echo "✅ All images loaded successfully!"
echo ""
echo "Available images:"
docker images | grep node2ai || echo "No node2ai images found"

