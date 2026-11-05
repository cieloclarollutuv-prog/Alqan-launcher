const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const file = (name) => path.join(app.getPath('userData'), name);

function read(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function write(name, value) {
  fs.mkdirSync(path.dirname(file(name)), { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(value, null, 2));
  return value;
}

const defaultSettings = () => ({
  dataDir: path.join(app.getPath('appData'), '.alqan'),
  javaPath: '',
  autoJava: true,
  minimizeOnLaunch: true,
  perfFlags: true,
  updateRepo: '',
  autoUpdateCheck: true,
  lang: 'es',
  selectedInstance: '',
  selectedAccount: '',
  msClientId: '',
  theme: {
    preset: 'dark',
    colors: { bg: '#101114', panel: '#17181d', text: '#e6e6ea', accent: '#7c6cf0' },
    bgImage: '',
    dim: 0.7,
    blur: 0,
    radius: 10
  }
});

const getSettings = () => ({ ...defaultSettings(), ...read('settings.json', {}) });
const setSettings = (patch) => write('settings.json', { ...getSettings(), ...patch });

// icon: 'cube:<nombre>' (icono genérico) o 'file' (imagen alqan-icon.png dentro de la instancia)
const withIcon = (i) => (i.icon === 'file'
  ? { ...i, iconUrl: pathToFileURL(path.join(instanceDir(i.id), 'alqan-icon.png')).href + '?v=' + (i.iconV || 0) }
  : i);
const getInstances = () => read('instances.json', []).map(withIcon);
const saveInstances = (list) => {
  write('instances.json', list.map(({ iconUrl, ...rest }) => rest));
  return list.map(withIcon);
};

const getAccounts = () => read('accounts.json', []);
const saveAccounts = (list) => write('accounts.json', list);

const newId = () => crypto.randomBytes(4).toString('hex');

const sharedDir = () => getSettings().dataDir;

function instanceDir(id) {
  if (!/^[a-f0-9]{8}$/.test(String(id))) throw new Error('ID de instancia inválido');
  return path.join(sharedDir(), 'instances', id);
}

module.exports = {
  getSettings,
  setSettings,
  getInstances,
  saveInstances,
  getAccounts,
  saveAccounts,
  newId,
  sharedDir,
  instanceDir
};
