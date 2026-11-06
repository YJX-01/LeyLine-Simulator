import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const renderer = resolve(directory, 'renderer');
const entry = 'leyline://app/index.html#annotation';
const maxBytes = 8 * 1024 * 1024;
protocol.registerSchemesAsPrivileged([{ scheme: 'leyline', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setName('LeyLine');
let window;
function trusted(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith('leyline://app/index.html')) throw new Error('Untrusted file request');
}
app.whenReady().then(() => {
  protocol.handle('leyline', request => {
    const url = new URL(request.url);
    if (url.host !== 'app' || request.method !== 'GET') return new Response('Not found', { status: 404 });
    const target = resolve(renderer, `.${decodeURIComponent(url.pathname)}`);
    if (!target.startsWith(renderer + sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(target).href).catch(() => new Response('Not found', { status: 404 }));
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: {
    ...details.responseHeaders,
    'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'"],
  } }));
  ipcMain.handle('project:open', async event => {
    trusted(event);
    const result = await dialog.showOpenDialog(window, { title: '打开轴项目', filters: [{ name: 'LeyLine 项目', extensions: ['json'] }], properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return null;
    if ((await stat(result.filePaths[0])).size > maxBytes) throw new Error('项目超过 8 MiB 限制');
    return readFile(result.filePaths[0], 'utf8');
  });
  ipcMain.handle('project:save', async (event, content) => {
    trusted(event);
    if (typeof content !== 'string' || Buffer.byteLength(content) > maxBytes) throw new Error('项目内容无效或超过 8 MiB');
    JSON.parse(content);
    const result = await dialog.showSaveDialog(window, { title: '保存轴项目', defaultPath: 'leyline-project.json', filters: [{ name: 'LeyLine 项目', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    await writeFile(result.filePath, content, 'utf8');
    return true;
  });
  function createWindow() {
    window = new BrowserWindow({ width: 1440, height: 960, minWidth: 900, minHeight: 640, title: 'LeyLine · 轴与配装工作台',
      show: !process.argv.includes('--smoke'), backgroundColor: '#f3f6f7',
      webPreferences: { preload: resolve(directory, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.loadURL(entry);
  }
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}).catch(error => { console.error(error); app.exit(1); });
