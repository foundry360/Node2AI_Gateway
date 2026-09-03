# Desktop Admin Control Center - UI Components Requirements

This document outlines what's needed to complete the Desktop Admin Control Center UI.

## Current Status

### ✅ Completed

- **Electron Main Process** (`main.js`) - Window management, system tray, IPC handlers
- **Preload Script** (`preload.js`) - Secure context bridge for IPC
- **Package Configuration** (`package.json`) - Electron builder setup
- **Build Configuration** - Multi-platform build targets configured

### ⚠️ Missing

- **Renderer Process** - The actual UI application
- **UI Components** - React components for the interface
- **HTML Entry Point** - Main HTML file
- **Styling** - CSS/styling framework
- **State Management** - Application state handling

## Required Components

### 1. Main HTML Entry Point

**File**: `desktop-admin/index.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Node2AI Admin Control Center</title>
    <link rel="stylesheet" href="./styles/main.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./renderer.js"></script>
  </body>
</html>
```

### 2. Renderer Process (Main UI Application)

**File**: `desktop-admin/src/renderer/index.jsx` or `index.tsx`

This should:

- Initialize React application
- Set up routing (if using React Router)
- Handle connection to Electron main process
- Render the main app component

### 3. Core UI Components Structure

```
desktop-admin/src/renderer/
├── components/
│   ├── Layout/
│   │   ├── AppLayout.tsx          # Main layout wrapper
│   │   ├── Sidebar.tsx             # Navigation sidebar
│   │   ├── Header.tsx              # Top header bar
│   │   └── StatusBar.tsx           # Bottom status bar
│   ├── Connection/
│   │   ├── ConnectionList.tsx      # List of connection profiles
│   │   ├── ConnectionForm.tsx      # Add/edit connection profile
│   │   ├── ConnectionCard.tsx       # Individual connection card
│   │   └── ConnectionStatus.tsx     # Connection health indicator
│   ├── Dashboard/
│   │   ├── DashboardView.tsx       # Main dashboard
│   │   ├── MetricsCard.tsx         # Metric display cards
│   │   ├── HealthStatus.tsx        # Health check display
│   │   └── QuickStats.tsx          # Quick statistics
│   ├── Settings/
│   │   ├── SettingsView.tsx        # Settings page
│   │   ├── GeneralSettings.tsx     # General settings
│   │   ├── ConnectionSettings.tsx  # Connection preferences
│   │   └── AppearanceSettings.tsx  # Theme/preferences
│   ├── Users/
│   │   ├── UserManagement.tsx      # User list and management
│   │   ├── UserForm.tsx            # Add/edit user
│   │   └── RoleManagement.tsx      # Role assignments
│   ├── Logs/
│   │   ├── LogViewer.tsx           # Log display component
│   │   ├── LogFilter.tsx           # Log filtering controls
│   │   └── LogEntry.tsx            # Individual log entry
│   ├── Services/
│   │   ├── ServiceControls.tsx     # Start/stop/restart buttons
│   │   ├── ServiceStatus.tsx       # Service status display
│   │   └── ServiceLogs.tsx         # Service-specific logs
│   └── Common/
│       ├── Button.tsx              # Reusable button component
│       ├── Input.tsx               # Reusable input component
│       ├── Modal.tsx               # Modal dialog component
│       ├── Toast.tsx               # Toast notifications
│       └── LoadingSpinner.tsx      # Loading indicator
├── hooks/
│   ├── useConnection.ts            # Connection management hook
│   ├── useElectronAPI.ts           # Electron IPC hook
│   ├── useNode2AI.ts               # Node2AI API calls hook
│   └── useTheme.ts                 # Theme management hook
├── services/
│   ├── api.ts                      # API client for Node2AI
│   ├── connection.ts                # Connection profile management
│   └── storage.ts                   # Local storage utilities
├── stores/
│   ├── connectionStore.ts           # Connection state (Zustand/Redux)
│   ├── appStore.ts                  # App-wide state
│   └── settingsStore.ts              # Settings state
├── utils/
│   ├── format.ts                    # Formatting utilities
│   ├── validation.ts                 # Validation functions
│   └── constants.ts                 # App constants
└── App.tsx                          # Main app component
```

### 4. Key Features to Implement

#### A. Connection Management UI

- **Connection Profile List**: Display all saved connections
- **Add/Edit Connection Form**:
  - Name, URL, environment type
  - Authentication (JWT, API Key, OAuth)
  - SSL certificate validation toggle
  - Test connection button
- **Connection Status**: Real-time connection health
- **Quick Switch**: Switch between connections

#### B. Dashboard View

- **Real-time Metrics**:
  - API health status
  - Request volume
  - Error rates
  - Active users
  - Database status
  - Cache status
- **Charts and Graphs**:
  - Request volume over time
  - Provider usage
  - Error rate trends
- **Quick Actions**:
  - View logs
  - Restart services
  - Trigger backup

#### C. Settings Interface

- **General Settings**:
  - Auto-start on login
  - Check for updates
  - Notification preferences
- **Connection Settings**:
  - Default connection
  - Connection timeout
  - Retry settings
- **Appearance**:
  - Theme (light/dark/system)
  - Font size
  - Layout preferences

#### D. User Management UI

- **User List**: Display all users
- **User Actions**: Add, edit, delete users
- **Role Assignment**: Assign roles and permissions
- **User Details**: View user activity and settings

#### E. Log Viewer

- **Log Display**: Real-time log streaming
- **Filtering**: Filter by level, service, date
- **Search**: Search through logs
- **Export**: Export logs to file
- **Auto-scroll**: Auto-scroll to latest logs

#### F. Service Controls

- **Service Status**: Visual status indicators
- **Control Buttons**: Start, stop, restart services
- **Service Logs**: View service-specific logs
- **Health Checks**: Run health checks on demand

### 5. Technology Stack Recommendations

#### Option 1: React + Vite (Recommended)

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "zustand": "^4.4.0",
    "axios": "^1.6.0",
    "recharts": "^2.8.0",
    "tailwindcss": "^3.3.6",
    "@headlessui/react": "^1.7.17"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  }
}
```

#### Option 2: Reuse Existing Web Dashboard

Since the web dashboard already exists, you could:

- Load the web dashboard URL in Electron window
- Add Electron-specific overlays/controls
- Enhance with native features (system tray, notifications)

### 6. Integration with Existing Web Dashboard

**Option A: Embed Web Dashboard**

```javascript
// In main.js, load the web dashboard
mainWindow.loadURL('http://localhost:3000');

// Add Electron-specific controls
const { Menu } = require('electron');
// Add custom menu items
```

**Option B: Standalone UI**

- Create separate UI components
- Reuse API client from web app
- Share types/interfaces
- Build standalone React app

### 7. Styling Approach

#### Recommended: Tailwind CSS

- Already used in web dashboard
- Consistent design language
- Easy to customize
- Dark mode support

#### Alternative: CSS Modules or Styled Components

- Component-scoped styles
- Type-safe styling

### 8. State Management

#### Recommended: Zustand (Lightweight)

```typescript
import create from 'zustand';

interface ConnectionStore {
  connections: ConnectionProfile[];
  activeConnection: string | null;
  addConnection: (profile: ConnectionProfile) => void;
  setActiveConnection: (id: string) => void;
}

export const useConnectionStore = create<ConnectionStore>(set => ({
  connections: [],
  activeConnection: null,
  addConnection: profile =>
    set(state => ({
      connections: [...state.connections, profile],
    })),
  setActiveConnection: id => set({ activeConnection: id }),
}));
```

### 9. API Integration

Create API client that:

- Handles authentication
- Manages connection profiles
- Provides typed API calls
- Handles errors gracefully

```typescript
// src/services/api.ts
import axios from 'axios';
import { electronAPI } from '../utils/electron';

class Node2AIAPIClient {
  private baseURL: string;
  private credentials: any;

  async connect(connectionId: string) {
    const profile = await electronAPI.getConnectionProfile(connectionId);
    this.baseURL = profile.url;
    this.credentials = await electronAPI.getCredentials(connectionId);

    // Configure axios
    axios.defaults.baseURL = this.baseURL;
    axios.defaults.headers.common['Authorization'] =
      `Bearer ${this.credentials.token}`;
  }

  async getHealth() {
    return axios.get('/api/health');
  }

  async getDashboard() {
    return axios.get('/api/v1/control-center/dashboard');
  }

  // ... more API methods
}
```

### 10. Build Configuration Updates

Update `package.json` to include:

- Vite build configuration
- React dependencies
- TypeScript configuration
- Build scripts for renderer

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"electron .\"",
    "build": "vite build && electron-builder",
    "build:renderer": "vite build",
    "build:electron": "electron-builder"
  }
}
```

## Implementation Steps

### Phase 1: Basic Structure

1. ✅ Create `index.html`
2. ✅ Set up React/Vite project structure
3. ✅ Create main `App.tsx` component
4. ✅ Set up routing (if needed)

### Phase 2: Connection Management

1. ⚠️ Build connection list component
2. ⚠️ Build connection form component
3. ⚠️ Integrate with Electron IPC
4. ⚠️ Test credential storage

### Phase 3: Dashboard

1. ⚠️ Build dashboard layout
2. ⚠️ Create API client
3. ⚠️ Build metrics components
4. ⚠️ Add real-time updates

### Phase 4: Additional Features

1. ⚠️ Settings interface
2. ⚠️ Log viewer
3. ⚠️ Service controls
4. ⚠️ User management

### Phase 5: Polish

1. ⚠️ Error handling
2. ⚠️ Loading states
3. ⚠️ Animations/transitions
4. ⚠️ Responsive design

## Quick Start Implementation

### Minimal Viable Version

To get started quickly, create a simple version that:

1. **Loads the web dashboard** in Electron window
2. **Adds system tray** with quick actions
3. **Adds connection switching** via menu
4. **Enhances with native features** (notifications, etc.)

This approach leverages existing web dashboard UI while adding desktop app features.

### Full Implementation

For a complete standalone desktop app:

1. Set up React + Vite project
2. Create component library
3. Build connection management UI
4. Build dashboard UI (or reuse web components)
5. Integrate with Electron IPC
6. Add native features

## Resources

- **Electron Documentation**: https://www.electronjs.org/docs
- **React Documentation**: https://react.dev
- **Vite Documentation**: https://vitejs.dev
- **Existing Web Dashboard**: `apps/web/src/app/` (for reference/component reuse)

## Next Steps

1. **Decide on approach**: Embed web dashboard or build standalone UI
2. **Set up build tooling**: Vite + React or Next.js
3. **Create component structure**: Follow structure above
4. **Implement core features**: Connection management first
5. **Iterate**: Add features incrementally
