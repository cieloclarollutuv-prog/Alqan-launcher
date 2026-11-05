const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { safeStorage } = require('electron');
const { Authenticator } = require('minecraft-launcher-core');
const store = require('./store');
const { request, download, getJson } = require('./net');

/* Los tokens se guardan cifrados con el almacén seguro del sistema cuando está disponible */
const enc = (obj) => {
  const s = JSON.stringify(obj);
  return safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : 'raw:' + s;
};
const dec = (s) => JSON.parse(s.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')) : s.slice(4));

function updateAccount(id, patch) {
  const list = store.getAccounts();
  const a = list.find((x) => x.id === id);
  if (a) Object.assign(a, patch);
  store.saveAccounts(list);
}

function upsert(acc) {
  const list = store.getAccounts().filter((a) => !(a.type === acc.type && a.uuid && a.uuid === acc.uuid));
  list.push({ id: store.newId(), ...acc });
  return store.saveAccounts(list);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Microsoft (código de dispositivo) ---------------- */
const MS = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPE = 'XboxLive.signin offline_access';

async function msLogin(onCode) {
  const clientId = store.getSettings().msClientId;
  if (!clientId) throw new Error('MS_NEEDS_CLIENT_ID');
  const dc = await request(`${MS}/devicecode`, { method: 'POST', form: { client_id: clientId, scope: SCOPE } });
  if (!dc.ok) throw new Error('No se pudo iniciar el login de Microsoft: ' + ((dc.data && dc.data.error_description) || dc.status));
  onCode({ code: dc.data.user_code, uri: dc.data.verification_uri });

  const deadline = Date.now() + dc.data.expires_in * 1000;
  let interval = (dc.data.interval || 5) * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const r = await request(`${MS}/token`, {
      method: 'POST',
      form: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: clientId, device_code: dc.data.device_code }
    });
    if (r.ok) return r.data;
    const err = r.data && r.data.error;
    if (err === 'authorization_pending') continue;
    if (err === 'slow_down') { interval += 5000; continue; }
    throw new Error('Inicio de sesión cancelado o rechazado (' + (err || r.status) + ')');
  }
  throw new Error('El código expiró. Inténtalo de nuevo.');
}

async function msRefresh(refresh) {
  const clientId = store.getSettings().msClientId;
  const r = await request(`${MS}/token`, {
    method: 'POST',
    form: { grant_type: 'refresh_token', client_id: clientId, refresh_token: refresh, scope: SCOPE }
  });
  if (!r.ok) throw new Error('La sesión de Microsoft expiró. Vuelve a añadir la cuenta.');
  return r.data;
}

async function xboxChain(msToken) {
  const xbl = await request('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    json: {
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msToken}` },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    }
  });
  if (!xbl.ok) throw new Error('Falló la autenticación con Xbox Live');

  const xsts = await request('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    json: {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.data.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    }
  });
  if (!xsts.ok) {
    const x = xsts.data && xsts.data.XErr;
    if (x === 2148916233) throw new Error('Esta cuenta de Microsoft no tiene perfil de Xbox. Créalo en xbox.com.');
    if (x === 2148916238) throw new Error('Cuenta de menor de edad: debe añadirse a una familia de Microsoft.');
    throw new Error('Falló la autorización de Xbox.');
  }

  const uhs = xsts.data.DisplayClaims.xui[0].uhs;
  const mc = await request('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    json: { identityToken: `XBL3.0 x=${uhs};${xsts.data.Token}` }
  });
  if (!mc.ok) throw new Error(`Minecraft rechazó el inicio de sesión (${mc.status}). Revisa que tu Client ID esté aprobado por Mojang.`);

  const prof = await request('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mc.data.access_token}` }
  });
  if (!prof.ok) throw new Error('Esta cuenta no tiene Minecraft Java Edition.');
  return { token: mc.data.access_token, uuid: prof.data.id, name: prof.data.name };
}

async function addMicrosoft(onCode) {
  const tok = await msLogin(onCode);
  const p = await xboxChain(tok.access_token);
  return upsert({ type: 'microsoft', name: p.name, uuid: p.uuid, secret: enc({ refresh: tok.refresh_token }) });
}

/* ---------------- Ely.by (cuenta no premium con skins) ---------------- */
const ELY = 'https://authserver.ely.by';
const ELY_CFG = { auth: `${ELY}/auth`, api: `${ELY}/api/authlib-injector` };
const cfgFor = (acc) => (acc.type === 'custom' ? { auth: `${acc.server}/authserver`, api: acc.server } : ELY_CFG);

async function addYggdrasil(cfg, extra, { username, password }) {
  const clientToken = crypto.randomUUID();
  const r = await request(`${cfg.auth}/authenticate`, {
    method: 'POST',
    json: { username, password, clientToken, requestUser: true }
  });
  if (!r.ok) throw new Error((r.data && (r.data.errorMessage || r.data.message)) || `El servidor rechazó el inicio de sesión (${r.status})`);
  const prof = r.data.selectedProfile;
  if (!prof) throw new Error('Esa cuenta no tiene un perfil de jugador.');
  return upsert({ ...extra, name: prof.name, uuid: prof.id, secret: enc({ accessToken: r.data.accessToken, clientToken }) });
}

const addElyby = (creds) => addYggdrasil(ELY_CFG, { type: 'elyby' }, creds);

// Servidor de cuentas propio, compatible con authlib-injector (Drasl, Blessing Skin, etc.)
async function addCustom({ server, username, password, register }) {
  let url;
  try { url = new URL(String(server).trim()); } catch { throw new Error('Dirección de servidor inválida'); }
  const local = /^(localhost|127\.|192\.168\.|10\.)/.test(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('El servidor debe usar https://');
  const s = url.origin + url.pathname.replace(/\/+$/, '');
  if (register) {
    const rr = await request(`${s}/api/register`, { method: 'POST', json: { username, password } });
    if (!rr.ok) throw new Error((rr.data && rr.data.errorMessage) || `No se pudo crear la cuenta (${rr.status})`);
  }
  return addYggdrasil({ auth: `${s}/authserver`, api: s }, { type: 'custom', server: s }, { username, password });
}

// Devuelve credenciales vigentes de una cuenta de servidor propio (renueva el token si hace falta)
async function freshToken(acc) {
  const cfg = cfgFor(acc);
  const sec = dec(acc.secret);
  let v = await request(`${cfg.auth}/validate`, { method: 'POST', json: { accessToken: sec.accessToken } });
  if (!v.ok) {
    v = await request(`${cfg.auth}/refresh`, { method: 'POST', json: { accessToken: sec.accessToken, clientToken: sec.clientToken } });
    if (!v.ok) throw new Error('La sesión expiró. Vuelve a iniciar sesión.');
    sec.accessToken = v.data.accessToken;
    updateAccount(acc.id, { secret: enc(sec) });
  }
  return sec;
}

// Sube la skin al servidor de cuentas Alqan (carpeta server/)
async function uploadSkin(acc, png, model) {
  if (acc.type !== 'custom') throw new Error('Las skins de Ely.by se cambian en ely.by. Aquí solo se suben a cuentas de servidor propio.');
  const sec = await freshToken(acc);
  const r = await request(`${acc.server}/api/skin`, {
    method: 'POST', headers: { Authorization: `Bearer ${sec.accessToken}` }, json: { model, png: png.toString('base64') }
  });
  if (!r.ok) throw new Error((r.data && r.data.errorMessage) || `No se pudo subir la skin (${r.status}). ¿Es un servidor de cuentas Alqan?`);
  updateAccount(acc.id, { skinV: Date.now() });
}

async function ensureInjector(root) {
  const jar = path.join(root, 'runtime', 'authlib-injector.jar');
  if (fs.existsSync(jar)) return jar;
  const info = await getJson('https://authlib-injector.yushi.moe/artifact/latest.json');
  await download(info.download_url, jar);
  return jar;
}

/* ---------------- Resolver credenciales al jugar ---------------- */
async function resolve(acc, root) {
  const type = acc.type || 'offline';

  if (type === 'offline') {
    return { authorization: await Authenticator.getAuth(acc.name), jvmArgs: [] };
  }

  if (type === 'microsoft') {
    const sec = dec(acc.secret);
    const tok = await msRefresh(sec.refresh);
    const p = await xboxChain(tok.access_token);
    updateAccount(acc.id, { name: p.name, uuid: p.uuid, secret: enc({ refresh: tok.refresh_token || sec.refresh }) });
    return {
      authorization: {
        access_token: p.token, client_token: crypto.randomUUID(), uuid: p.uuid, name: p.name,
        user_properties: '{}', meta: { type: 'msa', demo: false }
      },
      jvmArgs: []
    };
  }

  if (type === 'elyby' || type === 'custom') {
    const cfg = cfgFor(acc);
    const sec = dec(acc.secret);
    let v = await request(`${cfg.auth}/validate`, { method: 'POST', json: { accessToken: sec.accessToken } });
    if (!v.ok) {
      v = await request(`${cfg.auth}/refresh`, {
        method: 'POST', json: { accessToken: sec.accessToken, clientToken: sec.clientToken }
      });
      if (!v.ok) throw new Error('La sesión de Ely.by expiró. Vuelve a iniciar sesión.');
      sec.accessToken = v.data.accessToken;
      updateAccount(acc.id, { secret: enc(sec) });
    }
    const jar = await ensureInjector(root);
    return {
      authorization: {
        access_token: sec.accessToken, client_token: sec.clientToken, uuid: acc.uuid, name: acc.name,
        user_properties: '{}', meta: { type: 'mojang', demo: false }
      },
      jvmArgs: [`-javaagent:${jar}=${cfg.api}`]
    };
  }

  throw new Error('Tipo de cuenta desconocido');
}

module.exports = { addMicrosoft, addElyby, addCustom, resolve, uploadSkin };
