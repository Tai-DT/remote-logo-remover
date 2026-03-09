const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    openFileDialog: () => ipcRenderer.invoke("dialog:openFiles"),
    openFolderDialog: () => ipcRenderer.invoke("dialog:openFolder"),
    getFilePath: (file) => webUtils.getPathForFile(file),
});
