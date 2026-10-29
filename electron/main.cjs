const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

let mainWindow;
let siteWindow;
const createWindow = () => {
  mainWindow = new BrowserWindow({ width: 1440, height: 960, minWidth: 1000, minHeight: 720, title: 'PDF Flujo Claro', backgroundColor: '#f7f8f4', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  if (app.isPackaged) mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  else mainWindow.loadURL('http://127.0.0.1:8080');
};
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('list-pdfs', async (_event, folder) => {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')).map(entry => ({ name: entry.name, path: path.join(folder, entry.name) }));
});
ipcMain.handle('open-site', async (_event, address) => {
  const url = new URL(address);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Ingresa una dirección HTTP o HTTPS.');
  if (siteWindow && !siteWindow.isDestroyed()) siteWindow.close();
  siteWindow = new BrowserWindow({ width: 1320, height: 900, title: 'Sitio de consulta · PDF Flujo Claro', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await siteWindow.loadURL(url.toString());
  siteWindow.show();
  return true;
});
ipcMain.handle('capture-selector', async () => {
  if (!siteWindow || siteWindow.isDestroyed()) throw new Error('Abre primero el sitio web.');
  siteWindow.show();
  return siteWindow.webContents.executeJavaScript(`new Promise(resolve => {
    const selectorFor = element => {
      if (element.id) return '#' + CSS.escape(element.id);
      const parts = [];
      let node = element;
      while (node && node.nodeType === 1 && node !== document.body) {
        let part = node.tagName.toLowerCase();
        if (node.classList.length) part += '.' + Array.from(node.classList).slice(0, 2).map(name => CSS.escape(name)).join('.');
        const siblings = node.parentElement ? Array.from(node.parentElement.children).filter(child => child.tagName === node.tagName) : [];
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        parts.unshift(part);
        node = node.parentElement;
      }
      return parts.join(' > ');
    };
    const handler = event => {
      const target = event.target.closest('input,button,a,[role=button],th,td,li,select') || event.target;
      event.preventDefault(); event.stopImmediatePropagation(); document.removeEventListener('click', handler, true);
      resolve(selectorFor(target));
    };
    document.addEventListener('click', handler, true);
  })`, true);
});
ipcMain.handle('run-automation', async (event, config) => {
  if (!siteWindow || siteWindow.isDestroyed()) throw new Error('Abre primero el sitio e inicia sesión.');
  const { files, searchSelector, rowSelector, menuSelector, firstOptionSelector, extraClicks } = config;
  const send = (message, index, total) => event.sender.send('automation-progress', { message, index, total });
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const stem = path.basename(file.name, path.extname(file.name));
    const parts = stem.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) { send(`Se omitió ${file.name}: faltan datos separados por espacios.`, i + 1, files.length); continue; }
    const first = parts[0];
    const last = parts[parts.length - 1];
    const search = first.replace(/-/g, '/');
    send(`Buscando ${search} · ${last}`, i + 1, files.length);
    const menuPoint = await siteWindow.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(menuSelector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
    if (!menuPoint) throw new Error('No se encontró el menú principal con el selector configurado.');
    siteWindow.webContents.sendInputEvent({ type: 'mouseMove', x: menuPoint.x, y: menuPoint.y });
    await new Promise(resolve => setTimeout(resolve, 500));
    await siteWindow.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(firstOptionSelector)})?.click()`);
    await new Promise(resolve => setTimeout(resolve, 800));
    const result = await siteWindow.webContents.executeJavaScript(`(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      for (const selector of ${JSON.stringify(extraClicks || [])}) { const el = document.querySelector(selector); if (el) { el.click(); await wait(300); } }
      const input = document.querySelector(${JSON.stringify(searchSelector)});
      if (!input) return { error: 'No se localizó el campo de búsqueda. Revisa el selector configurado.' };
      input.focus(); input.value = ${JSON.stringify(search)}; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(900);
      const rows = Array.from(document.querySelectorAll(${JSON.stringify(rowSelector)}));
      for (const row of rows) { const cells = Array.from(row.querySelectorAll('td')); if (cells.length >= 5 && cells[0].innerText.trim() === ${JSON.stringify(first)} && cells[1].innerText.trim() === ${JSON.stringify(last)}) return { suffix: cells[4].innerText.trim() }; }
      return { suffix: 'NE' };
    })()`, true);
    if (result.error) throw new Error(result.error);
    const suffix = String(result.suffix || 'NE').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'NE';
    const destination = path.join(path.dirname(file.path), `${stem} - ${suffix}.pdf`);
    try { await fs.access(destination); throw new Error(`Ya existe ${path.basename(destination)}. No se modificó el original.`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(file.path, destination);
    send(`Listo: ${path.basename(destination)}`, i + 1, files.length);
  }
  return true;
});
ipcMain.handle('open-system-browser', async (_event, address) => {
  const url = new URL(address);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('La dirección debe usar HTTP o HTTPS.');
  await shell.openExternal(url.toString());
});
