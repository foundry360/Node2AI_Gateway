# Converting DMG to ISO for VPC Deployment

When creating VPC installer packages on macOS, the script uses `hdiutil` which creates a DMG file instead of an ISO. This guide explains how to convert DMG to ISO if needed.

## Why DMG Instead of ISO?

On macOS, the native tool `hdiutil` creates DMG (Disk Image) files, which are the standard format for macOS disk images. For VPC deployments that require ISO format (especially for Linux/Windows VPCs), you can convert the DMG to ISO.

## DMG vs ISO

- **DMG**: Native macOS format, works great for macOS deployments
- **ISO**: Universal format, works on all platforms including Linux/Windows VPCs

## Converting DMG to ISO

### Method 1: Using hdiutil (macOS)

```bash
cd dist/vpc-installer

# Step 1: Convert DMG to CDR (intermediate format)
hdiutil convert node2ai-enterprise-vpc-v1.0.0.dmg \
  -format UDTO \
  -o node2ai-enterprise-vpc-v1.0.0.cdr

# Step 2: Convert CDR to ISO
hdiutil makehybrid -iso -joliet \
  -o node2ai-enterprise-vpc-v1.0.0.iso \
  node2ai-enterprise-vpc-v1.0.0.cdr.dmg

# Clean up intermediate file
rm node2ai-enterprise-vpc-v1.0.0.cdr.dmg
```

### Method 2: Install genisoimage (Recommended for Production)

If you need to create ISO files directly, install `genisoimage`:

```bash
# Install via Homebrew
brew install genisoimage

# Then run the installer script - it will use genisoimage automatically
./scripts/create-vpc-installer.sh --format iso --version 1.0.0
```

## Using DMG on VPCs

### For macOS VPCs

DMG files work directly on macOS VPC instances:

```bash
# Mount DMG
hdiutil attach node2ai-enterprise-vpc-v1.0.0.dmg

# Access contents
cd /Volumes/Node2AI\ Enterprise\ 1.0.0/
sudo ./install-vpc.sh

# Unmount when done
hdiutil detach /Volumes/Node2AI\ Enterprise\ 1.0.0/
```

### For Linux/Windows VPCs

For Linux or Windows VPC instances, you'll need to convert to ISO:

1. Convert DMG to ISO using the method above
2. Upload ISO to your VPC instance
3. Mount and install as documented in [VPC_DEPLOYMENT.md](VPC_DEPLOYMENT.md)

## Automated Conversion Script

You can add this to your workflow:

```bash
#!/bin/bash
# convert-dmg-to-iso.sh

DMG_FILE="$1"
ISO_FILE="${DMG_FILE%.dmg}.iso"

if [ ! -f "$DMG_FILE" ]; then
  echo "Error: DMG file not found: $DMG_FILE"
  exit 1
fi

echo "Converting $DMG_FILE to $ISO_FILE..."

# Convert to CDR
hdiutil convert "$DMG_FILE" -format UDTO -o "${DMG_FILE%.dmg}.cdr"

# Convert to ISO
hdiutil makehybrid -iso -joliet -o "$ISO_FILE" "${DMG_FILE%.dmg}.cdr.dmg"

# Clean up
rm "${DMG_FILE%.dmg}.cdr.dmg"

echo "✅ ISO created: $ISO_FILE"
```

Usage:

```bash
chmod +x convert-dmg-to-iso.sh
./convert-dmg-to-iso.sh dist/vpc-installer/node2ai-enterprise-vpc-v1.0.0.dmg
```

## Best Practices

1. **For macOS deployments**: Use DMG directly (no conversion needed)
2. **For Linux/Windows VPCs**: Convert to ISO first
3. **For production**: Install `genisoimage` to create ISO directly
4. **For CI/CD**: Add conversion step to your build pipeline

## Verification

After conversion, verify the ISO:

```bash
# Check ISO contents (Linux)
isoinfo -l -i node2ai-enterprise-vpc-v1.0.0.iso

# Verify checksum
sha256sum -c node2ai-enterprise-vpc-v1.0.0.iso.sha256
```

## Support

- [VPC Deployment Guide](VPC_DEPLOYMENT.md)
- [VPC Packaging Guide](VPC_PACKAGING_GUIDE.md)
