// Lector mínimo de .jar/.zip para sacar las texturas originales del juego (sin dependencias)
const fs = require('fs');
const zlib = require('zlib');

const cache = new Map(); // jar -> { mtime, entries: Map(nombre -> {method, csize, offset}) }

function index(jar) {
  const st = fs.statSync(jar);
  const hit = cache.get(jar);
  if (hit && hit.mtime === st.mtimeMs) return hit.entries;
  const fd = fs.openSync(jar, 'r');
  try {
    const tailLen = Math.min(st.size, 65557), tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, st.size - tailLen);
    let e = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (e < 0) throw new Error('El archivo del juego no es un .jar válido');
    const count = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOff);
    const entries = new Map();
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20);
      const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32), off = cd.readUInt32LE(p + 42);
      entries.set(cd.toString('utf8', p + 46, p + 46 + nl), { method, csize, offset: off });
      p += 46 + nl + xl + cl;
    }
    cache.set(jar, { mtime: st.mtimeMs, entries });
    return entries;
  } finally { fs.closeSync(fd); }
}

const PREFIX = 'assets/minecraft/textures/';

function search(jar, q, limit = 80) {
  const k = String(q || '').toLowerCase().trim();
  const out = [];
  for (const name of index(jar).keys()) {
    if (!name.startsWith(PREFIX) || !name.endsWith('.png')) continue;
    if (k && !name.slice(PREFIX.length).toLowerCase().includes(k)) continue;
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

function read(jar, name) {
  if (!name.startsWith(PREFIX) || !name.endsWith('.png') || name.includes('..')) throw new Error('Textura no válida');
  const ent = index(jar).get(name);
  if (!ent) throw new Error('Esa textura no existe en esta versión');
  const fd = fs.openSync(jar, 'r');
  try {
    const lh = Buffer.alloc(30);
    fs.readSync(fd, lh, 0, 30, ent.offset);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('Archivo del juego dañado');
    const start = ent.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
    const raw = Buffer.alloc(ent.csize);
    fs.readSync(fd, raw, 0, ent.csize, start);
    return ent.method === 8 ? zlib.inflateRawSync(raw) : raw;
  } finally { fs.closeSync(fd); }
}

module.exports = { search, read };
