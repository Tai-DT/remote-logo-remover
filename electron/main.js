const path = require("path");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { startServer } = require("../server");

let mainWindow = null;
let serverHandle = null;
let isQuitting = false;

async function ensureServer() {
  if (serverHandle) return serverHandle;
  serverHandle = await startServer({
    host: "127.0.0.1",
    port: 0,
    runtimeDir: path.join(app.getPath("userData"), "runtime"),
  });
  return serverHandle;
}

async function createMainWindow() {
  const handle = await ensureServer();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    autoHideMenuBar: true,
    backgroundColor: "#efe3cf",
    title: "Remote Logo Remover",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.on("closed", () => { mainWindow = null; });
  await mainWindow.loadURL(handle.url);
}

async function stopServer() {
  if (!serverHandle) return;
  const h = serverHandle;
  serverHandle = null;
  await h.close();
}

/* ── IPC Handlers ──────────────────────────────────────── */

ipcMain.handle("dialog:openFiles", async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Videos", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mts", "m4v", "flv"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  return result.filePaths || [];
});

ipcMain.handle("dialog:openFolder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Choose output folder",
  });
  return result.filePaths?.[0] || null;
});

/* ── App lifecycle ─────────────────────────────────────── */

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    try { await createMainWindow(); }
    catch (err) { dialog.showErrorBox("Startup Error", err.message); }
  }
});

app.on("before-quit", () => { isQuitting = true; });
app.on("quit", () => { stopServer().catch(() => { }); });

app.whenReady()
  .then(createMainWindow)
  .catch((err) => {
    dialog.showErrorBox("Startup Error", err.message);
    if (!isQuitting) app.quit();
  });
