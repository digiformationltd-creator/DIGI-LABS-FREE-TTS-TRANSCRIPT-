/**
 * DIGI LABS — desktop shell.
 *
 * Starts the studio's own server in-process, shows a splash while the engines are
 * checked, then opens the studio window. The server is required rather than
 * spawned: one process means no orphaned node.exe left behind when the window is
 * closed, which is a real problem in the Digi Biz OS build and worth not
 * repeating.
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4300);
const ROOT = path.join(__dirname, "..");
// In a packaged build, data must live where the user can actually write.
const DATA = app.isPackaged ? path.join(app.getPath("userData"), "data") : path.join(ROOT, "data");
process.env.DIGILABS_DATA = DATA;
const AUDIO = path.join(DATA, "audio");

let splash = null;
let win = null;

function stage(text) {
  if (splash && !splash.isDestroyed()) splash.webContents.send("splash:stage", text);
}

function makeSplash() {
  splash = new BrowserWindow({
    width: 440, height: 340,
    frame: false, resizable: false, movable: true,
    transparent: false, backgroundColor: "#060709",
    show: false, skipTaskbar: false,
    webPreferences: { preload: path.join(__dirname, "splash-preload.cjs"), contextIsolation: true },
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  splash.once("ready-to-show", () => splash.show());
}

function makeWindow() {
  win = new BrowserWindow({
    width: 1280, height: 840, minWidth: 1000, minHeight: 700,
    // Frameless and transparent so the page can paint its own rounded card and
    // the desktop shows through at the corners. The app draws its own window
    // controls (the three buttons top-right), wired through the preload.
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    autoHideMenuBar: true,
    title: "DIGI LABS",
    icon: path.join(ROOT, "web", "assets", "icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true },
  });
  win.removeMenu();
  win.loadURL(`http://127.0.0.1:${PORT}/`);

  win.once("ready-to-show", () => {
    win.show();
    if (splash && !splash.isDestroyed()) splash.destroy();
    splash = null;
  });

  // A link to anything outside the studio opens in the real browser, never
  // inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow" };
  });
}

/** Wait until the server answers, rather than guessing with a timer. */
async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return await r.json();
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

app.whenReady().then(async () => {
  fs.mkdirSync(AUDIO, { recursive: true });
  makeSplash();

  stage("Starting the studio…");
  try {
    require(path.join(ROOT, "server", "index.js"));
  } catch (e) {
    stage("The studio could not start.");
    dialog.showErrorBox("DIGI LABS", `The studio server failed to start.\n\n${e && e.message}`);
    app.quit();
    return;
  }

  stage("Checking the voice engines…");
  const health = await waitForServer();
  if (!health) {
    stage("The studio did not answer.");
    dialog.showErrorBox("DIGI LABS", "The studio server did not answer in time.");
    app.quit();
    return;
  }

  // Say what was actually found. A splash that claims everything is ready and
  // then hands over a dead engine is worse than one that names the gap.
  if (!health.ffmpeg) stage("FFmpeg is missing — Studio Voice will be unavailable");
  else if (!health.edge_ready) stage("Free Voice package is missing");
  else stage("Ready");

  makeWindow();

  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) makeWindow(); });
});

app.on("window-all-closed", () => app.quit());

ipcMain.on("win:minimize", () => win && win.minimize());
ipcMain.on("win:maximize", () => win && (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.on("win:close", () => win && win.close());

// Only https links are ever opened, and always in the real browser.
ipcMain.on("open:external", (_e, url) => {
  if (typeof url === "string" && /^https:\/\//i.test(url)) shell.openExternal(url);
});

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("audio:folder", async () => { await shell.openPath(AUDIO); return AUDIO; });

// Saving goes through a real Save dialog: the studio never writes to the user's
// Downloads folder on its own.
ipcMain.handle("audio:save", async (_e, { name, dataUrl }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save audio",
      defaultPath: path.join(app.getPath("music"), name || "digi-labs.mp3"),
      filters: [{ name: "MP3 audio", extensions: ["mp3"] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    const b64 = String(dataUrl || "").replace(/^data:[^;]+;base64,/, "");
    fs.writeFileSync(filePath, Buffer.from(b64, "base64"));
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 200) };
  }
});
