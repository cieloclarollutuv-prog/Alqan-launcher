const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UA } = require('./net');
const { versionInfo } = require('./mojang');

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBuf(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      last = e;
      await wait(400 * (i + 1));
    }
  }
  throw last;
}

// Verifica el índice y todos los objetos de assets; repara los que falten o estén cortados/corruptos.
async function ensureAssets(root, mcVersion, log, progress, alias) {
  const info = await versionInfo(mcVersion);
  const idx = info.assetIndex;
  const idxFile = path.join(root, 'assets', 'indexes', `${idx.id}.json`);

  const names = [...new Set([idx.id, mcVersion, alias].filter(Boolean))];
  const fileOf = (n) => path.join(root, 'assets', 'indexes', `${n}.json`);
  let buf = null;
  for (const n of names) {                       // cualquier copia que coincida con la huella sirve
    try { const b = fs.readFileSync(fileOf(n)); if (sha1(b) === idx.sha1) { buf = b; break; } } catch { /* siguiente */ }
  }
  if (!buf) {
    buf = await fetchBuf(idx.url);
    if (sha1(buf) !== idx.sha1) throw new Error('El índice de assets descargado está corrupto');
  }
  // minecraft-launcher-core lee indexes/<versión custom>.json (p. ej. fabric-loader-...-26.3) o <versión>.json:
  // se dejan copias válidas de todos los nombres para que nunca encuentre un archivo vacío o cortado.
  fs.mkdirSync(path.dirname(idxFile), { recursive: true });
  for (const n of names) {
    try { if (!fs.existsSync(fileOf(n)) || sha1(fs.readFileSync(fileOf(n))) !== idx.sha1) fs.writeFileSync(fileOf(n), buf); } catch { /* ignorar */ }
  }

  const unique = new Map();
  for (const o of Object.values(JSON.parse(buf.toString('utf8')).objects)) unique.set(o.hash, o);
  const objFile = (hash) => path.join(root, 'assets', 'objects', hash.slice(0, 2), hash);
  const queue = [...unique.values()].filter((o) => {
    try { return fs.statSync(objFile(o.hash)).size !== o.size; } catch { return true; }
  });
  if (!queue.length) return;

  const total = queue.length;
  let done = 0;
  let failed = 0;
  log(`Reparando/descargando ${total} archivos de assets...`);

  const worker = async () => {
    while (queue.length) {
      const o = queue.shift();
      try {
        const data = await fetchBuf(`https://resources.download.minecraft.net/${o.hash.slice(0, 2)}/${o.hash}`);
        if (data.length !== o.size || sha1(data) !== o.hash) throw new Error('el archivo llegó incompleto');
        const dest = objFile(o.hash);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest + '.part', data);
        fs.renameSync(dest + '.part', dest);
      } catch (e) {
        failed++;
        log(`No se pudo descargar el asset ${o.hash}: ${e.message}`);
      }
      progress(++done, total);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));

  if (failed) {
    const err = new Error(`Faltan ${failed} archivos de assets. Revisa tu conexión (o el antivirus) e inténtalo de nuevo.`);
    err.fatal = true;
    throw err;
  }
}

// Deja copias válidas del JSON de la versión base donde minecraft-launcher-core puede buscarlo
async function seedVersionJson(root, mcVersion, custom) {
  const dirs = [mcVersion, custom].filter(Boolean);
  let text = null;
  for (const d of [...new Set(dirs)]) {
    const f = path.join(root, 'versions', d, `${mcVersion}.json`);
    try { JSON.parse(fs.readFileSync(f, 'utf8')); continue; } catch { /* falta o está roto */ }
    if (!text) text = JSON.stringify(await versionInfo(mcVersion));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
}

// Reparación manual: borra índices, JSON de versión y natives de esta versión (se vuelven a crear al jugar)
function resetVersionFiles(root, mcVersion, custom) {
  const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
  const idx = path.join(root, 'assets', 'indexes');
  if (fs.existsSync(idx)) for (const f of fs.readdirSync(idx)) if (f.endsWith('.json')) rm(path.join(idx, f));
  rm(path.join(root, 'versions', mcVersion, `${mcVersion}.json`));
  if (custom) rm(path.join(root, 'versions', custom, `${mcVersion}.json`));
  rm(path.join(root, 'natives', mcVersion));
}

// Borra índices vacíos o corruptos que dejaron descargas interrumpidas
function purgeBadIndexes(root) {
  const dir = path.join(root, 'assets', 'indexes');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try { JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { fs.rmSync(path.join(dir, f), { force: true }); }
  }
}

module.exports = { ensureAssets, purgeBadIndexes, seedVersionJson, resetVersionFiles };
