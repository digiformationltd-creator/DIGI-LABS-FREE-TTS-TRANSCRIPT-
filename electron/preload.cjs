// The studio page talks to its own local server over HTTP, so it needs almost
// nothing from Electron. Only what the window chrome and the save dialog need.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("studio", {
  minimize: () => ipcRenderer.send("win:minimize"),
  maximize: () => ipcRenderer.send("win:maximize"),
  close: () => ipcRenderer.send("win:close"),
  saveAudio: (name, dataUrl) => ipcRenderer.invoke("audio:save", { name, dataUrl }),
  openFolder: () => ipcRenderer.invoke("audio:folder"),
  version: () => ipcRenderer.invoke("app:version"),
  openExternal: (url) => ipcRenderer.send("open:external", url),
});
