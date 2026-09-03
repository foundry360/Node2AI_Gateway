#!/bin/bash
# Create VPC installation package (ISO, Cloud-Init, or Archive)

set -e

VERSION=${VERSION:-"1.0.0"}
FORMAT=${FORMAT:-"archive"}  # iso, cloud-init, archive, all
PLATFORM=${PLATFORM:-"aws"}  # aws, azure, gcp, all

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    *)
      log_warn "Unknown option: $1"
      shift
      ;;
  esac
done

PACKAGE_NAME="node2ai-enterprise-vpc-v${VERSION}"
BUILD_DIR="dist/vpc-installer"
PACKAGE_DIR="${BUILD_DIR}/${PACKAGE_NAME}"

log_info "Creating VPC installer package: ${PACKAGE_NAME}"
log_info "Format: ${FORMAT}"
log_info "Platform: ${PLATFORM}"

# Create package directory
mkdir -p "${PACKAGE_DIR}"

# Copy enterprise package contents
log_info "Copying enterprise package files..."
if [ -d "enterprise-package" ]; then
  cp -r enterprise-package/* "${PACKAGE_DIR}/" 2>/dev/null || true
  log_info "Copied enterprise-package directory"
elif [ -f "scripts/create-enterprise-package.sh" ]; then
  log_info "Creating enterprise package first..."
  ./scripts/create-enterprise-package.sh "${VERSION}" || {
    log_warn "Enterprise package creation failed, continuing with minimal package..."
  }
  if [ -d "node2ai-enterprise-v${VERSION}" ]; then
    cp -r "node2ai-enterprise-v${VERSION}"/* "${PACKAGE_DIR}/" 2>/dev/null || true
  fi
else
  log_warn "Enterprise package not found. Creating minimal package..."
  # Create minimal structure
  mkdir -p "${PACKAGE_DIR}"/{docker,kubernetes,standalone,scripts,config,docs}
  if [ -d "docker" ]; then
    cp -r docker/* "${PACKAGE_DIR}/docker/" 2>/dev/null || true
  fi
  if [ -d "kubernetes" ]; then
    cp -r kubernetes/* "${PACKAGE_DIR}/kubernetes/" 2>/dev/null || true
  fi
  if [ -d "scripts" ]; then
    cp scripts/*.sh "${PACKAGE_DIR}/scripts/" 2>/dev/null || true
  fi
fi

# Create VPC-specific installer
log_info "Creating VPC installer script..."

cat > "${PACKAGE_DIR}/install-vpc.sh" <<'INSTALLER_EOF'
#!/bin/bash
# Node2AI Enterprise VPC Installation Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Node2AI Enterprise VPC Installation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Detect cloud platform
detect_cloud() {
  if [ -f /sys/hypervisor/uuid ] && grep -q ec2 /sys/hypervisor/uuid 2>/dev/null; then
    echo "aws"
  elif curl -s -H Metadata:true "http://169.254.169.254/metadata/instance?api-version=2017-08-01" &>/dev/null; then
    echo "azure"
  elif curl -s -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/id" &>/dev/null; then
    echo "gcp"
  else
    echo "unknown"
  fi
}

CLOUD=$(detect_cloud)
echo "Detected cloud platform: $CLOUD"

# Get instance IP
INSTANCE_IP=$(hostname -I | awk '{print $1}' || echo "localhost")

# Choose installation method
if [ -d "docker" ]; then
  echo ""
  echo "Installing via Docker..."
  cd docker
  
  # Create .env if it doesn't exist
  if [ ! -f ".env" ]; then
    if [ -f "../config/.env.example" ]; then
      cp ../config/.env.example .env
    elif [ -f ".env.example" ]; then
      cp .env.example .env
    fi
    
    # Generate secrets if script exists
    if [ -f "../scripts/utils/generate-secrets.sh" ]; then
      chmod +x ../scripts/utils/generate-secrets.sh
      ../scripts/utils/generate-secrets.sh >> .env
    fi
  fi
  
  # Load Docker images if they exist
  if [ -d "../docker/images" ]; then
    echo "Loading Docker images..."
    for img in ../docker/images/*.tar.gz; do
      if [ -f "$img" ]; then
        echo "Loading $(basename $img)..."
        docker load < "$img" || true
      fi
    done
  fi
  
  # Start services
  echo "Starting services..."
  docker-compose up -d
  
  echo ""
  echo "✅ Installation complete!"
  echo "Dashboard: http://${INSTANCE_IP}:3000"
  echo "API: http://${INSTANCE_IP}:3001"
  
elif [ -d "kubernetes" ]; then
  echo ""
  echo "Installing via Kubernetes..."
  
  # Check if kubectl is available
  if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl not found. Please install kubectl first."
    exit 1
  fi
  
  kubectl apply -f kubernetes/
  
  echo ""
  echo "✅ Installation complete!"
  echo "Check status with: kubectl get pods -n node2ai"
  
else
  echo ""
  echo "Installing standalone..."
  cd standalone
  
  if [ -f "install.sh" ]; then
    chmod +x install.sh
    sudo ./install.sh
  else
    echo "❌ Standalone installer not found"
    exit 1
  fi
  
  echo ""
  echo "✅ Installation complete!"
  echo "Dashboard: http://${INSTANCE_IP}:3000"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
INSTALLER_EOF

chmod +x "${PACKAGE_DIR}/install-vpc.sh"

# Function to create ISO
create_iso() {
  log_info "Building ISO image..."
  
  # Check for ISO creation tools
  ISO_TOOL=""
  if command -v genisoimage &> /dev/null; then
    ISO_TOOL="genisoimage"
  elif command -v mkisofs &> /dev/null; then
    ISO_TOOL="mkisofs"
  elif [[ "$(uname)" == "Darwin" ]] && command -v hdiutil &> /dev/null; then
    ISO_TOOL="hdiutil"
    log_info "Using macOS native hdiutil (will create DMG instead of ISO)"
    log_info "DMG can be used on macOS or converted to ISO if needed"
  else
    log_error "ISO creation tools not found."
    log_error ""
    log_error "Install options:"
    log_error "  macOS:"
    log_error "    Option 1: brew install genisoimage (creates true ISO)"
    log_error "    Option 2: Use hdiutil (native macOS - creates DMG, works as ISO alternative)"
    log_error "  Linux (Ubuntu/Debian): sudo apt-get install genisoimage"
    log_error "  Linux (RHEL/CentOS): sudo yum install genisoimage"
    log_error ""
    log_error "For macOS, you can install genisoimage with: brew install genisoimage"
    log_error "Or use the DMG format which works similarly to ISO on macOS."
    return 1
  fi
  
  ISO_NAME="${PACKAGE_NAME}.iso"
  
  # Create README for ISO
  cat > "${PACKAGE_DIR}/README.txt" <<EOF
Node2AI Enterprise VPC Installation
====================================

Version: ${VERSION}

This ISO contains the complete Node2AI Enterprise installation package.

INSTALLATION INSTRUCTIONS:
--------------------------

1. Mount this ISO on your VPC instance:
   
   AWS EC2:
   - Attach ISO as EBS volume
   - Mount: sudo mount /dev/xvdf /mnt/iso
   
   Azure VM:
   - Attach ISO as disk
   - Mount: sudo mount /dev/sdc /mnt/iso
   
   Google Cloud:
   - Attach ISO as disk
   - Mount: sudo mount /dev/sdb /mnt/iso

2. Run the installer:
   cd /mnt/iso
   sudo ./install-vpc.sh

3. Access the dashboard:
   http://YOUR_INSTANCE_IP:3000

For detailed instructions, see INSTALL.md

EOF
  
  # Create ISO
  if [ "${ISO_TOOL}" = "hdiutil" ]; then
    # macOS hdiutil creates DMG, not ISO directly
    DMG_NAME="${PACKAGE_NAME}.dmg"
    log_info "Creating DMG with hdiutil (macOS native)..."
    
    # Remove existing DMG if present
    rm -f "${BUILD_DIR}/${DMG_NAME}"
    
    # Create DMG
    hdiutil create -volname "Node2AI Enterprise ${VERSION}" \
      -srcfolder "${PACKAGE_DIR}" \
      -ov -format UDZO \
      "${BUILD_DIR}/${DMG_NAME}" || {
      log_error "DMG creation failed"
      return 1
    }
    
    log_info "✅ DMG created: ${BUILD_DIR}/${DMG_NAME}"
    log_warn "Note: DMG created instead of ISO. To convert to ISO:"
    log_warn "  hdiutil convert ${DMG_NAME} -format UDTO -o ${PACKAGE_NAME}.cdr"
    log_warn "  hdiutil makehybrid -iso -joliet -o ${ISO_NAME} ${PACKAGE_NAME}.cdr.dmg"
    
    # Create checksum for DMG
    cd "${BUILD_DIR}"
    if command -v sha256sum &> /dev/null; then
      sha256sum "${DMG_NAME}" > "${DMG_NAME}.sha256"
    elif command -v shasum &> /dev/null; then
      shasum -a 256 "${DMG_NAME}" > "${DMG_NAME}.sha256"
    fi
    log_info "✅ Checksum created: ${DMG_NAME}.sha256"
    
  else
    # Use genisoimage or mkisofs
    log_info "Creating ISO with ${ISO_TOOL}..."
    ${ISO_TOOL} -o "${BUILD_DIR}/${ISO_NAME}" \
      -V "Node2AI Enterprise ${VERSION}" \
      -J -r \
      -quiet \
      "${PACKAGE_DIR}" || {
      log_error "ISO creation failed"
      return 1
    }
    
    log_info "✅ ISO created: ${BUILD_DIR}/${ISO_NAME}"
    
    # Create checksum
    cd "${BUILD_DIR}"
    if command -v sha256sum &> /dev/null; then
      sha256sum "${ISO_NAME}" > "${ISO_NAME}.sha256"
    elif command -v shasum &> /dev/null; then
      shasum -a 256 "${ISO_NAME}" > "${ISO_NAME}.sha256"
    fi
    log_info "✅ Checksum created: ${ISO_NAME}.sha256"
  fi
}

# Function to create Cloud-Init package
create_cloud_init() {
  log_info "Creating Cloud-Init packages..."
  
  PLATFORMS=("aws" "azure" "gcp")
  if [ "$PLATFORM" != "all" ]; then
    PLATFORMS=("$PLATFORM")
  fi
  
  for platform in "${PLATFORMS[@]}"; do
    log_info "Creating Cloud-Init package for ${platform}..."
    
    mkdir -p "${PACKAGE_DIR}/cloud-init/${platform}"
    
    # Read installer script content (escaped for YAML)
    INSTALLER_CONTENT=$(cat "${PACKAGE_DIR}/install-vpc.sh" | sed 's/^/      /')
    
    # Create platform-specific cloud-init config
    cat > "${PACKAGE_DIR}/cloud-init/${platform}/user-data.yaml" <<CLOUDINIT_EOF
#cloud-config
# Node2AI Enterprise - ${platform} Cloud-Init Configuration
# Version: ${VERSION}

package_update: true
package_upgrade: true

packages:
  - docker.io
  - docker-compose
  - curl
  - wget
  - git
  - jq
  - unzip

write_files:
  - path: /opt/node2ai/install-vpc.sh
    permissions: '0755'
    owner: root:root
    content: |
${INSTALLER_CONTENT}

runcmd:
  - mkdir -p /opt/node2ai
  - |
    if [ -d /tmp/node2ai-enterprise* ]; then
      cp -r /tmp/node2ai-enterprise*/* /opt/node2ai/ 2>/dev/null || true
    fi
  - cd /opt/node2ai
  - chmod +x install-vpc.sh || true
  - ./install-vpc.sh || echo "Installation script executed"

final_message: |
  Node2AI Enterprise installation complete!
  
  Access the dashboard at: http://PUBLIC_IP:3000
  API endpoint: http://PUBLIC_IP:3001/api/health
  
CLOUDINIT_EOF

    # Create archive for cloud-init
    cd "${PACKAGE_DIR}"
    tar czf "${BUILD_DIR}/${PACKAGE_NAME}-${platform}-cloud-init.tar.gz" \
      cloud-init/${platform}/user-data.yaml \
      install-vpc.sh \
      docker/ \
      kubernetes/ \
      standalone/ \
      scripts/ \
      config/ \
      docs/ \
      2>/dev/null || true
    
    log_info "✅ Cloud-Init package created: ${BUILD_DIR}/${PACKAGE_NAME}-${platform}-cloud-init.tar.gz"
    
    # Create checksum
    cd "${BUILD_DIR}"
    if command -v sha256sum &> /dev/null; then
      sha256sum "${PACKAGE_NAME}-${platform}-cloud-init.tar.gz" > "${PACKAGE_NAME}-${platform}-cloud-init.tar.gz.sha256"
    elif command -v shasum &> /dev/null; then
      shasum -a 256 "${PACKAGE_NAME}-${platform}-cloud-init.tar.gz" > "${PACKAGE_NAME}-${platform}-cloud-init.tar.gz.sha256"
    fi
  done
}

# Function to create archive
create_archive() {
  log_info "Creating archive package..."
  
  cd "${BUILD_DIR}"
  tar czf "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}" || {
    log_error "Archive creation failed"
    return 1
  }
  
  # Create checksum
  if command -v sha256sum &> /dev/null; then
    sha256sum "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.tar.gz.sha256"
  elif command -v shasum &> /dev/null; then
    shasum -a 256 "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.tar.gz.sha256"
  fi
  
  log_info "✅ Archive created: ${BUILD_DIR}/${PACKAGE_NAME}.tar.gz"
  log_info "✅ Checksum created: ${PACKAGE_NAME}.tar.gz.sha256"
}

# Create format-specific packages
case $FORMAT in
  iso)
    create_iso
    ;;
  cloud-init)
    create_cloud_init
    ;;
  archive)
    create_archive
    ;;
  all)
    create_archive
    create_cloud_init
    create_iso
    ;;
  *)
    log_error "Unknown format: ${FORMAT}"
    log_error "Supported formats: iso, cloud-init, archive, all"
    exit 1
    ;;
esac

log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "✅ VPC installer package created successfully!"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Package location: ${BUILD_DIR}/"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

