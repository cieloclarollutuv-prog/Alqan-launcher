const { getJson } = require('./net');

const MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
let cache = null;

async function manifest() {
  if (!cache) cache = await getJson(MANIFEST);
  return cache;
}

// Solo versiones de Minecraft 1.12 en adelante (releases y, opcionalmente, snapshots)
async function listVersions(includeSnapshots) {
  const m = await manifest();
  const base = m.versions.find((v) => v.id === '1.12');
  const cutoff = base ? new Date(base.releaseTime).getTime() : 0;
  return m.versions
    .filter((v) => (v.type === 'release' || (includeSnapshots && v.type === 'snapshot')) &&
      new Date(v.releaseTime).getTime() >= cutoff)
    .map((v) => ({ id: v.id, type: v.type }));
}

// Versión mayor de Java que necesita una versión de Minecraft
async function requiredJavaMajor(mcVersion) {
  try {
    const m = await manifest();
    const entry = m.versions.find((v) => v.id === mcVersion);
    if (!entry) return 17;
    const info = await getJson(entry.url);
    return (info.javaVersion && info.javaVersion.majorVersion) || 8;
  } catch {
    return 17;
  }
}

// JSON completo de una versión de Minecraft (índice de assets, librerías, Java requerido...)
async function versionInfo(mcVersion) {
  const m = await manifest();
  const entry = m.versions.find((v) => v.id === mcVersion);
  if (!entry) throw new Error(`Versión ${mcVersion} no encontrada`);
  return getJson(entry.url);
}

module.exports = { listVersions, requiredJavaMajor, versionInfo };
