const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdfFlow', {
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  listPdfs: folder => ipcRenderer.invoke('list-pdfs', folder),
  openSite: url => ipcRenderer.invoke('open-site', url),
  captureSelector: () => ipcRenderer.invoke('capture-selector'),
  runAutomation: config => ipcRenderer.invoke('run-automation', config),
  onProgress: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('automation-progress', listener);
    return () => ipcRenderer.removeListener('automation-progress', listener);
  },
});
