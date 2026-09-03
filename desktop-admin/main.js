const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const keytar = require('keytar');

// Suppress macOS secure coding warning (cosmetic only)
if (process.platform === 'darwin') {
  app.on('ready', () => {
    // This warning is harmless - Electron handles secure coding internally
  });
}

const store = new Store();
const SERVICE_NAME = 'com.foundry360.node2ai.admin';

let mainWindow;
let tray;

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    icon: (() => {
      try {
        const iconPath = path.join(__dirname, 'build', 'icon.png');
        if (fs.existsSync(iconPath)) {
          return iconPath;
        }
      } catch (e) {
        // Icon file doesn't exist, use default
      }
      return undefined; // Use Electron default icon
    })(),
    show: false,
  });

  // Load the web dashboard
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from local server or remote instance
    const defaultUrl = store.get('defaultInstanceUrl', 'http://localhost:3000');
    mainWindow.loadURL(defaultUrl);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // Check for updates
    checkForUpdates();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle window close
  mainWindow.on('close', event => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();

      // Show notification on first minimize
      if (!store.get('hasSeenMinimizeNotification')) {
        showNotification(
          'Node2AI Admin',
          'Application is running in the background. Click the tray icon to restore.'
        );
        store.set('hasSeenMinimizeNotification', true);
      }
    }
  });
}

// Create system tray
function createTray() {
  let icon;
  try {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
    }
  } catch (e) {
    // Icon file doesn't exist
  }

  if (!icon || icon.isEmpty()) {
    // Create a simple colored square as fallback (1x1 transparent PNG)
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    );
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Node2AI Admin',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    {
      label: 'Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.loadURL(
            store.get('defaultInstanceUrl', 'http://localhost:3000')
          );
          mainWindow.show();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Node2AI Admin Control Center');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createWindow();
    }
  });
}

// Check for updates
function checkForUpdates() {
  // TODO: Implement auto-update mechanism
  // This would check for updates from a release server
}

// Show notification
function showNotification(title, body) {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    // Use native notifications
    new Notification(title, { body });
  }
}

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createTray();

  // Create application menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'New Connection',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            // Open connection dialog
          },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            // Show about dialog
          },
        },
        {
          label: 'Documentation',
          click: () => {
            // Open documentation
          },
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// IPC handlers for secure communication
ipcMain.handle('get-credentials', async (event, instanceId) => {
  const credentials = await keytar.getPassword(SERVICE_NAME, instanceId);
  return credentials ? JSON.parse(credentials) : null;
});

ipcMain.handle('save-credentials', async (event, instanceId, credentials) => {
  await keytar.setPassword(
    SERVICE_NAME,
    instanceId,
    JSON.stringify(credentials)
  );
  return true;
});

ipcMain.handle('delete-credentials', async (event, instanceId) => {
  await keytar.deletePassword(SERVICE_NAME, instanceId);
  return true;
});

ipcMain.handle('get-connection-profiles', () => {
  return store.get('connectionProfiles', []);
});

ipcMain.handle('save-connection-profile', (event, profile) => {
  const profiles = store.get('connectionProfiles', []);
  const index = profiles.findIndex(p => p.id === profile.id);
  if (index >= 0) {
    profiles[index] = profile;
  } else {
    profiles.push(profile);
  }
  store.set('connectionProfiles', profiles);
  return true;
});

ipcMain.handle('delete-connection-profile', (event, profileId) => {
  const profiles = store.get('connectionProfiles', []);
  store.set(
    'connectionProfiles',
    profiles.filter(p => p.id !== profileId)
  );
  return true;
});
