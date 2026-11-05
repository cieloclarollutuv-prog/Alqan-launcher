const fs = require('fs');
const path = require('path');
const { getJson } = require('./net');

const LOADERS = {
  fabric: { api: 'https://meta.fabricmc.net/v2/versions/loader', prefix: 'fabric-loader' },
  quilt: { api: 'https://meta.quiltmc.org/v3/versions/loader', prefix: 'quilt-loader' }
};

function pickStable(list) {
  const stable = list.find((l) =>
    l.loader.stable !== undefined ? l.loader.stable : !/(alpha|beta|rc|pre)/i.test(l.loader.version)
  );
  return (stable || list[0]).loader.version;
}

// Descarga el perfil del modloader y devuelve el id de versión "custom" para usar al lanzar
async function ensureLoader(root, loader, mc) {
  const cfg = LOADERS[loader];
  if (!cfg) return null; // vanilla

  const list = await getJson(`${cfg.api}/${mc}`);
  if (!list.length) throw new Error(`${loader} no está disponible para Minecraft ${mc}`);
  const lv = pickStable(list);
  const expected = `${cfg.prefix}-${lv}-${mc}`;
  const expectedFile = path.join(root, 'versions', expected, `${expected}.json`);
  if (fs.existsSync(expectedFile)) return expected;

  const profile = await getJson(`${cfg.api}/${mc}/${lv}/profile/json`);
  const id = profile.id || expected;
  const dir = path.join(root, 'versions', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(profile));
  return id;
}

module.exports = { ensureLoader };
