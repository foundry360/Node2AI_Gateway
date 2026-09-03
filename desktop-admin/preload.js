const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Credential management
  getCredentials: instanceId =>
    ipcRenderer.invoke('get-credentials', instanceId),
  saveCredentials: (instanceId, credentials) =>
    ipcRenderer.invoke('save-credentials', instanceId, credentials),
  deleteCredentials: instanceId =>
    ipcRenderer.invoke('delete-credentials', instanceId),

  // Connection profiles
  getConnectionProfiles: () => ipcRenderer.invoke('get-connection-profiles'),
  saveConnectionProfile: profile =>
    ipcRenderer.invoke('save-connection-profile', profile),
  deleteConnectionProfile: profileId =>
    ipcRenderer.invoke('delete-connection-profile', profileId),

  // Platform info
  platform: process.platform,
  versions: process.versions,
});
