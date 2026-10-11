// The splash needs exactly one thing from the main process: the name of the
// stage it has reached. Nothing else is exposed.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("splash", {
  onStage: (fn) => ipcRenderer.on("splash:stage", (_e, text) => fn(text)),
});
