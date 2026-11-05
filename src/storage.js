const fs = require('fs');
const path = require('path');
const store = require('./store');

function dirSize(p) {
  let total = 0;
  try {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const f = path.join(p, e.name);
      total += e.isDirectory() ? dirSize(f) : fs.statSync(f).size;
    }
  } catch { /* carpeta inexistente */ }
  return total;
}

const subdirs = (p) => {
  try { return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); }
  catch { return []; }
};

// Lista lo que ocupa espacio: versiones descargadas, instancias, Java y archivos compartidos
function list() {
  const root = store.sharedDir();
  const insts = store.getInstances();
  const out = [];

  for (const id of subdirs(path.join(root, 'versions'))) {
    const inUse = insts.some((i) => i.version === id || (i.loader !== 'vanilla' && id.endsWith('-' + i.version)));
    out.push({ kind: 'version', id, label: id, size: dirSize(path.join(root, 'versions', id)), inUse });
  }
  for (const i of insts) {
    out.push({ kind: 'instance', id: i.id, label: i.name, size: dirSize(store.instanceDir(i.id)), inUse: false });
  }
  for (const id of subdirs(path.join(root, 'runtime'))) {
    out.push({ kind: 'java', id, label: id.replace('java-', 'Java '), size: dirSize(path.join(root, 'runtime', id)), inUse: false });
  }
  for (const id of ['libraries', 'assets']) {
    if (fs.existsSync(path.join(root, id))) {
      out.push({ kind: 'shared', id, label: id === 'libraries' ? 'Bibliotecas' : 'Assets (sonidos e idiomas)', size: dirSize(path.join(root, id)), inUse: false });
    }
  }
  return out;
}

function remove({ kind, id }) {
  const root = store.sharedDir();
  let target;
  if (kind === 'version') target = path.join(root, 'versions', path.basename(id));
  else if (kind === 'java') target = path.join(root, 'runtime', path.basename(id));
  else if (kind === 'shared' && (id === 'libraries' || id === 'assets')) target = path.join(root, id);
  else if (kind === 'instance') {
    store.saveInstances(store.getInstances().filter((i) => i.id !== id));
    target = store.instanceDir(id);
  } else throw new Error('Elemento inválido');
  fs.rmSync(target, { recursive: true, force: true });
  return true;
}

module.exports = { list, remove };
