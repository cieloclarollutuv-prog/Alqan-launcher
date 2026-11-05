const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const store = require('./store');
const auth = require('./auth');
const { requiredJavaMajor } = require('./mojang');
const { ensureJava, javaMajor, normMajor } = require('./java');
const { ensureLoader } = require('./loaders');
const { ensureAssets, purgeBadIndexes, seedVersionJson, resetVersionFiles } = require('./assets');

let running = false;

// Argumentos de G1GC afinados para Minecraft (menos tirones por el recolector de basura)
const PERF_ARGS = [
  '-XX:+UnlockExperimentalVMOptions', '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200',
  '-XX:+DisableExplicitGC', '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=8M',
  '-XX:G1ReservePercent=20', '-XX:G1HeapWastePercent=5', '-XX:G1MixedGCCountTarget=4', '-XX:InitiatingHeapOccupancyPercent=15',
  '-XX:G1MixedGCLiveThresholdPercent=90', '-XX:G1RSetUpdatingPauseTimePercent=5', '-XX:SurvivorRatio=32',
  '-XX:+PerfDisableSharedMem', '-XX:MaxTenuringThreshold=1'
];
const OTHER_GC = /UseZGC|UseShenandoahGC|UseParallelGC|UseSerialGC|UseConcMarkSweepGC/;

// Traduce los errores típicos del juego a una pista en español
function diagnose(text) {
  const rules = [
    [/Failed to verify username|Invalid session|multiplayer\.disconnect\.unverified|Bad login|not authenticated/i, 'El servidor es premium (online-mode) y esta cuenta no lo es. Entra con una cuenta Microsoft, o juega en servidores no premium / con tu servidor de cuentas o Ely.by.'],
    [/UnsupportedClassVersionError|class file version/i, 'Java es demasiado antiguo para esta versión. Borra Java en Ajustes > Almacenamiento y vuelve a jugar: se descargará el correcto.'],
    [/OutOfMemoryError|Could not reserve enough space|insufficient memory|Cannot allocate memory/i, 'Falta memoria: baja la RAM de la instancia (por ejemplo a 3-4 GB) y cierra otros programas.'],
    [/Unrecognized VM option|Could not create the Java Virtual Machine|Error occurred during initialization of VM/i, 'Java rechazó un argumento. Desactiva "Optimización de Java" en Ajustes y vacía los argumentos JVM de la instancia.'],
    [/UnknownHostException|SSLHandshake|PKIX|Connection timed out/i, 'Problema de red o certificados: revisa tu internet, antivirus o VPN.'],
    [/Unexpected end of JSON input|Unexpected token .* in JSON/i, 'Un archivo del juego estaba dañado. Ya se repara solo: vuelve a pulsar Jugar. Si sigue, borra la versión en Ajustes > Almacenamiento.'],
    [/authlib-injector|javaagent/i, 'Falló el sistema de cuentas (authlib-injector). Revisa que la dirección del servidor de cuentas sea correcta.']
  ];
  const hit = rules.find(([re]) => re.test(text));
  return hit ? hit[1] : '';
}

async function launch({ instanceId, accountId, noPerf }, emit) {
  if (running) throw new Error('Ya hay un juego en ejecución');

  const settings = store.getSettings();
  const inst = store.getInstances().find((i) => i.id === instanceId);
  const acc = store.getAccounts().find((a) => a.id === accountId);
  if (!inst) throw new Error('Elige una instancia');
  if (!acc) throw new Error('Elige una cuenta');
  if ((acc.type || 'offline') === 'offline' && !/^[A-Za-z0-9_]{3,16}$/.test(acc.name)) {
    throw new Error('El nombre de la cuenta debe tener de 3 a 16 caracteres (letras, números o _)');
  }

  const root = store.sharedDir();
  const gameDir = store.instanceDir(inst.id);
  fs.mkdirSync(gameDir, { recursive: true });
  try {
    if (acc.skinPng && acc.type !== 'microsoft') require('./skinpack').apply(gameDir, inst.version, Buffer.from(acc.skinPng, 'base64'));
  } catch {}

  // Todo lo que sale en la consola también se guarda en <datos>/logs/last-launch.log
  const logFile = path.join(root, 'logs', 'last-launch.log');
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.writeFileSync(logFile, `Alqan Launcher · ${inst.name} · Minecraft ${inst.version} · ${inst.loader} · ${os.platform()} ${os.arch()}\n`);
  } catch { /* sin log en disco */ }
  const log = (line) => {
    tail.push(line); if (tail.length > 80) tail.shift();
    try { fs.appendFileSync(logFile, line + '\n'); } catch { /* ignorar */ }
    emit('game:log', line);
  };

  const tail = [];
  const t0 = Date.now();
  running = true;
  try {
    // Java: el que exige esta versión de Minecraft, comprobado antes de usarlo
    const major = normMajor(await requiredJavaMajor(inst.version));
    let javaPath = settings.javaPath || 'java';
    if (!settings.javaPath && settings.autoJava) {
      try {
        javaPath = await ensureJava(root, major, log);
      } catch (err) {
        const sys = await javaMajor('java');
        const okSys = major <= 8 ? sys === 8 : sys >= major;
        if (!okSys) {
          throw new Error(`No se pudo preparar Java ${major} (${err.message}). Revisa tu conexión o instala Java ${major} y pon su ruta en Ajustes.`);
        }
        log(`No se pudo descargar Java (${err.message}); se usa el Java del sistema (versión ${sys}).`);
        javaPath = 'java';
      }
    } else {
      const have = await javaMajor(javaPath);
      if (!have) throw new Error(`No se encontró Java en "${javaPath}". Activa la descarga automática en Ajustes o instala Java ${major}.`);
      if (have !== major && (major <= 8 || have < major)) log(`Aviso: esta versión necesita Java ${major} y tu Java es el ${have}; puede fallar.`);
    }
    log(`Java: ${javaPath}`);

    // Modloader
    const version = { number: inst.version, type: 'release' };
    if (inst.loader && inst.loader !== 'vanilla') {
      log(`Preparando ${inst.loader}...`);
      version.custom = await ensureLoader(root, inst.loader, inst.version);
    }

    // Assets: se verifican y reparan antes de arrancar (si no hay internet, se sigue con lo que haya)
    try {
      purgeBadIndexes(root);
      await seedVersionJson(root, inst.version, version.custom);
      await ensureAssets(root, inst.version, log, (task, total) => emit('game:progress', { type: 'assets', task, total }), version.custom);
    } catch (err) {
      if (err.fatal) throw err;
      log(`Aviso: no se pudieron verificar los assets (${err.message}).`);
    }

    // RAM: nunca más del 75 % de la memoria del equipo
    const wanted = inst.ram || 4;
    const totalGB = os.totalmem() / 2 ** 30;
    const ram = Math.max(1, Math.min(wanted, Math.floor(totalGB * 0.75)));
    if (ram < wanted) log(`Aviso: tu equipo tiene ${totalGB.toFixed(1)} GB de RAM; se usarán ${ram} GB en vez de ${wanted} GB.`);

    const userArgs = (inst.jvmArgs || '').split(/\s+/).filter(Boolean);
    const perfArgs = !noPerf && settings.perfFlags !== false && !userArgs.some((a) => OTHER_GC.test(a)) ? PERF_ARGS : [];
    if (perfArgs.length) log('Optimización de Java activada (G1GC afinado).');

    const { authorization, jvmArgs } = await auth.resolve(acc, root);
    const launcher = new Client();

    launcher.on('progress', (p) => emit('game:progress', { type: p.type, task: p.task, total: p.total }));
    launcher.on('data', (d) => log(String(d).trimEnd()));
    launcher.on('debug', (d) => log(String(d).trimEnd()));
    launcher.on('close', (code) => {
      running = false;
      const out = tail.join('\n');
      // Si Java no arranca por las opciones de optimización, reintenta sin ellas
      if (code !== 0 && perfArgs.length && Date.now() - t0 < 60000 && /Unrecognized VM option|Could not create the Java Virtual Machine|Error occurred during initialization of VM/i.test(out)) {
        log('Java no aceptó la optimización: reintentando sin ella…');
        launch({ instanceId, accountId, noPerf: true }, emit).catch((e) => { log(`ERROR: ${e.message}`); emit('game:closed', 1); });
        return;
      }
      log(`El juego terminó con código ${code}`);
      if (code !== 0) { const hint = diagnose(out); if (hint) log(`PISTA: ${hint}`); }
      emit('game:closed', code);
    });

    emit('game:status', 'launching');
    const opts = {
      authorization,
      root,
      javaPath,
      version,
      memory: { max: `${ram}G`, min: `${Math.max(1, Math.floor(ram / 2))}G` },
      overrides: { gameDirectory: gameDir },
      customArgs: ['-XX:+IgnoreUnrecognizedVMOptions', ...perfArgs, ...jvmArgs, ...userArgs]
    };
    let proc = await launcher.launch(opts);
    if (!proc && /JSON/.test(tail.slice(-6).join('\n')) && !noPerf) {
      // Archivo de índice/versión vacío o cortado: se reparan y se reintenta una vez
      log('Se detectó un archivo JSON dañado. Reparando y reintentando…');
      resetVersionFiles(root, inst.version, version.custom);
      await seedVersionJson(root, inst.version, version.custom);
      await ensureAssets(root, inst.version, log, (task, total) => emit('game:progress', { type: 'assets', task, total }), version.custom);
      proc = await new Client().launch(opts);
    }

    if (!proc) {
      const why = [...tail].reverse().find((l) => /Failed to start due to/.test(l)) || '';
      const hint = diagnose(tail.join('\n'));
      throw new Error(`No se pudo iniciar el juego.${why ? ' ' + why.replace(/^\[MCLC\]:\s*/, '') : ''}${hint ? ' · ' + hint : ''}`);
    }
    emit('game:status', 'running');
    return true;
  } catch (err) {
    running = false;
    log(`ERROR: ${err.message}`);
    throw err;
  }
}

// Botón "Reparar": limpia los archivos de versión que suelen romperse (se recrean al jugar)
async function repair(instanceId, emit) {
  const inst = store.getInstances().find((i) => i.id === instanceId);
  if (!inst) throw new Error('Elige una instancia');
  if (running) throw new Error('Cierra el juego antes de reparar');
  const root = store.sharedDir();
  let custom = null;
  if (inst.loader && inst.loader !== 'vanilla') custom = await ensureLoader(root, inst.loader, inst.version);
  resetVersionFiles(root, inst.version, custom);
  await seedVersionJson(root, inst.version, custom);
  await ensureAssets(root, inst.version, (l) => emit('game:log', l), (task, total) => emit('game:progress', { type: 'assets', task, total }), custom);
  return true;
}

module.exports = { launch, repair };
