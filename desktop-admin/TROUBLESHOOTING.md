# Desktop Admin App - Troubleshooting

## Common Issues and Solutions

### macOS Secure Coding Warning

**Warning:**

```
WARNING: Secure coding is automatically enabled for restorable state!
```

**Solution:** This is a harmless macOS warning. Electron handles secure coding internally. You can ignore it.

**To Suppress (Optional):**
This warning doesn't affect functionality. If you want to suppress it, you can add to `main.js`:

```javascript
// Suppress macOS secure coding warning
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
```

However, it's recommended to leave it as-is since it doesn't impact functionality.

### App Won't Start

**Symptoms:**

- `electron: command not found`
- `node_modules missing`

**Solution:**

```bash
# From project root
pnpm install

# Or from desktop-admin directory
cd desktop-admin
pnpm install
```

### Dashboard Won't Load

**Symptoms:**

- Blank window
- "Cannot connect" error
- Network error

**Solution:**

1. **Check backend services are running:**

   ```bash
   # Terminal 1: API Server
   cd apps/api
   pnpm dev

   # Terminal 2: Web Dashboard
   cd apps/web
   pnpm dev
   ```

2. **Verify services are accessible:**

   ```bash
   curl http://localhost:3000
   curl http://localhost:3001/api/health
   ```

3. **Check URL in main.js:**
   - Default: `http://localhost:3000`
   - Update if your dashboard runs on different port

### System Tray Not Working

**macOS:**

- May need accessibility permissions
- System Settings → Privacy & Security → Accessibility
- Add Terminal or Electron to allowed apps

**Linux:**

- Ensure system tray support is enabled
- May need: `sudo apt-get install libappindicator1`

**Windows:**

- Should work automatically

### Window Won't Close

**Symptoms:**

- Clicking X doesn't close window
- Window stays open

**Solution:**
This is expected behavior! The app minimizes to tray when you click X. To actually quit:

- Use menu: File → Quit
- Or: Cmd+Q (macOS) / Ctrl+Q (Windows/Linux)
- Or: Right-click tray icon → Quit

### DevTools Won't Open

**Symptoms:**

- DevTools don't appear in development mode

**Solution:**

1. Check `main.js` has:

   ```javascript
   if (isDev) {
     mainWindow.webContents.openDevTools();
   }
   ```

2. Manually open: View → Toggle Developer Tools
   Or: Cmd+Option+I (macOS) / Ctrl+Shift+I (Windows/Linux)

### Credentials Not Saving

**Symptoms:**

- Connection profiles not persisting
- Credentials lost on restart

**Solution:**

1. **Check keytar is installed:**

   ```bash
   pnpm list keytar
   ```

2. **Check OS keychain access:**
   - macOS: System Settings → Privacy → Keychain Access
   - Windows: Credential Manager permissions
   - Linux: Secret Service or libsecret

3. **Check electron-store:**
   ```bash
   pnpm list electron-store
   ```

### High Memory Usage

**Symptoms:**

- App uses > 500MB RAM
- System slows down

**Solution:**

1. Check for memory leaks:
   - Open DevTools → Memory tab
   - Take heap snapshot
   - Look for growing objects

2. Restart the app periodically

3. Check backend services aren't leaking memory

### App Crashes on Startup

**Symptoms:**

- App crashes immediately
- Error messages in console

**Solution:**

1. **Check console output:**

   ```bash
   pnpm dev
   # Look for error messages
   ```

2. **Check dependencies:**

   ```bash
   ./test-desktop-app.sh
   ```

3. **Reinstall dependencies:**
   ```bash
   rm -rf node_modules
   pnpm install
   ```

### Build Fails

**Symptoms:**

- `pnpm build` fails
- Missing icons or resources

**Solution:**

1. **Check icon files exist:**
   - `build/icon.ico` (Windows)
   - `build/icon.icns` (macOS)
   - `build/icons/` (Linux)

2. **Check electron-builder config:**
   - Verify `package.json` build section
   - Check file paths are correct

3. **Install build dependencies:**

   ```bash
   # macOS
   xcode-select --install

   # Linux
   sudo apt-get install fakeroot rpm
   ```

## Debugging Tips

### Enable Verbose Logging

```javascript
// In main.js
process.env.ELECTRON_ENABLE_LOGGING = '1';
```

### Check Electron Version

```bash
pnpm exec electron --version
```

### Check Node Version

```bash
node --version
# Should be 18+
```

### Inspect IPC Communication

```javascript
// In main.js, add logging
ipcMain.on('*', (event, ...args) => {
  console.log('IPC:', event, args);
});
```

### Check Window State

```javascript
// In main.js
mainWindow.on('ready-to-show', () => {
  console.log('Window bounds:', mainWindow.getBounds());
  console.log('Window visible:', mainWindow.isVisible());
});
```

## Getting Help

1. **Run pre-flight checks:**

   ```bash
   ./test-desktop-app.sh
   ```

2. **Check logs:**
   - DevTools console
   - Terminal output
   - System logs

3. **Document the issue:**
   - Error messages
   - Steps to reproduce
   - OS version
   - Electron version

4. **See documentation:**
   - `TESTING.md` - Complete testing guide
   - `QUICK_TEST.md` - Quick reference
   - `README.md` - General information
