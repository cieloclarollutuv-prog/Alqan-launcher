const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (arg) => ipcRenderer.invoke(channel, arg);
const listen = (channel) => (cb) => ipcRenderer.on(channel, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('alqan', {
  init: invoke('app:init'),
  setSettings: invoke('settings:set'),
  listVersions: invoke('versions:list'),
  pickBgImage: invoke('theme:pickImage'),

  saveInstance: invoke('instances:save'),
  duplicateInstance: invoke('instances:duplicate'),
  deleteInstance: invoke('instances:delete'),
  openInstanceFolder: invoke('instances:openFolder'),

  addOffline: invoke('accounts:addOffline'),
  addMicrosoft: invoke('accounts:addMicrosoft'),
  addElyby: invoke('accounts:addElyby'),
  addCustom: invoke('accounts:addCustom'),
  pack_list: invoke('packs:list'),
  pack_create: invoke('packs:create'),
  pack_import: invoke('packs:import'),
  pack_files: invoke('packs:files'),
  pack_putTexture: invoke('packs:putTexture'),
  pack_removeFile: invoke('packs:removeFile'),
  pack_setMeta: invoke('packs:setMeta'),
  pack_setIcon: invoke('packs:setIcon'),
  pack_toggle: invoke('packs:toggle'),
  pack_delete: invoke('packs:delete'),
  pack_export: invoke('packs:export'),
  pack_openFolder: invoke('packs:openFolder'),
  applySkin: invoke('skins:apply'),
  uploadSkin: invoke('accounts:uploadSkin'),
  pickInstanceIcon: invoke('instances:pickIcon'),
  deleteAccount: invoke('accounts:delete'),

  searchContent: invoke('content:search'),
  installContent: invoke('content:install'),
  listContent: invoke('content:list'),
  removeContent: invoke('content:remove'),
  installPack: invoke('modpack:install'),
  optimize: invoke('perf:optimize'),

  storageList: invoke('storage:list'),
  storageDelete: invoke('storage:delete'),

  launch: invoke('game:launch'),
  openExternal: invoke('app:openExternal'),
  checkUpdate: invoke('update:check'),
  installUpdate: invoke('update:install'),
  repairInstance: invoke('game:repair'),
  openLog: invoke('app:openLog'),
  openDataDir: invoke('app:openDataDir'),

  onProgress: listen('game:progress'),
  onLog: listen('game:log'),
  onStatus: listen('game:status'),
  onClosed: listen('game:closed'),
  onTask: listen('task:progress'),
  onUpdate: listen('update:available'),
  onAuthCode: listen('auth:code')
});
