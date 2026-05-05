const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const rootDir = app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..');
const port = process.env.KAIRO_PORT || '3927';
let serverProcess;

function bunExecutable() {
  if (!app.isPackaged) return 'bun';
  const fileName = process.platform === 'win32' ? 'bun.exe' : 'bun';
  return path.join(process.resourcesPath, 'bin', fileName);
}

function startServer() {
  const dataDir = process.env.DATA_DIR || (app.isPackaged ? app.getPath('userData') : path.join(rootDir, 'data'));

  serverProcess = spawn(bunExecutable(), ['server.js'], {
    cwd: rootDir,
    env: { ...process.env, PORT: port, DATA_DIR: dataDir },
    windowsHide: true,
    stdio: 'inherit'
  });

  serverProcess.on('exit', (code) => {
    if (!app.isQuitting && code !== 0) {
      console.error(`Kairo server exited with code ${code}`);
    }
  });
}

async function waitForServer() {
  const url = `http://localhost:${port}/api/config`;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error('Kairo server did not start in time');
}

async function createWindow() {
  startServer();
  await waitForServer();

  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#09090b',
    title: 'Kairo DORA',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await window.loadURL(`http://localhost:${port}`);
}

app.whenReady().then(createWindow);

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
