const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { UA } = require('./net');

const isWin = process.platform === 'win32';

function adoptiumOs() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

function adoptiumArch() {
  return process.arch === 'arm64' ? 'aarch64' : 'x64';
}

// Adoptium no publica Java 16; Java 17 ejecuta esas versiones sin problema
const normMajor = (m) => (m === 16 ? 17 : m);

function findJava(dir, depth = 0) {
  if (depth > 6 || !fs.existsSync(dir)) return null;
  const exe = isWin ? 'java.exe' : 'java';
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = path.join(dir, entry.name);
    if (entry.name === 'bin' && fs.existsSync(path.join(p, exe))) return path.join(p, exe);
    const found = findJava(p, depth + 1);
    if (found) return found;
  }
  return null;
}

// Ejecuta `java -version` y devuelve la versión mayor (8, 17, 21...). 0 si no funciona.
function javaMajor(bin) {
  return new Promise((ok) => {
    execFile(bin, ['-version'], { timeout: 30000 }, (_err, stdout, stderr) => {
      const m = /version "(\d+)(?:\.(\d+))?/.exec(`${stderr || ''}${stdout || ''}`);
      ok(!m ? 0 : m[1] === '1' ? Number(m[2]) : Number(m[1]));
    });
  });
}

// Descarga (una sola vez) un Java portable de Adoptium Temurin y comprueba que funcione
async function ensureJava(root, major, log) {
  const dir = path.join(root, 'runtime', `java-${major}`);
  const existing = findJava(dir);
  if (existing && (await javaMajor(existing)) === major) return existing;

  fs.rmSync(dir, { recursive: true, force: true }); // instalación incompleta o dañada
  fs.mkdirSync(dir, { recursive: true });
  try {
    log(`Descargando Java ${major} (solo la primera vez)...`);
    const url =
      `https://api.adoptium.net/v3/binary/latest/${major}/ga/${adoptiumOs()}/${adoptiumArch()}` +
      '/jre/hotspot/normal/eclipse';
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`No se pudo descargar Java ${major} (HTTP ${res.status})`);

    const archive = path.join(dir, isWin ? 'jre.zip' : 'jre.tar.gz');
    fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));

    log('Extrayendo Java...');
    if (isWin) await require('extract-zip')(archive, { dir });
    else await require('tar').x({ file: archive, cwd: dir });
    fs.unlinkSync(archive);

    const bin = findJava(dir);
    if (!bin) throw new Error('No se encontró Java después de extraerlo');
    if (!isWin) fs.chmodSync(bin, 0o755);
    if ((await javaMajor(bin)) !== major) throw new Error('El Java descargado no se pudo ejecutar');
    return bin;
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

module.exports = { ensureJava, javaMajor, normMajor };
