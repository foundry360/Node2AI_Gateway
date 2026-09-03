# Node2AI Desktop Admin Control Center

Native desktop application for managing Node2AI Enterprise installations.

## Features

- **Multi-Instance Management**: Connect to multiple Node2AI installations
- **System Tray Integration**: Quick access from system tray
- **Real-time Dashboard**: Live metrics and health monitoring
- **User Management**: Manage users and permissions
- **Configuration Editor**: Edit settings with validation
- **Backup/Restore**: Trigger backups from the app
- **Log Viewer**: Search and filter application logs
- **Service Controls**: Start/stop/restart services
- **Auto-Update**: Automatic updates with notifications

## Installation

### Windows

1. Download `Node2AI-Admin-Setup-1.0.0.exe`
2. Run the installer
3. Follow the setup wizard
4. Launch from Start Menu

### macOS

1. Download `Node2AI-Admin-1.0.0.dmg`
2. Open the DMG file
3. Drag to Applications folder
4. Launch from Applications

### Linux

**Debian/Ubuntu:**

```bash
sudo dpkg -i Node2AI-Admin-1.0.0.deb
sudo apt-get install -f
```

**RedHat/Fedora:**

```bash
sudo rpm -i Node2AI-Admin-1.0.0.rpm
```

**AppImage (Universal):**

```bash
chmod +x Node2AI-Admin-1.0.0.AppImage
./Node2AI-Admin-1.0.0.AppImage
```

## First Launch

1. **Welcome Wizard**: Configure your first connection
2. **Connection Profile**: Add Node2AI instance URL
3. **Authentication**: Enter credentials (stored securely)
4. **Health Check**: Verify connection
5. **Quick Tour**: Learn the interface

## Connection Profiles

Create profiles for different environments:

- **Local**: `http://localhost:3000`
- **Development**: `http://dev.node2ai.internal`
- **Staging**: `https://staging.node2ai.com`
- **Production**: `https://node2ai.company.com`

## Security

- **Encrypted Storage**: Credentials stored in OS keychain
- **TLS/SSL**: Certificate validation enabled
- **Session Management**: Automatic timeout
- **Role-Based Access**: Respects user permissions

## Keyboard Shortcuts

- `Cmd/Ctrl + N`: New connection
- `Cmd/Ctrl + ,`: Settings
- `Cmd/Ctrl + K`: Quick search
- `Cmd/Ctrl + R`: Refresh dashboard
- `Cmd/Ctrl + Q`: Quit

## Troubleshooting

### Connection Issues

1. Verify Node2AI instance is running
2. Check network connectivity
3. Verify URL and credentials
4. Check firewall settings

### App Won't Start

1. Check system requirements
2. Verify installation completed
3. Check system logs
4. Reinstall if necessary

### Auto-Update Not Working

1. Check internet connectivity
2. Verify update server is accessible
3. Check firewall rules
4. Manual update available from Help menu

## Support

- **Documentation**: See `docs/desktop-admin/`
- **Issues**: Report bugs via support portal
- **Updates**: Check for updates in Help menu

## Development

### Building from Source

```bash
# Install dependencies
pnpm install

# Development mode
pnpm dev

# Build for all platforms
pnpm build

# Build for specific platform
pnpm build:win
pnpm build:mac
pnpm build:linux
```

### Requirements

- Node.js 18+
- pnpm 8+
- Platform-specific build tools:
  - Windows: Windows SDK
  - macOS: Xcode Command Line Tools
  - Linux: fakeroot, rpm (for RPM builds)
