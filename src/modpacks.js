const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const extract = require('extract-zip');
const store = require('./store');
const { getJson, download } = require('./net');

const API = 'https://api.modrinth.com/v2';

function hashOk(file, hashes) {
  const algo = hashes.sha512 ? 'sha512' : hashes.sha1 ? 'sha1' : null;
  if (!algo) return true;
  return crypto.createHash(algo).update(fs.readFileSync(file)).digest('hex') === hashes[algo];
}

// Instala un modpack .mrpack de Modrinth como una instancia nueva
async function installPack(projectId, progress) {
  const project = await getJson(`${API}/project/${projectId}`);
  const versions = await getJson(`${API}/project/${projectId}/version`);
  if (!versions.length) throw new Error('El modpack no tiene versiones publicadas');
  const file = versions[0].files.find((f) => f.primary) || versions[0].files[0];

  const id = store.newId();
  const dir = store.instanceDir(id);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alqan-pack-'));
  try {
    progress(`Descargando ${project.title}...`, 2);
    const pack = path.join(tmp, 'pack.mrpack');
    await download(file.url, pack);
    const unz = path.join(tmp, 'x');
    await extract(pack, { dir: unz });

    const index = JSON.parse(fs.readFileSync(path.join(unz, 'modrinth.index.json'), 'utf8'));
    const deps = index.dependencies || {};
    const loader = deps['fabric-loader'] ? 'fabric' : deps['quilt-loader'] ? 'quilt'
      : (deps.forge || deps.neoforge) ? null : 'vanilla';
    if (loader === null) throw new Error('Este modpack necesita Forge o NeoForge, que todavía no están soportados.');

    fs.mkdirSync(dir, { recursive: true });
    const base = path.resolve(dir) + path.sep;
    const files = (index.files || []).filter((f) => !(f.env && f.env.client === 'unsupported'));
    let done = 0;
    const queue = [...files];
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift();
        const dest = path.resolve(dir, f.path);
        if (!dest.startsWith(base)) throw new Error('Ruta inválida en el modpack');
        await download(f.downloads[0], dest);
        if (f.hashes && !hashOk(dest, f.hashes)) throw new Error(`Archivo corrupto: ${f.path}`);
        done++;
        progress(`Instalando ${project.title} (${done}/${files.length})`, 5 + Math.round((done / files.length) * 90));
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));

    for (const o of ['overrides', 'client-overrides']) {
      const src = path.join(unz, o);
      if (fs.existsSync(src)) fs.cpSync(src, dir, { recursive: true, force: true });
    }

    let icon = 'cube:grass';
    if (project.icon_url) {
      try { await download(project.icon_url, path.join(dir, 'alqan-icon.png')); icon = 'file'; } catch { /* sin icono */ }
    }

    return {
      icon, iconV: Date.now(),
      id, createdAt: Date.now(), name: String(index.name || project.title).slice(0, 40),
      version: deps.minecraft, loader, ram: 4, jvmArgs: ''
    };
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { installPack };
