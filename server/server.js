#!/usr/bin/env node
// Alqan Auth Server: servidor de cuentas y skins compatible con authlib-injector (Yggdrasil).
// Sin dependencias. Uso:  PUBLIC_URL=https://auth.midominio.com PORT=8080 node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const REGISTRATION = process.env.REGISTRATION !== 'closed';
const NAME = process.env.SERVER_NAME || 'Alqan Auth';
const DAY = 86400000;
fs.mkdirSync(path.join(DATA_DIR, 'textures'), { recursive: true });

/* ---- Claves RSA: firman las texturas para que los servidores las acepten ---- */
const keyFile = path.join(DATA_DIR, 'key.pem');
if (!fs.existsSync(keyFile)) {
  const { privateKey: pk } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  fs.writeFileSync(keyFile, pk.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
}
const privateKey = crypto.createPrivateKey(fs.readFileSync(keyFile));
const publicPem = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });

/* ---- Base de datos (JSON) ---- */
const dbFile = path.join(DATA_DIR, 'db.json');
let db = { users: {}, tokens: {} };
try { db = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch { /* primera vez */ }
const save = () => { fs.writeFileSync(dbFile + '.tmp', JSON.stringify(db)); fs.renameSync(dbFile + '.tmp', dbFile); };
for (const [k, v] of Object.entries(db.tokens)) if (Date.now() - v.t > 90 * DAY) delete db.tokens[k];

const byName = (n) => Object.values(db.users).find((u) => u.name.toLowerCase() === String(n).toLowerCase());
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32);
const checkPw = (u, pw) => crypto.timingSafeEqual(hashPw(pw, u.salt), Buffer.from(u.hash, 'hex'));
const validToken = (tok) => { const t = db.tokens[tok]; return t && Date.now() - t.t < 30 * DAY ? t : null; };

function issue(u, clientToken) {
  const accessToken = crypto.randomBytes(24).toString('hex');
  db.tokens[accessToken] = { uuid: u.id, clientToken, t: Date.now() };
  const mine = Object.entries(db.tokens).filter(([, v]) => v.uuid === u.id).sort((a, b) => a[1].t - b[1].t);
  while (mine.length > 10) delete db.tokens[mine.shift()[0]];
  save();
  return accessToken;
}

function profile(u, signed) {
  const tex = {};
  if (u.skin) tex.SKIN = { url: `${PUBLIC_URL}/textures/${u.skin}`, ...(u.model === 'slim' ? { metadata: { model: 'slim' } } : {}) };
  const value = Buffer.from(JSON.stringify({ timestamp: Date.now(), profileId: u.id, profileName: u.name, textures: tex })).toString('base64');
  const prop = { name: 'textures', value };
  if (signed) prop.signature = crypto.sign('sha1', Buffer.from(value), privateKey).toString('base64');
  return { id: u.id, name: u.name, properties: [prop] };
}

/* ---- Utilidades HTTP ---- */
const send = (res, code, body, headers = {}) => {
  const raw = Buffer.isBuffer(body);
  const data = body == null ? null : raw ? body : JSON.stringify(body);
  res.writeHead(code, { ...(data && !raw ? { 'Content-Type': 'application/json' } : {}), 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(data);
};
const fail = (res, code, error, msg) => send(res, code, { error, errorMessage: msg });
const forbidden = (res, msg = 'Invalid credentials. Invalid username or password.') => fail(res, 403, 'ForbiddenOperationException', msg);

const readBody = (req) => new Promise((ok, no) => {
  const chunks = []; let n = 0;
  req.on('data', (d) => { n += d.length; if (n > 262144) { no(new Error('too big')); req.destroy(); } else chunks.push(d); });
  req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch (e) { no(e); } });
  req.on('error', no);
});

const hits = new Map();
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();
function limited(ip) {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter((t) => now - t < 60000);
  a.push(now); hits.set(ip, a);
  return a.length > 20;
}

const joins = new Map(); // serverId -> { uuid, t }
const authReply = (u, accessToken, clientToken, withUser) => ({
  accessToken, clientToken,
  availableProfiles: [{ id: u.id, name: u.name }], selectedProfile: { id: u.id, name: u.name },
  ...(withUser ? { user: { id: u.id, properties: [] } } : {})
});

/* ---- Servidor ---- */
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const ip = process.env.TRUST_PROXY
    ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress
    : req.socket.remoteAddress;
  try {
    if (req.method === 'OPTIONS') return send(res, 204, null, { 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });

    if (req.method === 'GET') {
      if (p === '/') {
        return send(res, 200, {
          meta: { serverName: NAME, implementationName: 'alqan-auth', implementationVersion: '1.0.0', 'feature.non_email_login': true },
          skinDomains: [new URL(PUBLIC_URL).hostname], signaturePublickey: publicPem
        });
      }
      let m;
      if ((m = p.match(/^\/textures\/([a-f0-9]{64})$/))) {
        const f = path.join(DATA_DIR, 'textures', m[1]);
        if (!fs.existsSync(f)) return fail(res, 404, 'NotFound', 'Not found');
        return send(res, 200, fs.readFileSync(f), { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' });
      }
      if ((m = p.match(/^\/skins\/([a-f0-9]{32})\.png$/))) {
        const u = db.users[m[1]];
        if (!u || !u.skin) return fail(res, 404, 'NotFound', 'Not found');
        return send(res, 200, fs.readFileSync(path.join(DATA_DIR, 'textures', u.skin)), { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
      }
      if (p === '/sessionserver/session/minecraft/hasJoined') {
        const j = joins.get(url.searchParams.get('serverId'));
        const u = j && Date.now() - j.t < 120000 ? db.users[j.uuid] : null;
        if (u && u.name.toLowerCase() === String(url.searchParams.get('username')).toLowerCase()) return send(res, 200, profile(u, true));
        return send(res, 204, null);
      }
      if ((m = p.match(/^\/sessionserver\/session\/minecraft\/profile\/([a-f0-9]{32})$/))) {
        const u = db.users[m[1]];
        return u ? send(res, 200, profile(u, url.searchParams.get('unsigned') === 'false')) : send(res, 204, null);
      }
    }

    if (req.method === 'POST') {
      const b = await readBody(req);

      if (p === '/api/register') {
        if (!REGISTRATION) return fail(res, 403, 'ForbiddenOperationException', 'El registro está cerrado en este servidor.');
        if (limited(ip)) return fail(res, 429, 'TooManyRequests', 'Demasiados intentos. Espera un minuto.');
        if (!/^[A-Za-z0-9_]{3,16}$/.test(b.username || '')) return fail(res, 400, 'IllegalArgumentException', 'El usuario debe tener 3-16 caracteres (letras, números o _).');
        if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 128) return fail(res, 400, 'IllegalArgumentException', 'La contraseña debe tener entre 8 y 128 caracteres.');
        if (byName(b.username)) return fail(res, 409, 'IllegalArgumentException', 'Ese nombre de usuario ya existe.');
        const id = crypto.randomBytes(16).toString('hex');
        const salt = crypto.randomBytes(16).toString('hex');
        db.users[id] = { id, name: b.username, salt, hash: hashPw(b.password, salt).toString('hex'), skin: null, model: 'default' };
        save();
        return send(res, 200, { id, name: b.username });
      }

      if (p === '/authserver/authenticate') {
        if (limited(ip)) return forbidden(res, 'Demasiados intentos. Espera un minuto.');
        const u = byName(b.username || '');
        if (!u || !checkPw(u, b.password || '')) return forbidden(res);
        const clientToken = b.clientToken || crypto.randomUUID();
        return send(res, 200, authReply(u, issue(u, clientToken), clientToken, b.requestUser));
      }
      if (p === '/authserver/refresh') {
        const t = db.tokens[b.accessToken];
        if (!t || (b.clientToken && b.clientToken !== t.clientToken) || !db.users[t.uuid]) return forbidden(res, 'Invalid token.');
        delete db.tokens[b.accessToken];
        const u = db.users[t.uuid];
        return send(res, 200, authReply(u, issue(u, t.clientToken), t.clientToken, b.requestUser));
      }
      if (p === '/authserver/validate') return validToken(b.accessToken) ? send(res, 204, null) : forbidden(res, 'Invalid token.');
      if (p === '/authserver/invalidate') { delete db.tokens[b.accessToken]; save(); return send(res, 204, null); }
      if (p === '/authserver/signout') {
        if (limited(ip)) return forbidden(res, 'Demasiados intentos. Espera un minuto.');
        const u = byName(b.username || '');
        if (!u || !checkPw(u, b.password || '')) return forbidden(res);
        for (const [k, v] of Object.entries(db.tokens)) if (v.uuid === u.id) delete db.tokens[k];
        save();
        return send(res, 204, null);
      }

      if (p === '/sessionserver/session/minecraft/join') {
        const t = validToken(b.accessToken);
        if (!t || t.uuid !== b.selectedProfile || !b.serverId) return forbidden(res, 'Invalid token.');
        joins.set(String(b.serverId), { uuid: t.uuid, t: Date.now() });
        return send(res, 204, null);
      }

      if (p === '/api/profiles/minecraft') {
        const out = (Array.isArray(b) ? b.slice(0, 100) : []).map(byName).filter(Boolean).map((u) => ({ id: u.id, name: u.name }));
        return send(res, 200, out);
      }

      if (p === '/api/skin') {
        const t = validToken(String(req.headers.authorization || '').replace(/^Bearer /, ''));
        const u = t && db.users[t.uuid];
        if (!u) return forbidden(res, 'Invalid token.');
        const png = Buffer.from(String(b.png || ''), 'base64');
        const iend = Buffer.from('0000000049454e44ae426082', 'hex');
        const ok = png.length > 60 && png.length <= 65536 &&
          png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
          png.readUInt32BE(16) === 64 && png.readUInt32BE(20) === 64 && png.subarray(-12).equals(iend);
        if (!ok) return fail(res, 400, 'IllegalArgumentException', 'La skin debe ser un PNG de 64x64 (máx. 64 KB).');
        const hash = crypto.createHash('sha256').update(png).digest('hex');
        const file = path.join(DATA_DIR, 'textures', hash);
        if (!fs.existsSync(file)) fs.writeFileSync(file, png);
        u.skin = hash;
        u.model = b.model === 'slim' ? 'slim' : 'default';
        save();
        return send(res, 200, { ok: true });
      }
    }
    fail(res, 404, 'NotFound', 'Not found');
  } catch {
    fail(res, 400, 'IllegalArgumentException', 'Bad request');
  }
}).listen(PORT, () => console.log(`${NAME} escuchando en ${PUBLIC_URL} (puerto ${PORT})`));
