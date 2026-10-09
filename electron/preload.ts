import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  storeGet: (key: string) => ipcRenderer.invoke('store-get', key),
  storeSet: (key: string, val: any) => ipcRenderer.invoke('store-set', key, val),
  storeDelete: (key: string) => ipcRenderer.invoke('store-delete', key),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  showNotification: (options: { title: string; body: string; url?: string }) => ipcRenderer.send('show-notification', options),
  onNewJobFound: (callback: (job: any) => void) => {
    ipcRenderer.on('new-job-found', (_event, job) => callback(job));
  }
});
