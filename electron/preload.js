const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    openFileDialog: () => ipcRenderer.invoke("dialog:openFiles"),
    getFilePath: (file) => webUtils.getPathForFile(file),
});
