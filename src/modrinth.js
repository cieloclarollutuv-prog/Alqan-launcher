const fs = require('fs');
const path = require('path');
const { getJson, download } = require('./net');

const API = 'https://api.modrinth.com/v2';

const TYPES = {
  mod: { folder: 'mods', facet: 'mod' },
  resourcepack: { folder: 'resourcepacks', facet: 'resourcepack' },
  shader: { folder: 'shaderpacks', facet: 'shader' },
  modpack: { folder: '', facet: 'modpack' }
};

// Quilt puede cargar mods de Fabric
function loaderList(loader) {
  if (loader === 'quilt') return ['quilt', 'fabric'];
  if (loader === 'fabric') return ['fabric'];
  return [];
}

function typeInfo(type) {
  if (!TYPES[type]) throw new Error('Tipo de contenido inválido');
  return TYPES[type];
}

function folderFor(instanceDir, type) {
  return path.join(instanceDir, typeInfo(type).folder);
}

async function search({ type, query, version, loader }) {
  const info = typeInfo(type);
  const facets = [[`project_type:${info.facet}`]];
  if (type === 'mod') {
    const loaders = loaderList(loader);
    if (!loaders.length) throw new Error('NEED_LOADER');
    facets.push(loaders.map((l) => `categories:${l}`));
  }
  if (version && type !== 'modpack') facets.push([`versions:${version}`]);

  const url =
    `${API}/search?limit=24&index=${query ? 'relevance' : 'downloads'}` +
    `&query=${encodeURIComponent(query || '')}` +
    `&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const data = await getJson(url);
  return data.hits.map((h) => ({
    id: h.project_id,
    title: h.title,
    description: h.description,
    author: h.author,
    downloads: h.downloads,
    icon: h.icon_url
  }));
}

async function install({ type, projectId, version, loader, instanceDir }, seen = new Set(), depth = 0) {
  if (seen.has(projectId) || depth > 3) return [];
  seen.add(projectId);

  const params = [`game_versions=${encodeURIComponent(JSON.stringify([version]))}`];
  if (type === 'mod') {
    params.push(`loaders=${encodeURIComponent(JSON.stringify(loaderList(loader)))}`);
  }
  const versions = await getJson(`${API}/project/${projectId}/version?${params.join('&')}`);
  if (!versions.length) throw new Error(`No hay versión compatible con ${version}`);

  const v = versions[0];
  const file = v.files.find((f) => f.primary) || v.files[0];
  const dest = path.join(folderFor(instanceDir, type), path.basename(file.filename));
  if (type === 'mod') {
    // Si ya hay otra versión del mismo mod, se reemplaza (dos jars del mismo mod hacen fallar a Fabric)
    const key = baseKey(file.filename);
    if (key) {
      for (const f of list(instanceDir, 'mod')) {
        if (f !== path.basename(file.filename) && baseKey(f) === key) fs.unlinkSync(path.join(folderFor(instanceDir, 'mod'), f));
      }
    }
  }
  await download(file.url, dest);
  const installed = [file.filename];

  if (type === 'mod') {
    for (const dep of v.dependencies || []) {
      if (dep.dependency_type === 'required' && dep.project_id) {
        try {
          installed.push(...(await install({ type, projectId: dep.project_id, version, loader, instanceDir }, seen, depth + 1)));
        } catch {
          /* dependencia no disponible: se ignora */
        }
      }
    }
  }
  return installed;
}

// Nombre base de un jar sin versión ni loader: "sodium-fabric-0.5.jar" -> "sodium"
function baseKey(filename) {
  const out = [];
  for (const tok of String(filename).toLowerCase().replace(/\.(jar|zip)$/, '').split(/[^a-z0-9]+/).filter(Boolean)) {
    if (out.length && /^(fabric|quilt|forge|neoforge|mc\d|v?\d)/.test(tok)) break;
    out.push(tok);
  }
  return out.join('');
}
const hasMod = (files, slug) => files.some((f) => baseKey(f) === slug.replace(/-/g, ''));

function list(instanceDir, type) {
  try {
    return fs
      .readdirSync(folderFor(instanceDir, type))
      .filter((f) => /\.(jar|zip)$/i.test(f))
      .sort();
  } catch {
    return [];
  }
}

function remove(instanceDir, type, filename) {
  const target = path.join(folderFor(instanceDir, type), path.basename(filename));
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

module.exports = { search, install, list, remove, baseKey, hasMod };
