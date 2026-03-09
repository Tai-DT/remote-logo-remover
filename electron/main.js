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

ipcMain.handle("dialog:openFiles", async (_event, kind = "video") => {
  if (!mainWindow) return [];
  const isImage = kind === "image";
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: isImage ? ["openFile"] : ["openFile", "multiSelections"],
    filters: isImage
      ? [
        { name: "Ảnh", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"] },
        { name: "Tất cả tệp", extensions: ["*"] },
      ]
      : [
        { name: "Video", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mts", "m4v", "flv"] },
        { name: "Tất cả tệp", extensions: ["*"] },
      ],
  });
  return result.filePaths || [];
});

ipcMain.handle("dialog:openFolder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Chọn thư mục đầu ra",
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
    catch (err) { dialog.showErrorBox("Lỗi khởi động", err.message); }
  }
});

app.on("before-quit", () => { isQuitting = true; });
app.on("quit", () => { stopServer().catch(() => { }); });

app.whenReady()
  .then(createMainWindow)
  .catch((err) => {
    dialog.showErrorBox("Lỗi khởi động", err.message);
    if (!isQuitting) app.quit();
  });
