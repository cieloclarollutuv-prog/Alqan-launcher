/* Editor de skins y asistente de primer inicio (usa los helpers de renderer.js) */

/* ---------- Editor de skins ---------- */
const ED = { cv: null, ctx: null, tool: 'pencil', color: '#7c6cf0', zoom: 6, grid: true, guide: true, undo: [], redo: [], last: null, down: false, name: 'Mi skin', model: 'default', timer: null, prev: null, disp: null, msg: null };
const ED_PALETTE = ['#000000', '#3a3a44', '#7d7d8a', '#ffffff', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#e84393', '#f1c9a5', '#d9a77c', '#8a5a2b', '#5a3b1e'];
const ED_PARTS = [['Cabeza', 0, 0, 8, 8, 8], ['Cuerpo', 16, 16, 8, 12, 4], ['Brazo D', 40, 16, 4, 12, 4], ['Brazo I', 32, 48, 4, 12, 4], ['Pierna D', 0, 16, 4, 12, 4], ['Pierna I', 16, 48, 4, 12, 4],
  ['Sombrero', 32, 0, 8, 8, 8], ['Chaqueta', 16, 32, 8, 12, 4], ['Manga D', 40, 32, 4, 12, 4], ['Manga I', 48, 48, 4, 12, 4], ['Pantalón D', 0, 32, 4, 12, 4], ['Pantalón I', 0, 48, 4, 12, 4]];

const edRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const edHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

function edInit() {
  if (ED.cv) return;
  ED.cv = document.createElement('canvas'); ED.cv.width = ED.cv.height = 64;
  ED.ctx = ED.cv.getContext('2d', { willReadFrequently: true });
  const lib = window.SKIN_LIB || [];
  if (lib[0]) edLoadSrc(lib[0].data, lib[0].model === 'slim' ? 'slim' : 'default', false);
}

function edLoadSrc(src, model, keepName) {
  const img = new Image();
  img.onload = () => {
    ED.ctx.clearRect(0, 0, 64, 64);
    ED.ctx.drawImage(img, 0, 0);
    if (img.height === 32) { // formato antiguo 64x32: se completan brazo y pierna izquierdos
      for (const [sx, sy, dx, dy] of [[0, 16, 16, 48], [40, 16, 32, 48]]) {
        const part = ED.ctx.getImageData(sx, sy, 16, 16), out = ED.ctx.createImageData(16, 16);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) for (let c = 0; c < 4; c++) out.data[(y * 16 + x) * 4 + c] = part.data[(y * 16 + (15 - x)) * 4 + c];
        ED.ctx.putImageData(out, dx, dy);
      }
    }
    if (model) ED.model = model;
    ED.undo = []; ED.redo = [];
    edRedraw(); edPreviewNow();
  };
  img.onerror = () => { if (ED.msg) ED.msg.textContent = 'Imagen no válida'; };
  img.src = src;
}

function edSnap() { ED.undo.push(ED.ctx.getImageData(0, 0, 64, 64)); if (ED.undo.length > 50) ED.undo.shift(); ED.redo = []; }
function edStep(from, to) {
  if (!from.length) return;
  to.push(ED.ctx.getImageData(0, 0, 64, 64));
  ED.ctx.putImageData(from.pop(), 0, 0);
  edRedraw(); edPreviewSoon();
}

function edRedraw() {
  const d = ED.disp; if (!d) return;
  const z = ED.zoom, c = d.getContext('2d');
  d.width = d.height = 64 * z;
  c.imageSmoothingEnabled = false;
  c.drawImage(ED.cv, 0, 0, 64 * z, 64 * z);
  if (ED.grid && z >= 6) {
    c.strokeStyle = 'rgba(128,128,128,.18)'; c.lineWidth = 1; c.beginPath();
    for (let i = 1; i < 64; i++) { c.moveTo(i * z + .5, 0); c.lineTo(i * z + .5, 64 * z); c.moveTo(0, i * z + .5); c.lineTo(64 * z, i * z + .5); }
    c.stroke();
  }
  if (ED.guide) {
    c.font = '10px sans-serif';
    ED_PARTS.forEach(([name, x0, y0, w, h_, dd], i) => {
      const outer = i >= 6;
      c.strokeStyle = outer ? 'rgba(124,108,240,.85)' : 'rgba(255,255,255,.55)'; c.lineWidth = 1;
      for (const [fx, fy, fw, fh] of [[x0 + dd, y0, w, dd], [x0 + dd + w, y0, w, dd], [x0, y0 + dd, dd, h_], [x0 + dd, y0 + dd, w, h_], [x0 + dd + w, y0 + dd, dd, h_], [x0 + 2 * dd + w, y0 + dd, w, h_]]) c.strokeRect(fx * z + .5, fy * z + .5, fw * z, fh * z);
      c.fillStyle = outer ? 'rgba(180,170,255,.95)' : 'rgba(255,255,255,.8)';
      c.fillText(name, (x0 + dd) * z + 3, (y0 + dd) * z + 11);
    });
  }
}

function edPreviewNow() {
  if (!ED.prev) return;
  ED.prev.replaceChildren(skin3d(ED.cv.toDataURL('image/png'), ED.model));
}
function edPreviewSoon() { clearTimeout(ED.timer); ED.timer = setTimeout(edPreviewNow, 160); }

function edAt(e) {
  const r = ED.disp.getBoundingClientRect();
  return [Math.min(63, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 64))), Math.min(63, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * 64)))];
}

function edFill(x, y) {
  const img = ED.ctx.getImageData(0, 0, 64, 64), d = img.data;
  const at = (px, py) => (py * 64 + px) * 4;
  const [tr, tg, tb, ta] = [d[at(x, y)], d[at(x, y) + 1], d[at(x, y) + 2], d[at(x, y) + 3]];
  const [r, g, b] = edRgb(ED.color);
  if (ta === 255 && tr === r && tg === g && tb === b) return;
  const same = (i) => d[i] === tr && d[i + 1] === tg && d[i + 2] === tb && d[i + 3] === ta;
  const st = [[x, y]];
  while (st.length) {
    const [px, py] = st.pop();
    if (px < 0 || py < 0 || px > 63 || py > 63) continue;
    const i = at(px, py);
    if (!same(i)) continue;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  ED.ctx.putImageData(img, 0, 0);
}

function edPaint(x, y) {
  const t = ED.tool, ctx = ED.ctx;
  if (t === 'pencil') { ctx.fillStyle = ED.color; ctx.fillRect(x, y, 1, 1); }
  else if (t === 'eraser') ctx.clearRect(x, y, 1, 1);
  else if (t === 'fill') edFill(x, y);
  else if (t === 'picker') {
    const p = ctx.getImageData(x, y, 1, 1).data;
    if (p[3]) { ED.color = edHex(p[0], p[1], p[2]); const ci = document.getElementById('edColor'); if (ci) ci.value = ED.color; }
  } else if (t === 'light' || t === 'dark') {
    const p = ctx.getImageData(x, y, 1, 1), k = t === 'light' ? 14 : -14;
    if (!p.data[3]) return;
    for (let i = 0; i < 3; i++) p.data[i] = Math.max(0, Math.min(255, p.data[i] + k));
    ctx.putImageData(p, x, y);
  }
}

function edStroke(x0, y0, x1, y1) { // línea de Bresenham para no dejar huecos
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    edPaint(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function edDownload() {
  const a = document.createElement('a');
  a.href = ED.cv.toDataURL('image/png');
  a.download = (ED.name || 'skin').replace(/[^\w.-]+/g, '_') + '.png';
  document.body.append(a); a.click(); a.remove();
}

function viewSkinEditor() {
  edInit();
  const L = L2;
  const acc = selectedAccount();
  const page = h('div', { class: 'page' }, h('h1', null, L('Editor de skins', 'Skin editor')));
  ED.msg = h('div', { class: 'error' });
  const say = (text, ok) => { ED.msg.style.color = ok ? 'var(--accent)' : ''; ED.msg.textContent = text; };

  const disp = h('canvas', { class: 'ed-canvas' });
  ED.disp = disp;
  disp.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const [x, y] = edAt(e);
    if (ED.tool !== 'picker') edSnap();
    ED.down = true; ED.last = [x, y];
    edPaint(x, y); edRedraw();
  });
  disp.addEventListener('mousemove', (e) => {
    if (!ED.down || ED.tool === 'fill' || ED.tool === 'picker') return;
    const [x, y] = edAt(e);
    edStroke(ED.last[0], ED.last[1], x, y); ED.last = [x, y]; edRedraw();
  });
  const end = () => { if (ED.down) { ED.down = false; edPreviewSoon(); } };
  disp.addEventListener('mouseup', end); disp.addEventListener('mouseleave', end);
  disp.addEventListener('contextmenu', (e) => e.preventDefault());

  const tools = [['pencil', L('Lápiz', 'Pencil')], ['eraser', L('Borrador', 'Eraser')], ['fill', L('Relleno', 'Fill')], ['picker', L('Gotero', 'Picker')], ['light', L('Aclarar', 'Lighten')], ['dark', L('Oscurecer', 'Darken')]];
  const toolBtns = tools.map(([id, label]) => h('button', { class: ED.tool === id ? 'primary' : '', onclick: () => { ED.tool = id; render(); } }, label));

  const color = h('input', { type: 'color', id: 'edColor', value: ED.color, oninput: (e) => { ED.color = e.target.value; if (ED.tool !== 'pencil' && ED.tool !== 'fill') { ED.tool = 'pencil'; render(); } } });
  const swatches = ED_PALETTE.map((c) => h('button', { class: 'sw', style: `background:${c}`, title: c, onclick: () => { ED.color = c; color.value = c; if (ED.tool === 'eraser' || ED.tool === 'picker') { ED.tool = 'pencil'; render(); } } }));

  const zoom = h('select', { style: 'width:auto', onchange: (e) => { ED.zoom = Number(e.target.value); edRedraw(); } }, [4, 6, 8].map((z) => h('option', { value: z, selected: ED.zoom === z }, `${z * 100 / 4}%`)));
  const file = h('input', { type: 'file', accept: 'image/png', style: 'display:none', onchange: (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const im = new Image();
      im.onload = () => { if (im.width !== 64 || (im.height !== 64 && im.height !== 32)) say(L('La skin debe ser un PNG de 64x64 (o 64x32).', 'Skin must be a 64x64 (or 64x32) PNG.')); else { say(''); edLoadSrc(rd.result, null, true); } };
      im.src = rd.result;
    };
    rd.readAsDataURL(f); e.target.value = '';
  } });
  const lib = window.SKIN_LIB || [];
  const tmpl = h('select', { onchange: (e) => {
    const s = lib.find((x) => x.id === e.target.value); e.target.value = '';
    if (s) { edLoadSrc(s.data, s.model === 'slim' ? 'slim' : 'default', false); ED.name = s.name + ' 2'; render(); }
  } }, h('option', { value: '' }, L('Empezar desde…', 'Start from…')), lib.map((s) => h('option', { value: s.id }, s.name)));

  const name = h('input', { value: ED.name, maxlength: 30, placeholder: L('Nombre de tu skin', 'Skin name'), oninput: (e) => { ED.name = e.target.value; } });
  const model = h('select', { onchange: (e) => { ED.model = e.target.value; edPreviewNow(); } },
    h('option', { value: 'default', selected: ED.model === 'default' }, 'Steve (4px)'), h('option', { value: 'slim', selected: ED.model === 'slim' }, 'Alex (3px)'));

  const mine = state.settings.mySkins || [];
  const apply = h('button', { class: 'primary', disabled: !acc || acc.type === 'microsoft', onclick: async () => {
    try { state.accounts = await api.applySkin({ id: acc.id, png: ED.cv.toDataURL('image/png').split(',')[1], model: ED.model }); say(L('¡Skin aplicada!', 'Skin applied!'), true); }
    catch (e) { say(cleanError(e)); }
  } }, L('Usar esta skin', 'Use this skin'));
  const save = h('button', { onclick: async () => {
    const list = [...(state.settings.mySkins || [])];
    if (list.length >= 30) { say(L('Máximo 30 skins guardadas.', 'Maximum 30 saved skins.')); return; }
    list.push({ id: 'm' + Date.now(), name: (ED.name || 'Mi skin').trim() || 'Mi skin', model: ED.model, data: ED.cv.toDataURL('image/png') });
    await persist({ mySkins: list }); say(L('Guardada en Mis skins.', 'Saved to My skins.'), true); render();
  } }, ico('check'), L('Guardar', 'Save'));

  const mineGrid = h('div', { class: 'skin-grid' }, mine.map((s) => h('div', { class: 'skin-card', onclick: () => { ED.name = s.name; edLoadSrc(s.data, s.model, true); render(); } },
    h('div', { class: 'skin-face', style: `background:url(${s.data}) -40px -40px/320px 320px,url(${s.data}) -200px -40px/320px 320px` }),
    h('div', null, s.name),
    h('button', { class: 'sm danger', title: L('Borrar', 'Delete'), onclick: async (e) => { e.stopPropagation(); await persist({ mySkins: mine.filter((x) => x.id !== s.id) }); render(); } }, '×'))));

  ED.prev = h('div');
  setTimeout(() => { edRedraw(); edPreviewNow(); });

  page.append(h('div', { class: 'ed-layout' },
    h('div', null,
      h('div', { class: 'actions', style: 'margin:0 0 8px' }, toolBtns),
      h('div', { class: 'ed-colors' }, color, swatches),
      h('div', { class: 'actions', style: 'margin:8px 0' },
        h('button', { onclick: () => edStep(ED.undo, ED.redo) }, L('Deshacer', 'Undo')), h('button', { onclick: () => edStep(ED.redo, ED.undo) }, L('Rehacer', 'Redo')),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ED.guide, onchange: (e) => { ED.guide = e.target.checked; edRedraw(); } }), L('Guía', 'Guide')),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ED.grid, onchange: (e) => { ED.grid = e.target.checked; edRedraw(); } }), L('Cuadrícula', 'Grid')), zoom),
      h('div', { class: 'ed-wrap' }, disp),
      h('div', { class: 'sub' }, L('Blanco: capa base · Violeta: capa exterior (sombrero, chaqueta, mangas, pantalón).', 'White: base layer · Purple: outer layer (hat, jacket, sleeves, pants).'))),
    h('div', { class: 'card skin-side' }, ED.prev,
      h('div', { class: 'sub', style: 'text-align:center' }, L('Arrastra para girar', 'Drag to rotate')),
      name, model, tmpl,
      h('div', { class: 'actions' }, apply, save),
      h('div', { class: 'actions', style: 'margin-top:0' },
        h('button', { onclick: () => file.click() }, ico('upload'), L('Importar PNG', 'Import PNG')), h('button', { onclick: edDownload }, ico('download'), 'PNG'),
        h('button', { class: 'danger', onclick: () => { edSnap(); ED.ctx.clearRect(0, 0, 64, 64); edRedraw(); edPreviewNow(); } }, L('Vaciar', 'Clear'))),
      file, ED.msg)),
    h('h2', null, L('Mis skins', 'My skins')),
    mine.length ? mineGrid : h('div', { class: 'empty' }, L('Aún no guardaste ninguna.', 'Nothing saved yet.')));
  return page;
}

/* ---------- Asistente de primer inicio ---------- */
const WZ = { step: 0, name: '', ram: 4 };
const WZ_STEPS = 5;

function startWizard() {
  const a = selectedAccount();
  WZ.step = 0; WZ.name = a && a.type === 'offline' && a.name !== 'Player' ? a.name : '';
  const i = selectedInstance(); WZ.ram = (i && i.ram) || 4;
  wizardRender();
}

async function wizardFinish() {
  await persist({ setupDone: true });
  $('#modalRoot').replaceChildren();
  state.tab = 'instances'; render();
}

function wizardRender() {
  const L = L2, th = state.settings.theme;
  const err = h('div', { class: 'error' });
  const body = h('div');
  const next = async () => {
    err.textContent = '';
    try {
      if (WZ.step === 2) {
        const acc = selectedAccount(), n = WZ.name.trim();
        if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) throw new Error(L('El nombre debe tener de 3 a 16 caracteres (letras, números o _).', 'Name must be 3-16 characters (letters, numbers or _).'));
        if (!acc || acc.name !== n) {
          if (acc && acc.type === 'offline') await api.deleteAccount(acc.id);
          state.accounts = await api.addOffline(n);
          await persist({ selectedAccount: state.accounts[state.accounts.length - 1].id });
        }
      }
      if (WZ.step === 3) {
        const i = selectedInstance();
        if (i) state.instances = await api.saveInstance({ ...i, ram: WZ.ram });
      }
      if (WZ.step >= WZ_STEPS - 1) return wizardFinish();
      WZ.step++; render(); wizardRender();
    } catch (e) { err.textContent = cleanError(e); }
  };

  if (WZ.step === 0) {
    body.append(h('img', { src: 'logo.png', alt: '', style: 'width:84px;height:84px;display:block;margin:0 auto 10px' }),
      h('h2', { style: 'text-align:center' }, L('¡Bienvenido a Alqan!', 'Welcome to Alqan!')),
      h('p', { class: 'sub', style: 'text-align:center' }, L('Vamos a dejar el launcher a tu gusto en un minuto. Primero, elige tu idioma.', 'Let’s set the launcher up in a minute. First, pick your language.')),
      h('div', { class: 'wz-choices', style: 'justify-content:center' }, [['es', 'Español'], ['en', 'English']].map(([id, label]) =>
        h('button', { class: state.settings.lang === id ? 'primary' : '', onclick: async () => { await persist({ lang: id }); document.documentElement.lang = id; render(); wizardRender(); } }, label))));
  } else if (WZ.step === 1) {
    const names = { dark: 'pDark', light: 'pLight', amoled: 'pAmoled', ocean: 'pOcean', forest: 'pForest' };
    body.append(h('h2', null, L('Elige tu aspecto', 'Pick your look')),
      h('div', { class: 'wz-choices' }, Object.keys(PRESETS).map((p) => h('button', { class: th.preset === p ? 'primary' : '', onclick: async () => { th.preset = p; th.colors = { ...PRESETS[p] }; await persist({ theme: th }); applyTheme(); wizardRender(); } }, t(names[p])))),
      h('label', null, L('Color de acento', 'Accent color')),
      h('input', { type: 'color', value: th.colors.accent, oninput: (e) => { th.colors.accent = e.target.value; th.preset = 'custom'; applyTheme(); }, onchange: () => persist({ theme: th }) }),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!th.iconAccent, onchange: (e) => { th.iconAccent = e.target.checked; applyTheme(); persist({ theme: th }); } }), L('Iconos con color de acento', 'Accent-colored icons')),
      h('div', { class: 'sub' }, L('Más opciones (imagen de fondo, tipografía, iconos) en Ajustes → Apariencia.', 'More options (background image, font, icons) in Settings → Appearance.')));
  } else if (WZ.step === 2) {
    const nm = h('input', { value: WZ.name, maxlength: 16, placeholder: L('Tu nombre en el juego', 'Your in-game name'), oninput: (e) => { WZ.name = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') next(); } });
    body.append(h('h2', null, L('Tu cuenta', 'Your account')), h('p', { class: 'sub' }, L('Este será tu nombre de jugador (cuenta no premium). Después puedes añadir cuentas Microsoft, Ely.by o de tu propio servidor en la pestaña de cuenta.', 'This is your player name (non-premium account). You can add Microsoft, Ely.by or your own server account later from the account tab.')), nm);
    setTimeout(() => nm.focus());
  } else if (WZ.step === 3) {
    const out = h('b', null, WZ.ram + ' GB');
    body.append(h('h2', null, L('Rendimiento', 'Performance')),
      h('label', null, L('Memoria RAM para el juego: ', 'RAM for the game: '), out),
      h('input', { type: 'range', min: 2, max: 16, step: 1, value: WZ.ram, oninput: (e) => { WZ.ram = Number(e.target.value); out.textContent = WZ.ram + ' GB'; } }),
      h('div', { class: 'sub' }, L('Recomendado: 4 GB (2-3 GB si tu equipo tiene 8 GB o menos). Nunca se usa más del 75 % de tu memoria.', 'Recommended: 4 GB (2-3 GB if your PC has 8 GB or less). Never more than 75% of your memory is used.')),
      ...[['autoJava', L('Descargar Java automáticamente', 'Download Java automatically')], ['perfFlags', L('Optimización de Java (más fluidez)', 'Java optimization (smoother)')], ['minimizeOnLaunch', L('Minimizar el launcher al jugar', 'Minimize the launcher while playing')]].map(([key, label]) =>
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: state.settings[key] !== false && !!state.settings[key], onchange: async (e) => { await persist({ [key]: e.target.checked }); } }), label)));
  } else {
    body.append(h('h2', null, L('¡Todo listo!', 'All set!')),
      h('p', { class: 'sub' }, L('Algunas ideas para empezar:', 'A few ideas to get started:')),
      h('ul', { class: 'wz-list' },
        h('li', null, L('Explorar → instala un modpack como Fabulously Optimized con un clic.', 'Explore → install a modpack like Fabulously Optimized in one click.')),
        h('li', null, L('Skins → elige una de la biblioteca o crea la tuya en el editor.', 'Skins → pick one from the library or make your own in the editor.')),
        h('li', null, L('Paquetes → crea o edita tus paquetes de texturas.', 'Packs → create or edit your texture packs.')),
        h('li', null, L('Ajustes → colores, fondo, tipografía y más. Puedes repetir este asistente allí.', 'Settings → colors, background, font and more. You can rerun this wizard there.'))));
  }

  const dots = h('div', { class: 'wz-dots' }, Array.from({ length: WZ_STEPS }, (_, i) => h('span', { class: 'wz-dot' + (i === WZ.step ? ' on' : '') })));
  $('#modalRoot').replaceChildren(h('div', { class: 'modal-bg' }, h('div', { class: 'modal wizard' }, dots, body, err,
    h('div', { class: 'actions' },
      WZ.step > 0 && h('button', { onclick: () => { WZ.step--; wizardRender(); } }, L('Atrás', 'Back')),
      h('div', { class: 'grow' }),
      WZ.step < WZ_STEPS - 1 && h('button', { onclick: wizardFinish }, L('Saltar', 'Skip')),
      h('button', { class: 'primary', onclick: next }, WZ.step >= WZ_STEPS - 1 ? L('Empezar', 'Start') : L('Siguiente', 'Next'))))));
}

/* ---------- Pintor de texturas (paquetes de recursos) ---------- */
// opts: { title, src?, width?, height?, onSave(dataUrl) }
function openPainter(opts) {
  const L = L2;
  const P = { cv: document.createElement('canvas'), tool: 'pencil', color: '#7c6cf0', size: 1, grid: true, undo: [], redo: [], down: false, last: null, z: 8 };
  const ctx = P.cv.getContext('2d', { willReadFrequently: true });
  const msg = h('div', { class: 'error' });
  const disp = h('canvas', { class: 'ed-canvas' });
  const tile = h('div', { class: 'tile-prev', title: L('Así se ve repetida (como en el juego)', 'How it tiles in game') });
  const stage = h('div', { class: 'ed-wrap' }, disp);
  const info = h('span', { class: 'sub' });

  const fit = () => { P.z = Math.max(1, Math.floor(440 / Math.max(P.cv.width, P.cv.height))); };
  const redraw = () => {
    const z = P.z, w = P.cv.width, hh = P.cv.height;
    disp.width = w * z; disp.height = hh * z;
    const c = disp.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(P.cv, 0, 0, w * z, hh * z);
    if (P.grid && z >= 6) {
      c.strokeStyle = 'rgba(128,128,128,.2)'; c.beginPath();
      for (let i = 1; i < w; i++) { c.moveTo(i * z + .5, 0); c.lineTo(i * z + .5, hh * z); }
      for (let j = 1; j < hh; j++) { c.moveTo(0, j * z + .5); c.lineTo(w * z, j * z + .5); }
      c.stroke();
    }
    info.textContent = `${w}×${hh}px`;
  };
  const preview = () => { const u = P.cv.toDataURL('image/png'), s = Math.max(32, Math.min(64, P.cv.width * 2)); tile.style.backgroundImage = `url(${u})`; tile.style.backgroundSize = `${s}px ${s * P.cv.height / P.cv.width}px`; };
  const snap = () => { P.undo.push(ctx.getImageData(0, 0, P.cv.width, P.cv.height)); if (P.undo.length > 40) P.undo.shift(); P.redo = []; };
  const step = (from, to) => { if (!from.length) return; to.push(ctx.getImageData(0, 0, P.cv.width, P.cv.height)); ctx.putImageData(from.pop(), 0, 0); redraw(); preview(); };
  const at = (e) => { const r = disp.getBoundingClientRect(); return [Math.min(P.cv.width - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * P.cv.width))), Math.min(P.cv.height - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * P.cv.height)))]; };

  const fill = (x, y) => {
    const W = P.cv.width, H = P.cv.height, img = ctx.getImageData(0, 0, W, H), d = img.data, i0 = (y * W + x) * 4;
    const [tr, tg, tb, ta] = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]], [r, g, b] = edRgb(P.color);
    if (ta === 255 && tr === r && tg === g && tb === b) return;
    const st = [[x, y]];
    while (st.length) {
      const [px, py] = st.pop();
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = (py * W + px) * 4;
      if (d[i] !== tr || d[i + 1] !== tg || d[i + 2] !== tb || d[i + 3] !== ta) continue;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    ctx.putImageData(img, 0, 0);
  };
  const dab = (x, y) => {
    const s = P.size, x0 = x - Math.floor(s / 2), y0 = y - Math.floor(s / 2);
    if (P.tool === 'pencil') { ctx.fillStyle = P.color; ctx.fillRect(x0, y0, s, s); }
    else if (P.tool === 'eraser') ctx.clearRect(x0, y0, s, s);
    else if (P.tool === 'fill') fill(x, y);
    else if (P.tool === 'picker') {
      const p = ctx.getImageData(x, y, 1, 1).data;
      if (p[3]) { P.color = edHex(p[0], p[1], p[2]); colorIn.value = P.color; }
    } else {
      const sx = Math.max(0, x0), sy = Math.max(0, y0), w = Math.min(P.cv.width - sx, s), hh = Math.min(P.cv.height - sy, s);
      if (w < 1 || hh < 1) return;
      const img = ctx.getImageData(sx, sy, w, hh), k = P.tool === 'light' ? 14 : -14;
      for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) for (let c = 0; c < 3; c++) img.data[i + c] = Math.max(0, Math.min(255, img.data[i + c] + k));
      ctx.putImageData(img, sx, sy);
    }
  };
  const line = (x0, y0, x1, y1) => {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { dab(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  };
  disp.addEventListener('mousedown', (e) => { if (e.button !== 0) return; const [x, y] = at(e); if (P.tool !== 'picker') snap(); P.down = true; P.last = [x, y]; dab(x, y); redraw(); });
  disp.addEventListener('mousemove', (e) => { if (!P.down || P.tool === 'fill' || P.tool === 'picker') return; const [x, y] = at(e); line(P.last[0], P.last[1], x, y); P.last = [x, y]; redraw(); });
  const up = () => { if (P.down) { P.down = false; preview(); } };
  disp.addEventListener('mouseup', up); disp.addEventListener('mouseleave', up);

  const flip = (horizontal) => {
    snap();
    const w = P.cv.width, hh = P.cv.height, t = document.createElement('canvas'); t.width = w; t.height = hh;
    t.getContext('2d').drawImage(P.cv, 0, 0); ctx.clearRect(0, 0, w, hh); ctx.save();
    if (horizontal) { ctx.translate(w, 0); ctx.scale(-1, 1); } else { ctx.translate(0, hh); ctx.scale(1, -1); }
    ctx.drawImage(t, 0, 0); ctx.restore(); redraw(); preview();
  };

  const colorIn = h('input', { type: 'color', value: P.color, oninput: (e) => { P.color = e.target.value; if (P.tool === 'eraser' || P.tool === 'picker') { P.tool = 'pencil'; draw(); } } });
  const toolsBox = h('div', { class: 'actions', style: 'margin:0 0 8px' });
  const draw = () => {
    toolsBox.replaceChildren(...[['pencil', L('Lápiz', 'Pencil')], ['eraser', L('Borrador', 'Eraser')], ['fill', L('Relleno', 'Fill')], ['picker', L('Gotero', 'Picker')], ['light', L('Aclarar', 'Lighten')], ['dark', L('Oscurecer', 'Darken')]]
      .map(([id, label]) => h('button', { class: P.tool === id ? 'primary' : '', onclick: () => { P.tool = id; draw(); } }, label)));
  };
  const sw = ED_PALETTE.map((c) => h('button', { class: 'sw', style: `background:${c}`, title: c, onclick: () => { P.color = c; colorIn.value = c; if (P.tool === 'eraser' || P.tool === 'picker') { P.tool = 'pencil'; draw(); } } }));
  const sizeSel = h('select', { style: 'width:auto', title: L('Tamaño del pincel', 'Brush size'), onchange: (e) => { P.size = Number(e.target.value); } }, [1, 2, 3, 4].map((s) => h('option', { value: s }, `${L('Pincel', 'Brush')} ${s}`)));
  const zoomSel = h('select', { style: 'width:auto', onchange: (e) => { P.z = Number(e.target.value); redraw(); } });
  const gridCb = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { P.grid = e.target.checked; redraw(); } }), L('Cuadrícula', 'Grid'));

  const close = () => $('#modalRoot').replaceChildren();
  const ready = () => {
    fit();
    zoomSel.replaceChildren(...[...new Set([Math.max(1, Math.floor(P.z / 2)), P.z, P.z * 2])].map((z) => h('option', { value: z, selected: z === P.z }, `${z}x`)));
    draw(); redraw(); preview();
  };

  $('#modalRoot').replaceChildren(h('div', { class: 'modal-bg' }, h('div', { class: 'modal paint' },
    h('h2', null, opts.title || L('Pintar textura', 'Paint texture')),
    toolsBox,
    h('div', { class: 'ed-colors' }, colorIn, sw, sizeSel),
    h('div', { class: 'actions', style: 'margin:8px 0' },
      h('button', { onclick: () => step(P.undo, P.redo) }, L('Deshacer', 'Undo')), h('button', { onclick: () => step(P.redo, P.undo) }, L('Rehacer', 'Redo')),
      h('button', { onclick: () => flip(true) }, L('Voltear ↔', 'Flip ↔')), h('button', { onclick: () => flip(false) }, L('Voltear ↕', 'Flip ↕')),
      gridCb, zoomSel, info),
    h('div', { style: 'display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap' }, stage, h('div', null, h('div', { class: 'sub' }, L('Repetida', 'Tiled')), tile)),
    msg,
    h('div', { class: 'actions' }, h('div', { class: 'grow' }),
      h('button', { onclick: close }, L('Cancelar', 'Cancel')),
      h('button', { class: 'primary', onclick: async () => { try { await opts.onSave(P.cv.toDataURL('image/png')); close(); } catch (e) { msg.textContent = cleanError(e); } } }, ico('check'), L('Guardar textura', 'Save texture'))))));

  if (opts.src) {
    const img = new Image();
    img.onload = () => {
      if (img.width > 512 || img.height > 512) { msg.textContent = L('La textura es demasiado grande para pintarla (máx. 512 px).', 'Texture too large to paint (max 512 px).'); return; }
      P.cv.width = img.width; P.cv.height = img.height; ctx.drawImage(img, 0, 0); ready();
    };
    img.onerror = () => { msg.textContent = L('No se pudo abrir la imagen.', 'Could not open the image.'); };
    img.src = opts.src;
  } else { P.cv.width = opts.width || 16; P.cv.height = opts.height || opts.width || 16; ready(); }
}
