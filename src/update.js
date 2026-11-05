// Buscador e instalador de actualizaciones (GitHub Releases del repositorio indicado en Ajustes)
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { UA } = require('./net');

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const parse = (v) => String(v).replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
function newer(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

const wanted = () => (process.platform === 'win32' ? /Setup.*\.exe$/i : process.platform === 'darwin' ? /\.dmg$/i : /\.AppImage$/i);

async function check(repo, current) {
  if (!REPO_RE.test(String(repo || ''))) throw new Error('Escribe el repositorio de GitHub como usuario/repositorio en Ajustes.');
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' } });
  if (res.status === 404) throw new Error('No se encontró ninguna versión publicada en ese repositorio.');
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}`);
  const rel = await res.json();
  const version = String(rel.tag_name || '').replace(/^v/i, '');
  const asset = (rel.assets || []).find((a) => wanted().test(a.name));
  const sums = (rel.assets || []).find((a) => /^SHA256SUMS\.txt$/i.test(a.name));
  return {
    available: !!version && newer(version, current), version, current,
    notes: String(rel.body || '').slice(0, 800), page: rel.html_url,
    asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size } : null,
    sums: sums ? sums.browser_download_url : null
  };
}

async function download(info, progress) {
  if (!info.asset) throw new Error('Esta versión no trae instalador para tu sistema.');
  const ok = (u) => /^https:\/\/(github\.com|objects\.githubusercontent\.com)\//.test(u);
  if (!ok(info.asset.url)) throw new Error('Dirección de descarga no válida.');
  let expected = null;
  if (info.sums && ok(info.sums)) {
    const txt = await (await fetch(info.sums, { headers: { 'User-Agent': UA } })).text();
    const line = txt.split(/\r?\n/).find((l) => l.trim().endsWith(info.asset.name));
    if (line) expected = line.trim().split(/\s+/)[0].toLowerCase();
  }
  const res = await fetch(info.asset.url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Error ${res.status} al descargar la actualización`);
  const total = Number(res.headers.get('content-length')) || info.asset.size || 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alqan-update-'));
  const dest = path.join(dir, info.asset.name.replace(/[\\/:*?"<>|]/g, '_'));
  const out = fs.createWriteStream(dest);
  const hash = crypto.createHash('sha256');
  let got = 0;
  for await (const chunk of res.body) {
    out.write(chunk); hash.update(chunk); got += chunk.length;
    if (total) progress(Math.round((got / total) * 100));
  }
  await new Promise((r) => out.end(r));
  if (expected && hash.digest('hex') !== expected) { fs.rmSync(dir, { recursive: true, force: true }); throw new Error('La descarga no coincide con su huella SHA-256: se canceló la actualización.'); }
  return dest;
}

module.exports = { check, download, newer };
