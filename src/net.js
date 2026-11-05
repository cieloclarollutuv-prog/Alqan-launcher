const fs = require('fs');
const path = require('path');

const UA = 'AlqanLauncher/2.1.0 (open-source minecraft launcher)';

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Error ${res.status} al consultar ${url}`);
  return res.json();
}

// Petición genérica (GET/POST con JSON o formulario). Devuelve { ok, status, data }.
async function request(url, { method = 'GET', json, form, headers = {} } = {}) {
  const opts = { method, headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } };
  if (json) {
    opts.body = JSON.stringify(json);
    opts.headers['Content-Type'] = 'application/json';
  }
  if (form) {
    opts.body = new URLSearchParams(form).toString();
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* sin cuerpo JSON */ }
  return { ok: res.ok, status: res.status, data };
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Error ${res.status} al descargar ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

module.exports = { UA, getJson, request, download };
