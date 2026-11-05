// Aplica una skin a cuentas sin servidor de skins: crea un paquete de recursos
// que reemplaza las skins por defecto (Steve/Alex y las 9 de 1.19.3+).
const fs = require('fs');
const path = require('path');

const NAME = 'AlqanSkin';
const NEW = ['alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri'];

function packFormat(v) {
  const [ma, mi, pa] = String(v).split('.').map((x) => parseInt(x, 10) || 0);
  if (ma >= 26) return mi >= 3 ? 97 : mi === 2 ? 88 : 84;
  if (mi <= 12) return 3; if (mi <= 14) return 4; if (mi === 15) return 5;
  if (mi === 16) return pa >= 2 ? 6 : 5; if (mi === 17) return 7; if (mi === 18) return 8;
  if (mi === 19) return pa >= 4 ? 13 : pa === 3 ? 12 : 9;
  if (mi === 20) return pa >= 5 ? 32 : pa >= 3 ? 22 : pa === 2 ? 18 : 15;
  if (mi === 21) return pa >= 11 ? 75 : pa >= 9 ? 69 : pa >= 7 ? 64 : pa === 6 ? 63 : pa === 5 ? 55 : pa >= 4 ? 46 : pa >= 2 ? 42 : 34;
  return 97;
}

function mcmeta(version, description) {
  const n = packFormat(version);
  const pack = { description: String(description || '').slice(0, 200) };
  if (n >= 65) { pack.min_format = n === 97 && /^26\.3|^2[7-9]/.test(String(version)) ? [97, 1] : n; pack.max_format = n; }
  else { pack.pack_format = n; pack.supported_formats = { min_inclusive: 0, max_inclusive: 64 }; }
  return JSON.stringify({ pack }, null, 2);
}

function apply(gameDir, version, png) {
  const dir = path.join(gameDir, 'resourcepacks', NAME);
  const tex = path.join(dir, 'assets', 'minecraft', 'textures', 'entity');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(tex, 'player', 'wide'), { recursive: true });
  fs.mkdirSync(path.join(tex, 'player', 'slim'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'pack.mcmeta'), mcmeta(version, 'Alqan Launcher skin'));
  for (const f of ['steve', 'alex']) fs.writeFileSync(path.join(tex, f + '.png'), png);
  for (const n of NEW) for (const m of ['wide', 'slim']) fs.writeFileSync(path.join(tex, 'player', m, n + '.png'), png);
  // activarlo en options.txt
  const [ma, mi] = String(version).split('.').map((x) => parseInt(x, 10) || 0);
  const entry = ma >= 26 || mi >= 13 ? 'file/' + NAME : NAME;
  const opt = path.join(gameDir, 'options.txt');
  let lines = fs.existsSync(opt) ? fs.readFileSync(opt, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  const i = lines.findIndex((l) => l.startsWith('resourcePacks:'));
  let list = [];
  if (i >= 0) { try { list = JSON.parse(lines[i].slice(14)); } catch {} }
  if (!list.includes(entry)) list.push(entry);
  const line = 'resourcePacks:' + JSON.stringify(list);
  if (i >= 0) lines[i] = line; else lines.push(line);
  fs.writeFileSync(opt, lines.join('\n') + '\n');
}

function remove(gameDir) { fs.rmSync(path.join(gameDir, 'resourcepacks', NAME), { recursive: true, force: true }); }

module.exports = { apply, remove, packFormat, mcmeta };
