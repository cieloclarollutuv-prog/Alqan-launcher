const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const store = require('./src/store');
const mojang = require('./src/mojang');
const modrinth = require('./src/modrinth');
const modpacks = require('./src/modpacks');
const storage = require('./src/storage');
const auth = require('./src/auth');
const game = require('./src/game');
const packs = require('./src/packs');
const updater = require('./src/update');

let win = null;
const DEFAULT_REPO = 'cieloclarollutuv-prog/Alqan-launcher';
let pendingUpdate = null;

async function checkForUpdates() {
  const st = store.getSettings();
  if (st.autoUpdateCheck === false) return;
  try {
    const info = await updater.check(st.updateRepo || DEFAULT_REPO, app.getVersion());
    if (info.available && (!pendingUpdate || pendingUpdate.version !== info.version)) { pendingUpdate = info; emit('update:available', info); }
  } catch { /* sin internet o sin versiones: no molestar */ }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 760,
    minHeight: 540,
    backgroundColor: '#101114',
    autoHideMenuBar: true,
    title: 'Alqan Launcher',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    createWindow();
    // Búsqueda automática de actualizaciones: al abrir y cada 30 minutos
    setTimeout(checkForUpdates, 4000);
    setInterval(checkForUpdates, 30 * 60 * 1000);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const emit = (channel, data) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
};

// Nunca se envían los tokens a la interfaz
const publicAccounts = () => store.getAccounts().map(({ secret, ...a }) => a);

/* ---------- Estado y ajustes ---------- */
ipcMain.handle('app:init', () => ({
  settings: store.getSettings(),
  instances: store.getInstances(),
  accounts: publicAccounts(),
  appVersion: app.getVersion()
}));
ipcMain.handle('settings:set', (_e, patch) => store.setSettings(patch));
ipcMain.handle('versions:list', (_e, snapshots) => mojang.listVersions(!!snapshots));

/* ---------- Tema: imagen de fondo ---------- */
ipcMain.handle('theme:pickImage', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = path.join(app.getPath('userData'), 'backgrounds');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, 'bg' + path.extname(r.filePaths[0]).toLowerCase());
  fs.copyFileSync(r.filePaths[0], dest);
  return pathToFileURL(dest).href + '?v=' + Date.now();
});

/* ---------- Instancias ---------- */
ipcMain.handle('instances:save', (_e, data) => {
  const list = store.getInstances();
  const clean = {
    name: String(data.name || 'Instancia').slice(0, 40),
    version: String(data.version),
    loader: ['vanilla', 'fabric', 'quilt'].includes(data.loader) ? data.loader : 'vanilla',
    ram: Math.min(32, Math.max(1, Math.round(Number(data.ram) || 4))),
    jvmArgs: String(data.jvmArgs || '').slice(0, 500),
    ...(/^(cube:[a-z]+|file)$/.test(data.icon) ? { icon: data.icon } : {})
  };
  if (data.id) {
    const i = list.findIndex((x) => x.id === data.id);
    if (i < 0) throw new Error('La instancia no existe');
    list[i] = { ...list[i], ...clean };
  } else {
    list.push({ id: store.newId(), createdAt: Date.now(), ...clean });
  }
  return store.saveInstances(list);
});

ipcMain.handle('instances:duplicate', (_e, id) => {
  const list = store.getInstances();
  const src = list.find((x) => x.id === id);
  if (!src) throw new Error('La instancia no existe');
  const copy = { ...src, id: store.newId(), name: `${src.name} (copia)`, createdAt: Date.now() };
  if (fs.existsSync(store.instanceDir(src.id))) {
    fs.cpSync(store.instanceDir(src.id), store.instanceDir(copy.id), { recursive: true, force: true });
  }
  list.push(copy);
  return store.saveInstances(list);
});

ipcMain.handle('instances:delete', (_e, id) => {
  fs.rmSync(store.instanceDir(id), { recursive: true, force: true });
  return store.saveInstances(store.getInstances().filter((x) => x.id !== id));
});

ipcMain.handle('instances:openFolder', async (_e, id) => {
  const dir = store.instanceDir(id);
  fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
});

ipcMain.handle('instances:pickIcon', async (_e, id) => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  });
  if (r.canceled || !r.filePaths[0]) return store.getInstances();
  const dir = store.instanceDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(r.filePaths[0], path.join(dir, 'alqan-icon.png'));
  return store.saveInstances(store.getInstances().map((i) => (i.id === id ? { ...i, icon: 'file', iconV: Date.now() } : i)));
});

/* ---------- Cuentas ---------- */
ipcMain.handle('accounts:addOffline', (_e, name) => {
  const clean = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(clean)) {
    throw new Error('El nombre debe tener de 3 a 16 caracteres (letras, números o _)');
  }
  const list = store.getAccounts();
  list.push({ id: store.newId(), type: 'offline', name: clean });
  store.saveAccounts(list);
  return publicAccounts();
});

ipcMain.handle('accounts:addMicrosoft', async () => {
  await auth.addMicrosoft((info) => {
    emit('auth:code', info);
    shell.openExternal(info.uri);
  });
  return publicAccounts();
});

ipcMain.handle('accounts:addElyby', async (_e, creds) => {
  await auth.addElyby(creds);
  return publicAccounts();
});

ipcMain.handle('accounts:addCustom', async (_e, creds) => {
  await auth.addCustom(creds);
  return publicAccounts();
});

ipcMain.handle('accounts:uploadSkin', async (_e, { id, model }) => {
  const acc = store.getAccounts().find((a) => a.id === id);
  if (!acc) throw new Error('La cuenta no existe');
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Skin (PNG 64x64)', extensions: ['png'] }] });
  if (r.canceled || !r.filePaths[0]) return publicAccounts();
  const png = fs.readFileSync(r.filePaths[0]);
  if (png.length < 24 || png.length > 65536 || png.readUInt32BE(16) !== 64 || png.readUInt32BE(20) !== 64) {
    throw new Error('La skin debe ser un PNG de 64x64 píxeles (máx. 64 KB).');
  }
  await auth.uploadSkin(acc, png, model === 'slim' ? 'slim' : 'default');
  return publicAccounts();
});

ipcMain.handle('skins:apply', async (_e, { id, png, model }) => {
  const list = store.getAccounts();
  const acc = list.find((a) => a.id === id);
  if (!acc) throw new Error('La cuenta no existe');
  const buf = Buffer.from(String(png), 'base64');
  if (buf.length < 24 || buf.length > 65536 || buf.readUInt32BE(16) !== 64 || buf.readUInt32BE(20) !== 64) throw new Error('Skin no válida');
  const m = model === 'slim' ? 'slim' : 'default';
  if (acc.type === 'custom') await auth.uploadSkin(acc, buf, m);
  const fresh = store.getAccounts();
  const a2 = fresh.find((a) => a.id === id);
  a2.skinPng = buf.toString('base64');
  store.saveAccounts(fresh);
  return publicAccounts();
});

ipcMain.handle('accounts:delete', (_e, id) => {
  store.saveAccounts(store.getAccounts().filter((a) => a.id !== id));
  return publicAccounts();
});

/* ---------- Contenido (Modrinth) y modpacks ---------- */
ipcMain.handle('content:search', (_e, opts) => modrinth.search(opts));

ipcMain.handle('content:install', (_e, { type, projectId, instanceId }) => {
  const inst = store.getInstances().find((i) => i.id === instanceId);
  if (!inst) throw new Error('Elige una instancia');
  return modrinth.install({
    type, projectId, version: inst.version, loader: inst.loader, instanceDir: store.instanceDir(inst.id)
  });
});

ipcMain.handle('content:list', (_e, { type, instanceId }) => modrinth.list(store.instanceDir(instanceId), type));

ipcMain.handle('content:remove', (_e, { type, instanceId, filename }) => {
  modrinth.remove(store.instanceDir(instanceId), type, filename);
  return true;
});

ipcMain.handle('modpack:install', async (_e, projectId) => {
  const inst = await modpacks.installPack(projectId, (text, pct) => emit('task:progress', { text, pct }));
  const list = store.getInstances();
  list.push(inst);
  store.saveInstances(list);
  return { instances: list, created: inst.id };
});

/* ---------- Paquetes de recursos ---------- */
const pk = (id) => {
  const inst = store.getInstances().find((i) => i.id === id);
  if (!inst) throw new Error('Elige una instancia');
  return { inst, dir: store.instanceDir(inst.id) };
};
const pickPng = async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'PNG', extensions: ['png'] }] });
  return r.canceled ? null : r.filePaths[0];
};
ipcMain.handle('packs:list', (_e, id) => { const { inst, dir } = pk(id); return packs.list(dir, inst.version); });
ipcMain.handle('packs:create', (_e, { id, name, desc }) => { const { inst, dir } = pk(id); return packs.create(dir, inst.version, name, desc); });
ipcMain.handle('packs:import', async (_e, id) => {
  const { dir } = pk(id);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Paquete (.zip)', extensions: ['zip'] }] });
  const out = [];
  if (!r.canceled) for (const f of r.filePaths) out.push(await packs.importZip(dir, f));
  return out;
});
ipcMain.handle('packs:files', (_e, { id, name }) => packs.files(pk(id).dir, name));
ipcMain.handle('packs:putTexture', async (_e, { id, name, target }) => {
  const f = await pickPng(); if (!f) return false;
  packs.putTexture(pk(id).dir, name, target, f); return true;
});
ipcMain.handle('packs:removeFile', (_e, { id, name, rel }) => { packs.removeFile(pk(id).dir, name, rel); return true; });
ipcMain.handle('packs:setMeta', (_e, { id, name, desc }) => { const { inst, dir } = pk(id); packs.setMeta(dir, inst.version, name, desc); return true; });
ipcMain.handle('packs:setIcon', async (_e, { id, name }) => { const f = await pickPng(); if (!f) return false; packs.setIcon(pk(id).dir, name, f); return true; });
ipcMain.handle('packs:toggle', (_e, { id, name, on }) => { const { inst, dir } = pk(id); packs.toggle(dir, inst.version, name, !!on); return true; });
ipcMain.handle('packs:delete', (_e, { id, name }) => { const { inst, dir } = pk(id); packs.remove(dir, inst.version, name); return true; });
ipcMain.handle('packs:export', async (_e, { id, name }) => {
  const { dir } = pk(id);
  const r = await dialog.showSaveDialog(win, { defaultPath: name + '.zip', filters: [{ name: 'Zip', extensions: ['zip'] }] });
  if (r.canceled || !r.filePath) return false;
  packs.exportZip(dir, name, r.filePath); return true;
});
ipcMain.handle('packs:openFolder', async (_e, id) => {
  const d = path.join(pk(id).dir, 'resourcepacks'); fs.mkdirSync(d, { recursive: true }); await shell.openPath(d);
});

/* ---------- Almacenamiento ---------- */
const PERF_MODS = ['sodium', 'lithium', 'ferrite-core', 'immediatelyfast', 'entityculling', 'modernfix'];

ipcMain.handle('perf:optimize', async (_e, instanceId) => {
  const list = store.getInstances();
  const inst = list.find((i) => i.id === instanceId);
  if (!inst) throw new Error('La instancia no existe');
  if (inst.loader === 'vanilla') { inst.loader = 'fabric'; store.saveInstances(list); } // los mods de rendimiento necesitan Fabric
  const dir = store.instanceDir(inst.id);
  const have = modrinth.list(dir, 'mod');
  const added = [], skipped = [], failed = [];
  for (const slug of PERF_MODS) {
    if (modrinth.hasMod(have, slug)) { skipped.push(slug); continue; }
    try {
      await modrinth.install({ type: 'mod', projectId: slug, version: inst.version, loader: inst.loader, instanceDir: dir });
      added.push(slug);
    } catch { failed.push(slug); }
  }
  return { instances: store.getInstances(), added, skipped, failed };
});

ipcMain.handle('storage:list', () => storage.list());
ipcMain.handle('storage:delete', (_e, item) => storage.remove(item));

/* ---------- Jugar ---------- */
ipcMain.handle('game:launch', async (_e, opts) => {
  const settings = store.getSettings();
  let minimized = false;
  return game.launch(opts, (channel, data) => {
    if (channel === 'game:status' && data === 'running' && settings.minimizeOnLaunch && win) {
      win.minimize();
      minimized = true;
    }
    if (channel === 'game:closed' && minimized && win && !win.isDestroyed()) win.restore();
    emit(channel, data);
  });
});

ipcMain.handle('app:openExternal', (_e, url) => {
  if (/^https:\/\//.test(url)) return shell.openExternal(url);
});

/* ---------- Actualizaciones ---------- */
ipcMain.handle('update:check', async () => {
  const info = await updater.check(store.getSettings().updateRepo || DEFAULT_REPO, app.getVersion());
  pendingUpdate = info.available ? info : null;
  return info;
});
ipcMain.handle('update:install', async () => {
  if (!pendingUpdate) throw new Error('Busca actualizaciones primero.');
  if (process.platform !== 'win32') { await shell.openExternal(pendingUpdate.page); return 'page'; }
  const file = await updater.download(pendingUpdate, (pct) => emit('task:progress', { text: 'Descargando actualización…', pct }));
  emit('task:progress', { text: 'Abriendo el instalador…', pct: 100 });
  const { spawn } = require('child_process');
  spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 800);
  return 'installer';
});

ipcMain.handle('game:repair', (_e, id) => game.repair(id, emit));

ipcMain.handle('app:openLog', async () => {
  const f = path.join(store.sharedDir(), 'logs', 'last-launch.log');
  if (!fs.existsSync(f)) throw new Error('Aún no hay registro: inicia el juego primero.');
  await shell.openPath(f);
});

ipcMain.handle('app:openDataDir', async () => {
  const dir = store.sharedDir();
  fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
});
