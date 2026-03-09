const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    openFileDialog: (kind = "video") => ipcRenderer.invoke("dialog:openFiles", kind),
    openFolderDialog: () => ipcRenderer.invoke("dialog:openFolder"),
    getFilePath: (file) => webUtils.getPathForFile(file),
});
