const api = window.alqan;
const $ = (s) => document.querySelector(s);

const state = {
  settings: {}, instances: [], accounts: [], versions: [], showSnapshots: false,
  tab: 'instances', settingsTab: 'general', playing: false, showLog: false, log: [], appVersion: '',
  browse: { type: 'modpack', query: '', results: null, loading: false, error: '' }
};

const t = (k) => ((window.I18N[state.settings.lang] || window.I18N.es)[k]) || window.I18N.es[k] || k;

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') continue;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  if (props && 'value' in props) el.value = props.value;
  return el;
}

const cleanError = (e) => String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const loaderLabel = (l) => ({ vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt' }[l] || l);
const fmtSize = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : (b / 1048576).toFixed(1) + ' MB');
const selectedInstance = () => state.instances.find((i) => i.id === state.settings.selectedInstance) || state.instances[0] || null;
const selectedAccount = () => state.accounts.find((a) => a.id === state.settings.selectedAccount) || state.accounts[0] || null;
const persist = async (patch) => { state.settings = await api.setSettings(patch); };
const gradFor = (s) => { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) % 360; return `linear-gradient(135deg,hsl(${n} 65% 55%),hsl(${(n + 50) % 360} 65% 45%))`; };
const CUBES = {
  grass: ['#6fbf4a', '#8a5a2b', '#6f4722'], stone: ['#a8a8a8', '#8a8a8a', '#6e6e6e'], dirt: ['#9b6b3d', '#85572d', '#6c4623'],
  sand: ['#eadb9a', '#d8c77f', '#c2b16a'], wood: ['#b8894d', '#9a6f3a', '#7d5a2f'], ice: ['#c4ecff', '#9bd8f5', '#7cc4e6'],
  gold: ['#ffe066', '#f2c230', '#d9a91c'], lava: ['#ff9a3c', '#e5651b', '#bf4a10'], diamond: ['#7ff3e8', '#46d4c8', '#2fb0a6']
};
const cubeIcon = (name) => {
  const [top, left, right] = CUBES[name] || CUBES.grass;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><polygon points="32,6 58,20 32,34 6,20" fill="${top}"/>` +
    `<polygon points="6,20 32,34 32,60 6,46" fill="${left}"/><polygon points="58,20 32,34 32,60 58,46" fill="${right}"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
};
const iconSrc = (i) => i.iconUrl || cubeIcon(i.icon && i.icon.startsWith('cube:') ? i.icon.slice(5) : 'grass');
const avatar = (name) => `https://minotar.net/helm/${encodeURIComponent(name)}/48`;

// Cabeza de la skin (con capa exterior). Las cuentas de servidor propio la leen de su servidor.
function avatarEl(acc, size) {
  const base = `width:${size}px;height:${size}px;border-radius:${Math.round(size / 6)}px;image-rendering:pixelated;`;
  if (acc.type !== 'custom') return h('img', { src: avatar(acc.name), alt: '', style: base });
  const url = `url("${acc.server}/skins/${acc.uuid}.png?v=${acc.skinV || 0}")`;
  const bs = `${size * 8}px ${size * 8}px`;
  return h('div', { style: `${base}background-color:#555;background-image:${url},${url};background-size:${bs},${bs};background-position:-${size * 5}px -${size}px,-${size}px -${size}px` });
}

/* ---------- Iconos (SVG de trazo, se adaptan al tema) ---------- */
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>', grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>', skin: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/>',
  brush: '<path d="M4 20c3 0 5-1 5-3.5L18 6a1.8 1.8 0 00-2.5-2.5L7 13c-1.5 1-1.5 2-1.5 3.5C5.500 18.500 4 19 4 20z"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100"/>',
  user: '<circle cx="12" cy="9" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/>', upload: '<path d="M12 16V5M7.500 9.500L12 5l4.500 4.500M5 19h14"/>',
  download: '<path d="M12 5v11M7.500 11.500L12 16l4.500-4.500M5 19h14"/>', folder: '<path d="M3.500 7.500a1.500 1.500 0 011.500-1.500h4l2 2.500h8a1.500 1.500 0 011.500 1.500V17a1.500 1.500 0 01-1.500 1.500H5A1.500 1.500 0 013.500 17z"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>', image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.500"/><path d="M5 17l5-4 3 2.500 3-3 3 3.500"/>',
  bolt: '<path d="M13 3L6 13.500h5L10 21l7-10.500h-5z"/>', check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>'
};
const ico = (name) => {
  const s = h('span', { class: 'ico' });
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="var(--iw)" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return s;
};

/* ---------- Tema ---------- */
const PRESETS = {
  dark: { bg: '#101114', panel: '#17181d', text: '#e6e6ea', accent: '#7c6cf0' },
  light: { bg: '#f1f2f5', panel: '#ffffff', text: '#1b1c21', accent: '#5b5bd6' },
  amoled: { bg: '#000000', panel: '#0b0b0d', text: '#f0f0f0', accent: '#22d3ee' },
  ocean: { bg: '#0b1620', panel: '#112233', text: '#dbeafe', accent: '#38bdf8' },
  forest: { bg: '#0f1712', panel: '#16231b', text: '#e6f2e8', accent: '#4ade80' }
};

function applyTheme() {
  const th = state.settings.theme;
  const r = document.documentElement.style;
  r.setProperty('--bg', th.colors.bg);
  r.setProperty('--panel', th.colors.panel);
  r.setProperty('--text', th.colors.text);
  r.setProperty('--accent', th.colors.accent);
  r.setProperty('--radius', th.radius + 'px');
  if (th.iconWeight == null) th.iconWeight = 1.75;
  if (th.fontScale == null) th.fontScale = 100;
  if (!th.font) th.font = 'system';
  if (th.iconAccent == null) th.iconAccent = false;
  r.setProperty('--iw', th.iconWeight);
  r.setProperty('--iconc', th.iconAccent ? th.colors.accent : 'currentColor');
  r.setProperty('--fs', th.fontScale / 100);
  r.setProperty('--font', { system: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', mono: 'ui-monospace,Consolas,Menlo,monospace', serif: 'Georgia,"Times New Roman",serif', rounded: '"Trebuchet MS","Segoe UI",system-ui,sans-serif' }[th.font]);
  $('#bgimg').style.backgroundImage = th.bgImage ? `url("${th.bgImage}")` : 'none';
  $('#bgimg').style.filter = `blur(${th.blur}px)`;
  $('#bgdim').style.opacity = th.bgImage ? th.dim : 0;
  document.body.classList.toggle('has-bg', !!th.bgImage);
}

/* ---------- Estructura ---------- */
function renderTop() {
  const acc = selectedAccount();
  const btn = (tab, label, icn) => h('button', { class: 'tbtn' + (state.tab === tab ? ' active' : ''), onclick: () => go(tab) }, ico(icn), label);
  $('#topbar').replaceChildren(
    h('div', { class: 'brand' }, h('img', { class: 'logo', src: 'logo.png', alt: '' }), 'Alqan'),
    h('button', { class: 'tbtn', onclick: () => instanceModal(null) }, ico('plus'), t('addInstance')),
    btn('instances', state.settings.lang === 'en' ? 'Instances' : 'Instancias', 'grid'),
    btn('browse', t('explore'), 'compass'),
    btn('skins', 'Skins', 'skin'),
    btn('packs', state.settings.lang === 'en' ? 'Packs' : 'Paquetes', 'brush'),
    h('div', { class: 'spacer' }),
    btn('settings', t('settings'), 'gear'),
    h('button', { class: 'tbtn chip' + (state.tab === 'accounts' ? ' active' : ''), onclick: () => go('accounts') },
      acc ? avatarEl(acc, 20) : ico('user'), acc ? acc.name : t('accounts'))
  );
}

function go(tab) { state.tab = tab; render(); }

function render() {
  applyTheme();
  renderTop();
  const views = { instances: viewInstances, browse: viewBrowse, accounts: viewAccounts, skins: viewSkins, packs: viewPacks, settings: viewSettings };
  $('#view').replaceChildren(views[state.tab]());
  if (state.tab === 'browse') loadInstalled();
  if (state.tab === 'settings' && state.settingsTab === 'storage') loadStorage();
}

function setStatus(text, progress, pct) {
  $('#statusText').textContent = text || '';
  $('#progressWrap').classList.toggle('hidden', !progress);
  if (typeof pct === 'number') $('#progressBar').style.width = pct + '%';
}

/* ---------- Instancias ---------- */
function viewInstances() {
  const sel = selectedInstance();
  const tiles = state.instances.map((i) =>
    h('div', {
      class: 'tile' + (sel && sel.id === i.id ? ' sel' : ''),
      onclick: async () => { await persist({ selectedInstance: i.id }); render(); },
      ondblclick: () => play(i)
    },
    h('img', { class: 'ticon', src: iconSrc(i), alt: '' }),
    h('div', { class: 'tname', title: i.name }, i.name),
    h('div', { class: 'tmeta' }, `${i.version} · ${loaderLabel(i.loader)}`)));

  const side = sel ? h('div', { class: 'side' },
    h('h3', null, sel.name),
    h('div', { class: 'meta' }, `Minecraft ${sel.version} · ${loaderLabel(sel.loader)} · ${sel.ram} GB`),
    h('button', { class: 'primary', disabled: state.playing || !selectedAccount(), onclick: () => play(sel) }, '▶ ' + t('play')),
    h('button', { onclick: () => instanceModal(sel) }, '✎ ' + t('edit')),
    h('button', { onclick: () => { state.browse.type = 'mod'; state.browse.results = null; go('browse'); } }, '✦ ' + t('content')),
    h('button', { disabled: state.playing, onclick: async () => {
      if (!confirm(t('optimizeConfirm'))) return;
      setStatus(t('optimizing'), true, 40);
      try {
        const r = await api.optimize(sel.id);
        state.instances = r.instances; setStatus('', false);
        const line = (k, a) => (a.length ? `\n${t(k)}: ${a.join(', ')}` : '');
        alert(t('optimizeDone') + line('optAdded', r.added) + line('optSkipped', r.skipped) + line('optFailed', r.failed));
        render();
      } catch (e) { setStatus('', false); alert(cleanError(e)); }
    } }, '⚡ ' + t('optimize')),
    h('button', { onclick: async () => {
      setStatus(L2('Reparando archivos…', 'Repairing files…'), true, 30);
      try { await api.repairInstance(sel.id); setStatus(L2('Reparado: ya puedes jugar.', 'Repaired: you can play now.'), false); }
      catch (e) { setStatus('', false); alert(cleanError(e)); }
    } }, ico('bolt'), L2('Reparar', 'Repair')),
    h('button', { onclick: () => api.openInstanceFolder(sel.id) }, '📁 ' + t('folder')),
    h('button', { onclick: async () => { state.instances = await api.duplicateInstance(sel.id); render(); } }, '⧉ ' + t('duplicate')),
    h('button', { onclick: () => { state.showLog = !state.showLog; render(); } }, '▤ ' + t('console')),
    state.showLog && h('button', { onclick: () => api.openLog().catch((e) => alert(cleanError(e))) }, '↗ ' + (state.settings.lang === 'en' ? 'Open log file' : 'Abrir registro')),
    h('button', { class: 'danger', onclick: async () => {
      if (!confirm(t('confirmDelete'))) return;
      state.instances = await api.deleteInstance(sel.id);
      render();
    } }, '🗑 ' + t('delete'))
  ) : null;

  const log = state.showLog ? h('pre', { class: 'log', id: 'log' }, state.log.join('\n')) : null;
  if (log) setTimeout(() => { log.scrollTop = log.scrollHeight; });

  return h('div', { class: 'layout' },
    h('div', { class: 'main' },
      !state.instances.length ? h('div', { class: 'empty' }, t('noInstances')) : h('div', { class: 'grid' }, tiles),
      !selectedAccount() && h('div', { class: 'notice', style: 'margin-top:14px' }, t('noAccount')),
      log),
    side);
}

async function play(inst) {
  const acc = selectedAccount();
  if (!inst || !acc || state.playing) return;
  state.playing = true;
  state.log = [];
  setStatus(t('stLaunching'), true, 0);
  render();
  try {
    await api.launch({ instanceId: inst.id, accountId: acc.id });
  } catch (e) {
    state.playing = false;
    state.showLog = true;
    pushLog('ERROR: ' + cleanError(e));
    setStatus(cleanError(e), false);
    render();
  }
}

function pushLog(line) {
  state.log.push(line);
  if (state.log.length > 800) state.log.shift();
  const el = $('#log');
  if (el) { el.textContent = state.log.join('\n'); el.scrollTop = el.scrollHeight; }
}

api.onProgress((p) => setStatus(`${t('dl')} ${p.type}...`, true, p.total ? Math.round((p.task / p.total) * 100) : 0));
api.onTask((p) => setStatus(p.text, true, p.pct));
api.onLog(pushLog);
api.onStatus((s) => { if (s === 'running') setStatus(t('stRunning'), false); });
api.onClosed(() => { state.playing = false; setStatus(t('stClosed'), false); if (state.tab === 'instances') render(); });

/* ---------- Modal de instancia ---------- */
const closeModal = () => $('#modalRoot').replaceChildren();
const openModal = (...kids) => $('#modalRoot').replaceChildren(
  h('div', { class: 'modal-bg', onclick: (e) => { if (e.target.classList.contains('modal-bg')) closeModal(); } }, h('div', { class: 'modal' }, ...kids)));

async function loadVersions() {
  try { state.versions = await api.listVersions(state.showSnapshots); } catch { state.versions = []; }
}

async function instanceModal(inst) {
  await loadVersions();
  const d = inst ? { ...inst } : { name: 'Minecraft', version: (state.versions[0] || {}).id || '', loader: 'vanilla', ram: 4, jvmArgs: '' };
  const nameIn = h('input', { value: d.name, maxlength: 40 });
  const verSel = h('select');
  const fill = () => {
    verSel.replaceChildren(...state.versions.map((v) => h('option', { value: v.id }, v.type === 'snapshot' ? `${v.id} (snapshot)` : v.id)));
    verSel.value = state.versions.some((v) => v.id === d.version) ? d.version : (state.versions[0] || {}).id;
  };
  fill();
  verSel.addEventListener('change', () => (d.version = verSel.value));
  const snap = h('input', { type: 'checkbox', onchange: async (e) => {
    state.showSnapshots = e.target.checked; await loadVersions(); d.version = verSel.value; fill();
  } });
  snap.checked = state.showSnapshots;
  const loader = h('select', { value: d.loader },
    h('option', { value: 'vanilla' }, t('lVanilla')), h('option', { value: 'fabric' }, t('lFabric')), h('option', { value: 'quilt' }, t('lQuilt')));
  const ramLabel = h('b', null, d.ram);
  const ram = h('input', { type: 'range', min: 1, max: 16, step: 1, value: d.ram, oninput: (e) => (ramLabel.textContent = e.target.value) });
  const jvm = h('input', { value: d.jvmArgs || '', placeholder: '-XX:+UseG1GC' });
  const iconRow = h('div', { class: 'actions', style: 'margin-top:4px;align-items:center' },
    Object.keys(CUBES).map((k) => h('img', {
      class: 'ticon pick' + (d.icon === 'cube:' + k ? ' on' : ''), src: cubeIcon(k), title: k, alt: k,
      onclick: (e) => { d.icon = 'cube:' + k; iconRow.querySelectorAll('.pick').forEach((x) => x.classList.remove('on')); e.target.classList.add('on'); }
    })),
    inst && h('button', { class: 'sm', onclick: async () => { state.instances = await api.pickInstanceIcon(inst.id); closeModal(); render(); } }, t('iconImage')));
  const err = h('div', { class: 'error' });

  openModal(
    h('h2', null, inst ? t('editInstance') : t('newInstance')),
    h('label', null, t('name')), nameIn,
    h('label', null, t('version')), verSel,
    h('label', { class: 'check' }, snap, t('snapshots')),
    h('label', null, t('loader')), loader,
    h('label', null, `${t('ram')}: `, ramLabel, ' GB'), ram,
    h('label', null, t('jvm')), jvm,
    h('label', null, t('icon')), iconRow, err,
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: async () => {
        try {
          state.instances = await api.saveInstance({
            id: inst ? inst.id : undefined, name: nameIn.value.trim() || 'Minecraft',
            version: verSel.value, loader: loader.value, ram: Number(ram.value), jvmArgs: jvm.value, icon: d.icon
          });
          if (!inst) await persist({ selectedInstance: state.instances[state.instances.length - 1].id });
          closeModal(); go('instances');
        } catch (e) { err.textContent = cleanError(e); }
      } }, inst ? t('save') : t('create')),
      h('button', { onclick: closeModal }, t('cancel'))));
}

/* ---------- Explorar (Modrinth) ---------- */
function viewBrowse() {
  const b = state.browse;
  const inst = selectedInstance();
  const isPack = b.type === 'modpack';
  const types = [['modpack', 'modpacks'], ['mod', 'mods'], ['resourcepack', 'resourcepacks'], ['shader', 'shaders']];
  const tabs = h('div', { class: 'tabs' }, types.map(([id, key]) =>
    h('button', { class: b.type === id ? 'active' : '', onclick: () => { b.type = id; b.results = null; b.error = ''; render(); } }, t(key))));

  const input = h('input', { value: b.query, placeholder: t('searchPh') });
  const go_ = () => { b.query = input.value; runSearch(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go_(); });

  const needLoader = !isPack && b.type === 'mod' && inst && inst.loader === 'vanilla';
  let body;
  if (!isPack && !inst) body = h('div', { class: 'notice' }, t('noInstances'));
  else if (needLoader) body = h('div', { class: 'notice' }, t('needLoader'));
  else if (b.loading) body = h('div', { class: 'empty' }, t('searching'));
  else if (b.error) body = h('div', { class: 'empty error' }, b.error);
  else if (b.results && !b.results.length) body = h('div', { class: 'empty' }, t('noResults'));
  else body = h('div', { class: 'results' }, (b.results || []).map((m) => resultCard(m, inst)));

  if (!b.results && !b.loading && !b.error && !needLoader && (isPack || inst)) setTimeout(runSearch);

  const target = !isPack && inst ? [
    h('label', null, t('target')),
    h('select', { value: inst.id, onchange: async (e) => { await persist({ selectedInstance: e.target.value }); b.results = null; render(); } },
      state.instances.map((i) => h('option', { value: i.id }, `${i.name} — ${i.version} ${loaderLabel(i.loader)}`)))
  ] : null;

  return h('div', { class: 'page' },
    h('h1', null, t('explore')), tabs, target,
    h('div', { style: 'display:flex;gap:8px;margin:12px 0' }, input, h('button', { class: 'primary', onclick: go_ }, t('search'))),
    body,
    !isPack && h('h2', null, t('installedHere')),
    !isPack && h('div', { class: 'list', id: 'installedList' }));
}

async function runSearch() {
  const b = state.browse;
  const inst = selectedInstance();
  if (state.tab !== 'browse') return;
  b.loading = true; b.error = ''; render();
  try {
    b.results = await api.searchContent({
      type: b.type, query: b.query, version: inst && inst.version, loader: inst && inst.loader
    });
  } catch (e) {
    b.results = [];
    b.error = cleanError(e).includes('NEED_LOADER') ? t('needLoader') : t('loadError');
  }
  b.loading = false;
  if (state.tab === 'browse') render();
}

function resultCard(m, inst) {
  const isPack = state.browse.type === 'modpack';
  const btn = h('button', { class: 'primary' }, isPack ? t('createFromPack') : t('install'));
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = t('installing');
    try {
      if (isPack) {
        const r = await api.installPack(m.id);
        state.instances = r.instances;
        await persist({ selectedInstance: r.created });
        setStatus('', false);
        go('instances');
        return;
      }
      await api.installContent({ type: state.browse.type, projectId: m.id, instanceId: inst.id });
      btn.textContent = t('installed');
      loadInstalled();
    } catch (e) {
      setStatus('', false);
      btn.textContent = t('unavailable');
      btn.title = cleanError(e);
      if (isPack) alert(cleanError(e));
    }
  });
  return h('div', { class: 'mod' },
    m.icon ? h('img', { src: m.icon, alt: '' }) : h('div', { class: 'noicon' }),
    h('div', { class: 'info' }, h('b', null, m.title), h('div', { class: 'desc' }, m.description),
      h('div', { class: 'meta' }, `${m.author} · ${m.downloads.toLocaleString(state.settings.lang)} ${t('downloads')}`)),
    btn);
}

async function loadInstalled() {
  const inst = selectedInstance();
  const list = $('#installedList');
  if (!inst || !list) return;
  const type = state.browse.type;
  const files = await api.listContent({ type, instanceId: inst.id });
  list.replaceChildren(...(files.length ? files.map((f) =>
    h('div', { class: 'row-item' }, h('span', { class: 'grow' }, f),
      h('button', { class: 'danger sm', onclick: async () => { await api.removeContent({ type, instanceId: inst.id, filename: f }); loadInstalled(); } }, t('remove'))))
    : [h('div', { class: 'empty' }, t('nothing'))]));
}

/* ---------- Cuentas ---------- */
const typeLabel = (a) => ({ microsoft: 'Microsoft', elyby: 'Ely.by', custom: 'authlib' }[a.type] || 'Offline');

function viewAccounts() {
  const sel = selectedAccount();
  const msg = h('div', { class: 'error' });
  const run = async (fn) => {
    msg.textContent = '';
    try { state.accounts = await fn(); if (!sel) await persist({ selectedAccount: state.accounts[state.accounts.length - 1].id }); closeModal(); render(); }
    catch (e) { closeModal(); msg.textContent = cleanError(e).includes('MS_NEEDS_CLIENT_ID') ? t('msNeedsId') : cleanError(e); }
  };

  const rows = state.accounts.map((a) => h('div', { class: 'row-item' },
    avatarEl(a, 36),
    h('div', { class: 'grow' }, h('b', null, a.name), h('span', { class: 'badge' }, typeLabel(a)), sel && sel.id === a.id ? ' ✓ ' + t('current') : ''),
    h('button', { class: 'sm', onclick: async () => { await persist({ selectedAccount: a.id }); render(); } }, t('select')),
    h('button', { class: 'danger sm', onclick: async () => { state.accounts = await api.deleteAccount(a.id); render(); } }, t('delete'))));

  const offName = h('input', { placeholder: t('username'), maxlength: 16 });
  const addOff = () => run(() => api.addOffline(offName.value));
  offName.addEventListener('keydown', (e) => { if (e.key === 'Enter') addOff(); });

  const clientId = h('input', { value: state.settings.msClientId || '', placeholder: t('msClientId') });
  const elyUser = h('input', { placeholder: t('elyUser') });
  const elyPass = h('input', { type: 'password', placeholder: t('password') });
  const srvIn = h('input', { placeholder: t('serverUrl') });
  const cUser = h('input', { placeholder: t('username') });
  const cPass = h('input', { type: 'password', placeholder: t('password') });
  const skinModel = h('select', null, h('option', { value: 'default' }, 'Steve (4px)'), h('option', { value: 'slim' }, 'Alex (3px)'));
  const skinBtn = h('button', { disabled: !(sel && sel.type === 'custom'), onclick: async () => {
    msg.textContent = '';
    try { state.accounts = await api.uploadSkin({ id: sel.id, model: skinModel.value }); render(); }
    catch (e) { msg.textContent = cleanError(e); }
  } }, t('uploadSkin'));

  return h('div', { class: 'page' },
    h('h1', null, t('accounts')), h('p', { class: 'sub' }, t('accSub')),
    h('div', { class: 'list' }, rows), msg,
    h('h2', null, t('offline')),
    h('div', { style: 'display:flex;gap:8px' }, offName, h('button', { class: 'primary', onclick: addOff }, t('add'))),
    h('h2', null, t('msTitle')),
    h('div', { class: 'card' },
      h('div', { class: 'sub' }, t('msHelp')),
      clientId,
      h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: async () => {
        await persist({ msClientId: clientId.value.trim() });
        run(() => api.addMicrosoft());
      } }, t('msButton')))),
    h('h2', null, t('elyTitle')),
    h('div', { class: 'card' }, elyUser, h('div', { style: 'height:8px' }), elyPass,
      h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: () => run(() => api.addElyby({ username: elyUser.value, password: elyPass.value })) }, t('add')))),
    h('h2', null, t('customTitle')),
    h('div', { class: 'card' }, h('div', { class: 'sub' }, t('customHelp')), srvIn, h('div', { style: 'height:8px' }), cUser, h('div', { style: 'height:8px' }), cPass,
      h('div', { class: 'actions' },
        h('button', { class: 'primary', onclick: () => run(() => api.addCustom({ server: srvIn.value, username: cUser.value, password: cPass.value })) }, t('add')),
        h('button', { onclick: () => run(() => api.addCustom({ server: srvIn.value, username: cUser.value, password: cPass.value, register: true })) }, t('register'))),
      h('label', null, t('skin')),
      h('div', { style: 'display:flex;gap:8px' }, skinModel, skinBtn),
      h('div', { class: 'sub', style: 'margin-top:8px' }, t('skinNote'))),
    h('p', { class: 'sub', style: 'margin-top:16px' }, t('tlNote')));
}

api.onAuthCode(({ code, uri }) => openModal(
  h('h2', null, t('msTitle')), h('p', null, t('msCode')), h('div', { class: 'code' }, code),
  h('div', { class: 'sub' }, uri), h('div', { class: 'sub' }, t('msWaiting')),
  h('div', { class: 'actions' }, h('button', { onclick: () => api.openExternal(uri) }, uri))));

/* ---------- Skins (biblioteca + vista 3D) ---------- */
const skinSel = { id: null, model: null, rot: 28, drag: null };
const SKIN_BOXES = [ // nombre, x0, y0, ancho, alto, prof, posición (x,y,z) en px
  ['head', 0, 0, 8, 8, 8, 0, 0], ['body', 16, 16, 8, 12, 4, 0, 10], ['rarm', 40, 16, 4, 12, 4, -6, 10],
  ['larm', 32, 48, 4, 12, 4, 6, 10], ['rleg', 0, 16, 4, 12, 4, -2, 22], ['lleg', 16, 48, 4, 12, 4, 2, 22]];

function skinCube(src, model, [, x0, y0, w, hh, d, px, py]) {
  if (model === 'slim' && w === 4 && hh === 12 && d === 4 && x0 >= 32 && y0 >= 16 && y0 <= 48 && px !== 0 && Math.abs(px) === 6) w = 3;
  const S = 6, W = 64 * S;
  const fc = (name, fx, fy, fw, fh, tf) => h('div', { class: 'sf', style:
    `width:${fw * S}px;height:${fh * S}px;background:url(${src}) -${fx * S}px -${fy * S}px/${W}px ${W}px;transform:${tf}` });
  const hw = w * S / 2, hd = d * S / 2, hh2 = hh * S / 2;
  return h('div', { class: 'sc', style: `width:0;height:0;transform:translate3d(${px * S}px,${py * S}px,0)` },
    fc('f', x0 + d, y0 + d, w, hh, `translate(-50%,-50%) translateZ(${hd}px)`),
    fc('b', x0 + 2 * d + w, y0 + d, w, hh, `translate(-50%,-50%) rotateY(180deg) translateZ(${hd}px)`),
    fc('r', x0, y0 + d, d, hh, `translate(-50%,-50%) rotateY(-90deg) translateZ(${hw}px)`),
    fc('l', x0 + d + w, y0 + d, d, hh, `translate(-50%,-50%) rotateY(90deg) translateZ(${hw}px)`),
    fc('t', x0 + d, y0, w, d, `translate(-50%,-50%) rotateX(90deg) translateZ(${hh2}px)`),
    fc('u', x0 + d + w, y0, w, d, `translate(-50%,-50%) rotateX(-90deg) translateZ(${hh2}px)`));
}

function skin3d(src, model) {
  const S = 6;
  const wrap = h('div', { class: 'skin3d' });
  const body = h('div', { class: 'sbody', style: `transform:rotateX(-12deg) rotateY(${skinSel.rot}deg)` },
    SKIN_BOXES.map((b) => skinCube(src, model, b)));
  wrap.append(h('div', { style: `position:absolute;left:50%;top:${S * 20}px;transform-style:preserve-3d;transform:translateY(-${S * 14}px)` }, body));
  wrap.addEventListener('mousedown', (e) => { skinSel.drag = e.clientX; });
  window.addEventListener('mouseup', () => { skinSel.drag = null; });
  wrap.addEventListener('mousemove', (e) => {
    if (skinSel.drag == null) return;
    skinSel.rot += (e.clientX - skinSel.drag) * 0.8; skinSel.drag = e.clientX;
    body.style.transform = `rotateX(-12deg) rotateY(${skinSel.rot}deg)`;
  });
  return wrap;
}

function viewSkins() {
  const page = state.skinTab === 'editor' ? viewSkinEditor() : viewSkinLibrary();
  const tabs = h('div', { class: 'tabs' }, [['library', L2('Biblioteca', 'Library')], ['editor', L2('Editor', 'Editor')]].map(([id, label]) =>
    h('button', { class: (state.skinTab || 'library') === id ? 'active' : '', onclick: () => { state.skinTab = id; render(); } }, label)));
  page.insertBefore(tabs, page.children[1] || null);
  return page;
}

function viewSkinLibrary() {
  const en = state.settings.lang === 'en';
  const L = (es, e) => (en ? e : es);
  const lib = window.SKIN_LIB || [];
  const cur = lib.find((s) => s.id === skinSel.id) || lib[0];
  if (skinSel.model == null || skinSel.id !== cur.id) { skinSel.id = cur.id; skinSel.model = cur.model === 'slim' ? 'slim' : 'default'; }
  const acc = selectedAccount();
  const msg = h('div', { class: 'error' });
  const grid = h('div', { class: 'skin-grid' });
  const draw = (q) => {
    const k = q.trim().toLowerCase();
    grid.replaceChildren(...lib.filter((s) => !k || (s.name + ' ' + s.tags).toLowerCase().includes(k)).map((s) =>
      h('div', { class: 'skin-card' + (s.id === cur.id ? ' sel' : ''), onclick: () => { skinSel.id = s.id; skinSel.model = null; render(); } },
        h('div', { class: 'skin-face', style: `background:url(${s.data}) -40px -40px/320px 320px,url(${s.data}) -200px -40px/320px 320px` }),
        h('div', null, s.name))));
  };
  const search = h('input', { placeholder: L('Buscar skin (ej: ninja, robot, zombi)…', 'Search skins (e.g. ninja, robot, zombie)…'), oninput: (e) => draw(e.target.value) });
  draw('');
  const model = h('select', { onchange: (e) => { skinSel.model = e.target.value; render(); } },
    h('option', { value: 'default', selected: skinSel.model === 'default' }, 'Steve (4px)'),
    h('option', { value: 'slim', selected: skinSel.model === 'slim' }, 'Alex (3px)'));
  const apply = h('button', { class: 'primary', disabled: !acc || acc.type === 'microsoft', onclick: async () => {
    msg.textContent = '';
    try { state.accounts = await api.applySkin({ id: acc.id, png: cur.data.split(',')[1], model: skinSel.model }); msg.style.color = 'var(--accent)'; msg.textContent = L('¡Skin aplicada!', 'Skin applied!'); }
    catch (e) { msg.style.color = ''; msg.textContent = cleanError(e); }
  } }, L('Usar esta skin', 'Use this skin'));
  const note = !acc ? L('Crea una cuenta primero.', 'Create an account first.')
    : acc.type === 'microsoft' ? L('Las cuentas Microsoft cambian su skin en minecraft.net.', 'Microsoft accounts change skin on minecraft.net.')
    : acc.type === 'custom' ? L('Se sube a tu servidor de cuentas: la verán otros jugadores de ese servidor.', 'Uploaded to your account server: other players on it will see it.')
    : L('Se ve en tu juego (en tus instancias). Los demás jugadores no la verán salvo con Ely.by o tu propio servidor.', 'Shown in your game (all instances). Other players will not see it unless you use Ely.by or your own server.');
  return h('div', { class: 'page' },
    h('h1', null, L('Biblioteca de skins', 'Skin library')),
    h('div', { class: 'skin-layout' },
      h('div', null, search, grid),
      h('div', { class: 'card skin-side' }, skin3d(cur.data, skinSel.model),
        h('div', { class: 'sub', style: 'text-align:center' }, L('Arrastra para girar', 'Drag to rotate')),
        h('h2', null, cur.name), model, h('div', { class: 'actions' }, apply), msg,
        h('div', { class: 'sub' }, (acc ? acc.name + ': ' : '') + note))));
}

/* ---------- Paquetes de recursos ---------- */
const packSt = { name: null, files: [], list: [], filter: '' };
const TEX_PRESETS = [['item/diamond_sword', 'Espada de diamante'], ['item/diamond_pickaxe', 'Pico de diamante'], ['item/apple', 'Manzana'],
  ['item/netherite_helmet', 'Casco de netherite'], ['block/stone', 'Piedra'], ['block/dirt', 'Tierra'], ['block/grass_block_top', 'Césped (arriba)'],
  ['block/oak_planks', 'Tablones de roble'], ['block/glass', 'Cristal'], ['gui/title/background/panorama_0', 'Panorama del menú']];

function viewPacks() {
  const L = L2;
  const inst = selectedInstance();
  const root = h('div', { class: 'page' }, h('h1', null, L('Paquetes de recursos', 'Resource packs')));
  if (!inst) { root.append(h('p', { class: 'sub' }, L('Crea o elige una instancia primero.', 'Create or select an instance first.'))); return root; }
  const msg = h('div', { class: 'error' });
  const id = inst.id;
  const guard = (fn) => async (...a) => { msg.textContent = ''; try { await fn(...a); } catch (e) { msg.textContent = cleanError(e); } };
  const reload = async (keep) => {
    packSt.list = await api.pack_list(id);
    if (!keep || !packSt.list.some((p) => p.name === packSt.name)) packSt.name = packSt.list[0] ? packSt.list[0].name : null;
    packSt.files = packSt.name ? await api.pack_files({ id, name: packSt.name }) : [];
    render();
  };
  const body = h('div', { class: 'skin-layout', style: 'grid-template-columns:240px 1fr' });
  const listBox = h('div', { class: 'list' });
  const editor = h('div');
  const cur = () => packSt.list.find((p) => p.name === packSt.name);

  const newPack = () => {
    const n = h('input', { placeholder: L('Nombre del paquete', 'Pack name'), maxlength: 40 }), d = h('input', { placeholder: L('Descripción', 'Description') });
    openModal(h('h2', null, L('Nuevo paquete', 'New pack')), n, h('div', { style: 'height:8px' }), d,
      h('div', { class: 'actions' }, h('button', { onclick: closeModal }, L('Cancelar', 'Cancel')),
        h('button', { class: 'primary', onclick: guard(async () => { packSt.name = await api.pack_create({ id, name: n.value, desc: d.value }); closeModal(); await reload(true); }) }, L('Crear', 'Create'))));
  };

  for (const p of packSt.list) listBox.append(h('div', { class: 'row-item' + (p.name === packSt.name ? ' sel' : ''), style: 'cursor:pointer', onclick: async () => { packSt.name = p.name; await reload(true); } },
    p.iconUrl ? h('img', { src: p.iconUrl, style: 'width:28px;height:28px;image-rendering:pixelated;border-radius:4px' }) : ico('brush'),
    h('div', { class: 'grow' }, h('b', null, p.name), p.enabled ? h('span', { class: 'badge' }, L('activo', 'on')) : '')));
  if (!packSt.list.length) listBox.append(h('div', { class: 'empty' }, L('Aún no hay paquetes en esta instancia.', 'No packs in this instance yet.')));

  const p = cur();
  if (p) {
    const desc = h('input', { value: p.desc, maxlength: 120 });
    const target = h('input', { placeholder: 'item/diamond_sword', list: 'texlist' });
    const dl = h('datalist', { id: 'texlist' }, TEX_PRESETS.map(([v, l]) => h('option', { value: v }, l)));
    const q = h('input', { placeholder: L('Filtrar texturas…', 'Filter textures…'), value: packSt.filter, oninput: (e) => { packSt.filter = e.target.value; drawGrid(); } });
    const grid = h('div', { class: 'tex-grid' });
    const blankSize = h('select', { style: 'width:auto' }, [16, 32, 64, 128].map((s) => h('option', { value: s }, `${s}×${s}`)));
    const vres = h('div', { class: 'tex-list' });
    let vt = null;
    const vq = h('input', { placeholder: L('Buscar textura del juego…', 'Search game texture…'), oninput: (e) => {
      clearTimeout(vt);
      vt = setTimeout(guard(async () => {
        const q = e.target.value.trim();
        if (q.length < 2) { vres.replaceChildren(); return; }
        const names = await api.pack_vanillaSearch({ id, q });
        vres.replaceChildren(...names.map((n) => h('button', { class: 'sm', title: n, onclick: guard(async () => {
          const data = await api.pack_vanillaRead({ id, entry: n });
          openPainter({ title: n.replace('assets/minecraft/textures/', ''), src: data, onSave: async (png) => { await api.pack_saveTexture({ id, name: p.name, target: n, png: png.split(',')[1] }); await reload(true); } });
        }) }, n.replace('assets/minecraft/textures/', '').replace('.png', ''))));
        if (!names.length) vres.append(h('div', { class: 'empty' }, L('Sin resultados.', 'No results.')));
      }), 250);
    } });
    const openTex = (f) => openModal(h('h2', null, f.path.split('/').pop()), h('div', { class: 'sub' }, f.path),
      h('div', { class: 'tex-big' }, h('img', { src: f.url })),
      h('div', { class: 'actions' },
        h('button', { class: 'primary', onclick: guard(async () => {
          const data = await api.pack_readTexture({ id, name: p.name, rel: f.path });
          openPainter({ title: f.path.split('/').pop(), src: data, onSave: async (png) => { await api.pack_saveTexture({ id, name: p.name, target: f.path, png: png.split(',')[1] }); await reload(true); } });
        }) }, ico('brush'), L('Pintar', 'Paint')),
        h('button', { onclick: guard(async () => { if (await api.pack_putTexture({ id, name: p.name, target: f.path.replace(/^assets\/minecraft\/textures\//, '') .replace(/\.png$/, '') })) { closeModal(); await reload(true); } }) }, ico('upload'), L('Reemplazar', 'Replace')),
        h('button', { class: 'danger', onclick: guard(async () => { await api.pack_removeFile({ id, name: p.name, rel: f.path }); closeModal(); await reload(true); }) }, ico('trash'), L('Quitar', 'Remove')),
        h('button', { onclick: closeModal }, L('Cerrar', 'Close'))));
    function drawGrid() {
      const k = packSt.filter.toLowerCase();
      const fs_ = packSt.files.filter((f) => !k || f.path.toLowerCase().includes(k)).slice(0, 150);
      grid.replaceChildren(...fs_.map((f) => h('div', { class: 'tex', title: f.path, onclick: () => openTex(f) }, h('img', { src: f.url, loading: 'lazy' }), h('span', null, f.path.split('/').pop().replace('.png', '')))));
      if (!fs_.length) grid.append(h('div', { class: 'empty' }, L('Sin texturas todavía: añade la primera abajo.', 'No textures yet: add the first one below.')));
    }
    drawGrid();
    editor.append(h('div', { class: 'card' },
      h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, h('h2', { style: 'margin:0' }, p.name),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: p.enabled, onchange: guard(async (e) => { await api.pack_toggle({ id, name: p.name, on: e.target.checked }); await reload(true); }) }), ' ' + L('Usar en esta instancia', 'Use in this instance'))),
      h('label', null, L('Descripción', 'Description')),
      h('div', { style: 'display:flex;gap:8px' }, desc, h('button', { onclick: guard(async () => { await api.pack_setMeta({ id, name: p.name, desc: desc.value }); msg.style.color = 'var(--accent)'; msg.textContent = L('Guardado', 'Saved'); }) }, ico('check'), L('Guardar', 'Save'))),
      h('div', { class: 'actions' },
        h('button', { onclick: guard(async () => { if (await api.pack_setIcon({ id, name: p.name })) await reload(true); }) }, ico('image'), L('Icono del paquete', 'Pack icon')),
        h('button', { onclick: guard(async () => { await api.pack_export({ id, name: p.name }); }) }, ico('download'), L('Exportar .zip', 'Export .zip')),
        h('button', { class: 'danger', onclick: guard(async () => { await api.pack_delete({ id, name: p.name }); packSt.name = null; await reload(); }) }, ico('trash'), L('Eliminar', 'Delete')))),
      h('div', { class: 'card' }, h('label', null, L('Añadir o reemplazar una textura', 'Add or replace a texture')),
        h('div', { class: 'sub' }, L('Escribe la ruta dentro de textures/ (o elige una) y selecciona tu PNG. En versiones antiguas (≤1.20.x) los objetos están en "items/" y bloques en "blocks/".', 'Type the path inside textures/ (or pick one) and choose your PNG. In old versions (≤1.20.x) items use "items/" and blocks "blocks/".')),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, target, dl,
          h('button', { class: 'primary', onclick: guard(async () => { if (await api.pack_putTexture({ id, name: p.name, target: target.value })) await reload(true); }) }, ico('upload'), L('Elegir PNG', 'Choose PNG')),
          blankSize,
          h('button', { onclick: guard(async () => {
            if (!target.value.trim()) throw new Error(L('Escribe primero la ruta de la textura.', 'Type the texture path first.'));
            const t = target.value.trim();
            openPainter({ title: t, width: Number(blankSize.value), onSave: async (png) => { await api.pack_saveTexture({ id, name: p.name, target: t, png: png.split(',')[1] }); await reload(true); } });
          }) }, ico('brush'), L('Pintar nueva', 'Paint new')))),
      h('div', { class: 'card' }, h('label', null, L('Texturas originales del juego', 'Original game textures')),
        h('div', { class: 'sub' }, L('Busca una textura de Minecraft (por ejemplo "diamond_sword" o "stone"), píntala y se guarda en tu paquete.', 'Search a Minecraft texture (e.g. "diamond_sword" or "stone"), paint it and it is saved in your pack.')),
        vq, vres),
      h('div', { class: 'card' }, h('label', null, L(`Texturas (${packSt.files.length})`, `Textures (${packSt.files.length})`)), q, grid));
  } else editor.append(h('p', { class: 'sub' }, L('Crea un paquete nuevo o importa un .zip para empezar a editarlo.', 'Create a new pack or import a .zip to start editing.')));

  body.append(h('div', null,
    h('div', { class: 'actions', style: 'margin:0 0 8px' },
      h('button', { class: 'primary', onclick: newPack }, ico('plus'), L('Nuevo', 'New')),
      h('button', { onclick: guard(async () => { const r = await api.pack_import(id); if (r.length) packSt.name = r[0]; await reload(true); }) }, ico('upload'), L('Importar .zip', 'Import .zip')),
      h('button', { onclick: () => api.pack_openFolder(id) }, ico('folder'))),
    listBox), editor);
  root.append(h('p', { class: 'sub' }, L(`Instancia: ${inst.name} (${inst.version}). Los paquetes se guardan en su carpeta resourcepacks.`, `Instance: ${inst.name} (${inst.version}). Packs live in its resourcepacks folder.`)), body, msg);
  if (packSt.inst !== id) { packSt.inst = id; packSt.name = null; reload(); }
  return root;
}

/* ---------- Ajustes ---------- */
function viewSettings() {
  const tabs = h('div', { class: 'tabs' }, ['general', 'appearance', 'storage'].map((id) =>
    h('button', { class: state.settingsTab === id ? 'active' : '', onclick: () => { state.settingsTab = id; render(); } }, t(id))));
  const body = { general: settingsGeneral, appearance: settingsAppearance, storage: settingsStorage }[state.settingsTab]();
  return h('div', { class: 'page' }, h('h1', null, t('settings')), tabs, body);
}

function settingsGeneral() {
  const s = state.settings;
  const msg = h('div', { class: 'ok' });
  const lang = h('select', { value: s.lang, onchange: async (e) => { await persist({ lang: e.target.value }); render(); } },
    h('option', { value: 'es' }, 'Español'), h('option', { value: 'en' }, 'English'));
  const java = h('input', { value: s.javaPath || '', placeholder: 'java' });
  const dir = h('input', { value: s.dataDir });
  const auto = h('input', { type: 'checkbox' }); auto.checked = !!s.autoJava;
  const min = h('input', { type: 'checkbox' }); min.checked = !!s.minimizeOnLaunch;
  const perf = h('input', { type: 'checkbox' }); perf.checked = s.perfFlags !== false;
  return h('div', { class: 'card' },
    h('label', null, t('language')), lang,
    h('label', null, t('javaPath')), java,
    h('label', { class: 'check' }, auto, t('autoJava')),
    h('label', { class: 'check' }, min, t('minimize')),
    h('label', { class: 'check' }, perf, t('perfFlags')),
    h('label', null, t('dataDir')), dir,
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: async () => {
        await persist({ javaPath: java.value.trim(), dataDir: dir.value.trim() || s.dataDir, autoJava: auto.checked, minimizeOnLaunch: min.checked, perfFlags: perf.checked });
        msg.textContent = t('saved');
      } }, t('save')),
      h('button', { onclick: () => api.openDataDir() }, t('openDir')),
      h('button', { onclick: () => startWizard() }, L2('Asistente de bienvenida', 'Welcome wizard'))),
    msg,
    h('p', { class: 'sub', style: 'margin-top:14px' }, `Alqan Launcher v${state.appVersion} · MIT`),
    h('button', { class: 'sm', onclick: () => api.openExternal('https://github.com/cieloclarollutuv-prog/Alqan-launcher') }, 'GitHub'));
}

const L2 = (es, en) => (state.settings.lang === 'en' ? en : es);
function settingsAppearance() {
  const th = state.settings.theme;
  const save = () => persist({ theme: th });
  const names = { dark: 'pDark', light: 'pLight', amoled: 'pAmoled', ocean: 'pOcean', forest: 'pForest' };

  const presetBtns = Object.keys(PRESETS).map((p) => h('button', {
    class: th.preset === p ? 'primary' : '',
    onclick: async () => { th.preset = p; th.colors = { ...PRESETS[p] }; await save(); render(); }
  }, t(names[p])));

  const picker = (key, label) => h('div', { class: 'colorpick' },
    h('input', { type: 'color', value: th.colors[key], oninput: (e) => { th.colors[key] = e.target.value; th.preset = 'custom'; applyTheme(); },
      onchange: save }), label);

  const slider = (key, label, min, max, step, fmt) => {
    const out = h('b', null, fmt(th[key]));
    return [h('label', null, label + ': ', out),
      h('input', { type: 'range', min, max, step, value: th[key], oninput: (e) => { th[key] = Number(e.target.value); out.textContent = fmt(th[key]); applyTheme(); }, onchange: save })];
  };

  return h('div', { class: 'card' },
    h('label', null, t('presets') + (th.preset === 'custom' ? ` (${t('pCustom')})` : '')),
    h('div', { class: 'actions', style: 'margin:0 0 10px' }, presetBtns),
    h('div', { class: 'swatches' }, picker('bg', t('cBg')), picker('panel', t('cPanel')), picker('text', t('cText')), picker('accent', t('cAccent'))),
    slider('radius', t('radius'), 0, 22, 1, (v) => v + ' px'),
    slider('fontScale', L2('Tamaño del texto', 'Text size'), 85, 125, 5, (v) => v + '%'),
    slider('iconWeight', L2('Grosor de iconos', 'Icon weight'), 1, 3, 0.25, (v) => v),
    h('label', null, L2('Tipografía', 'Font')),
    h('select', { onchange: (e) => { th.font = e.target.value; applyTheme(); save(); } },
      ['system', 'rounded', 'serif', 'mono'].map((f) => h('option', { value: f, selected: th.font === f }, { system: 'Sistema', rounded: 'Redondeada', serif: 'Serif', mono: 'Mono' }[f]))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!th.iconAccent, onchange: (e) => { th.iconAccent = e.target.checked; applyTheme(); save(); } }), ' ' + L2('Iconos con color de acento', 'Accent-colored icons')),
    h('label', null, t('bgImage')),
    h('div', { class: 'actions', style: 'margin-top:0' },
      h('button', { onclick: async () => { const url = await api.pickBgImage(); if (url) { th.bgImage = url; await save(); render(); } } }, t('pickImage')),
      th.bgImage && h('button', { class: 'danger', onclick: async () => { th.bgImage = ''; await save(); render(); } }, t('removeImage'))),
    th.bgImage && slider('dim', t('dim'), 0, 1, 0.05, (v) => Math.round(v * 100) + '%'),
    th.bgImage && slider('blur', t('blur'), 0, 20, 1, (v) => v + ' px'));
}

function settingsStorage() {
  return h('div', null,
    h('p', { class: 'sub' }, t('storageSub')),
    h('div', { class: 'list', id: 'storageList' }, h('div', { class: 'empty' }, t('calculating'))),
    h('div', { class: 'actions' }, h('button', { onclick: () => loadStorage() }, t('refresh'))));
}

async function loadStorage() {
  const box = $('#storageList');
  if (!box) return;
  const items = await api.storageList();
  const kinds = { version: 'kVersion', instance: 'kInstance', java: 'kJava', shared: 'kShared' };
  const total = items.reduce((n, i) => n + i.size, 0);
  box.replaceChildren(...items.map((i) => h('div', { class: 'row-item' },
    h('div', { class: 'grow' }, h('b', null, i.label), h('span', { class: 'badge' }, t(kinds[i.kind])), i.inUse ? h('span', { class: 'badge' }, t('inUse')) : null),
    h('span', { class: 'sub', style: 'margin:0' }, fmtSize(i.size)),
    h('button', { class: 'danger sm', onclick: async () => {
      if (!confirm(t('confirmFree'))) return;
      await api.storageDelete({ kind: i.kind, id: i.id });
      if (i.kind === 'instance') { const init = await api.init(); state.instances = init.instances; }
      loadStorage();
    } }, t('delete'))),
  ), h('div', { class: 'empty' }, `${t('total')}: ${fmtSize(total)}`));
}

/* ---------- Arranque ---------- */
async function boot() {
  const data = await api.init();
  Object.assign(state, { settings: data.settings, instances: data.instances, accounts: data.accounts, appVersion: data.appVersion });
  document.documentElement.lang = state.settings.lang;

  // Primer uso: cuenta e instancia por defecto para poder jugar enseguida
  const firstRun = !state.settings.setupDone && !state.accounts.length;
  if (!state.accounts.length) {
    state.accounts = await api.addOffline('Player');
    await persist({ selectedAccount: state.accounts[0].id });
  }
  if (!state.instances.length) {
    await loadVersions();
    if (state.versions.length) {
      state.instances = await api.saveInstance({ name: 'Minecraft', version: state.versions[0].id, loader: 'vanilla', ram: 4, jvmArgs: '' });
      await persist({ selectedInstance: state.instances[0].id });
    }
  }
  render();
  if (firstRun) startWizard();
}

boot();
