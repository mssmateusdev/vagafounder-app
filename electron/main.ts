import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import path from 'path';
import Store from 'electron-store';

const store = new Store();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true,
    },
    title: 'Painel de Vagas',
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  
  // Background polling simulation
  setupBackgroundPoller();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for electron-store
ipcMain.handle('store-get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('store-set', (event, key, val) => {
  store.set(key, val);
});

ipcMain.handle('store-delete', (event, key) => {
  store.delete(key);
});

// Open external link
ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

// Notification triggered from renderer if needed, but we also do it from main
ipcMain.on('show-notification', (event, { title, body, url }) => {
  showNotification(title, body, url);
});

function showNotification(title: string, body: string, url?: string) {
  const notification = new Notification({
    title,
    body,
  });
  
  notification.on('click', () => {
    if (url) {
      shell.openExternal(url);
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  notification.show();
}

// Simulated background job scraper
function setupBackgroundPoller() {
  setInterval(() => {
    const filters: any = store.get('filters') || [];
    if (filters.length > 0) {
      // For demonstration, simulate finding a job for the first filter
      const activeFilter = filters[0];
      const jobTitle = `Vaga para ${activeFilter.keyword || 'Desenvolvedor'}`;
      const company = 'Tech Corp Simulada';
      const city = activeFilter.location || 'Remoto';
      
      showNotification(`Nova vaga encontrada: ${jobTitle}`, `${company} - ${city} (Publicado recentemente)`);
      
      if (mainWindow) {
        mainWindow.webContents.send('new-job-found', {
          id: Date.now(),
          title: jobTitle,
          company,
          location: city,
          publishedAt: new Date().toISOString(),
          type: activeFilter.type || 'CLT'
        });
      }
    }
  }, 15 * 60 * 1000); // 15 minutes
}
