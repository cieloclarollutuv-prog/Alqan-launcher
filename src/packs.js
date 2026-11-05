// Editor de paquetes de recursos: carpetas dentro de <instancia>/resourcepacks
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');

const skinpack = require('./skinpack');

const safeName = (n) => {
  const s = String(n || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/^\.+/, '').slice(0, 40);
  if (!s) throw new Error('Nombre no válido');
  return s;
};
const packsDir = (gameDir) => path.join(gameDir, 'resourcepacks');
const packDir = (gameDir, name) => {
  const d = path.join(packsDir(gameDir), safeName(name));
  if (path.dirname(d) !== packsDir(gameDir)) throw new Error('Nombre no válido');
  return d;
};
const texPath = (target) => {
  const t = String(target || '').trim().replace(/\.png$/i, '').replace(/^\/+/, '');
  if (!/^[a-z0-9_\-./]+$/.test(t) || t.includes('..')) throw new Error('Ruta no válida (solo minúsculas, números, _ - / .)');
  return t.startsWith('assets/') ? t + '.png' : 'assets/minecraft/textures/' + t + '.png';
};
const inside = (dir, rel) => {
  const f = path.join(dir, rel);
  if (!f.startsWith(dir + path.sep)) throw new Error('Ruta no válida');
  return f;
};

function optionsEntry(version, name) { return (parseInt(String(version).split('.')[1], 10) >= 13 || parseInt(version, 10) >= 26 ? 'file/' : '') + name; }
function readOpts(gameDir) {
  const f = path.join(gameDir, 'options.txt');
  const lines = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  const i = lines.findIndex((l) => l.startsWith('resourcePacks:'));
  let list = [];
  if (i >= 0) { try { list = JSON.parse(lines[i].slice(14)); } catch {} }
  return { f, lines, i, list };
}

function list(gameDir, version) {
  const dir = packsDir(gameDir);
  if (!fs.existsSync(dir)) return [];
  const { list: on } = readOpts(gameDir);
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'AlqanSkin').map((e) => {
    let desc = '';
    try { const d = JSON.parse(fs.readFileSync(path.join(dir, e.name, 'pack.mcmeta'), 'utf8')).pack.description; desc = typeof d === 'string' ? d : (d && d.text) || ''; } catch {}
    const ic = path.join(dir, e.name, 'pack.png');
    return { name: e.name, desc: desc.replace(/§./g, ''), enabled: on.includes(optionsEntry(version, e.name)), iconUrl: fs.existsSync(ic) ? pathToFileURL(ic).href + '?v=' + fs.statSync(ic).mtimeMs : '' };
  });
}

function create(gameDir, version, name, desc) {
  const d = packDir(gameDir, name);
  if (fs.existsSync(d)) throw new Error('Ya existe un paquete con ese nombre');
  fs.mkdirSync(path.join(d, 'assets', 'minecraft', 'textures'), { recursive: true });
  fs.writeFileSync(path.join(d, 'pack.mcmeta'), skinpack.mcmeta(version, desc || name));
  return safeName(name);
}

async function importZip(gameDir, zipFile) {
  let base = safeName(path.basename(zipFile).replace(/\.zip$/i, '')), name = base, n = 2;
  while (fs.existsSync(packDir(gameDir, name))) name = `${base} ${n++}`;
  const d = packDir(gameDir, name);
  fs.mkdirSync(d, { recursive: true });
  try { await require('extract-zip')(zipFile, { dir: d }); } catch (e) { fs.rmSync(d, { recursive: true, force: true }); throw e; }
  // si el zip traía todo dentro de una carpeta, súbelo un nivel
  if (!fs.existsSync(path.join(d, 'pack.mcmeta'))) {
    const subs = fs.readdirSync(d).filter((x) => fs.existsSync(path.join(d, x, 'pack.mcmeta')));
    if (subs.length === 1) { const s = path.join(d, subs[0]); for (const x of fs.readdirSync(s)) fs.renameSync(path.join(s, x), path.join(d, x)); fs.rmdirSync(s); }
  }
  if (!fs.existsSync(path.join(d, 'pack.mcmeta'))) { fs.rmSync(d, { recursive: true, force: true }); throw new Error('El zip no es un paquete de recursos (falta pack.mcmeta)'); }
  return name;
}

function files(gameDir, name) {
  const d = packDir(gameDir, name), out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.png$/i.test(e.name) && out.length < 3000) {
        const rel = path.relative(d, f).split(path.sep).join('/');
        if (rel !== 'pack.png') out.push({ path: rel, size: fs.statSync(f).size, url: pathToFileURL(f).href + '?v=' + fs.statSync(f).mtimeMs });
      }
    }
  };
  if (fs.existsSync(d)) walk(d);
  return out;
}

function putTexture(gameDir, name, target, srcFile) {
  const d = packDir(gameDir, name), rel = texPath(target);
  const f = inside(d, rel);
  const buf = fs.readFileSync(srcFile);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.length > 8 * 1048576) throw new Error('El archivo debe ser un PNG (máx. 8 MB)');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buf);
}

function removeFile(gameDir, name, rel) {
  const d = packDir(gameDir, name);
  if (!/\.png$/i.test(rel)) throw new Error('Solo se pueden quitar imágenes');
  fs.rmSync(inside(d, rel), { force: true });
}

function setMeta(gameDir, version, name, desc) {
  fs.writeFileSync(path.join(packDir(gameDir, name), 'pack.mcmeta'), skinpack.mcmeta(version, desc));
}
function setIcon(gameDir, name, srcFile) { fs.copyFileSync(srcFile, path.join(packDir(gameDir, name), 'pack.png')); }

function toggle(gameDir, version, name, on) {
  safeName(name);
  const o = readOpts(gameDir), entry = optionsEntry(version, name);
  let l = o.list.filter((x) => x !== entry);
  if (on) l.push(entry);
  const line = 'resourcePacks:' + JSON.stringify(l);
  if (o.i >= 0) o.lines[o.i] = line; else o.lines.push(line);
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(o.f, o.lines.join('\n') + '\n');
}

function remove(gameDir, version, name) {
  toggle(gameDir, version, name, false);
  fs.rmSync(packDir(gameDir, name), { recursive: true, force: true });
}

/* ---- exportar a .zip (escritor mínimo, sin dependencias) ---- */
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function exportZip(gameDir, name, dest) {
  const d = packDir(gameDir, name), parts = [], central = [];
  let off = 0;
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); e.isDirectory() ? walk(f) : add(f); } };
  const add = (f) => {
    const nm = Buffer.from(path.relative(d, f).split(path.sep).join('/')), raw = fs.readFileSync(f), comp = zlib.deflateRawSync(raw), crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nm); parts.push(lh, nm, comp); off += 30 + nm.length + comp.length;
  };
  walk(d);
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  fs.writeFileSync(dest, Buffer.concat([...parts, cd, end]));
}

module.exports = { list, create, importZip, files, putTexture, removeFile, setMeta, setIcon, toggle, remove, exportZip, packDir };
