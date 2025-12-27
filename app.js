import * as THREE from './three/three.module.js';
import { OrbitControls } from './three/addons/controls/OrbitControls.js';
import { GLTFLoader } from './three/addons/loaders/GLTFLoader.js';

const canvasWrap = document.getElementById('canvasWrap');
const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const statusEl = document.getElementById('status');

const metaTitle = document.getElementById('metaTitle');
const metaSub = document.getElementById('metaSub');
const metaDesc = document.getElementById('metaDesc');
const metaTags = document.getElementById('metaTags');

const resetViewBtn = document.getElementById('resetView');
const toggleGridBtn = document.getElementById('toggleGrid');
const autoRotateChk = document.getElementById('autoRotate');
const wireframeChk = document.getElementById('wireframe');

function setStatus(msg) {
  statusEl.textContent = msg;
  console.log('[STATUS]', msg);
}

function showSidebarError(msg) {
  listEl.innerHTML = '';
  const box = document.createElement('div');
  box.style.padding = '12px';
  box.style.margin = '10px';
  box.style.border = '1px solid rgba(255,255,255,.12)';
  box.style.borderRadius = '14px';
  box.style.background = 'rgba(255,60,60,.08)';
  box.style.whiteSpace = 'pre-wrap';
  box.textContent = msg;
  listEl.appendChild(box);
}

function fileBaseName(path) {
  const last = String(path).split('/').pop();
  return last.replace(/\.[^/.]+$/, '');
}

function thumbFor(modelPath) {
  const base = fileBaseName(modelPath);
  return {
    jpg: `./thumbs/${base}.jpg`,
    png: `./thumbs/${base}.png`
  };
}

// --- Three.js ---
let renderer, scene, camera, controls;
let gridHelper, axesHelper;
let currentRoot = null;

const gltfLoader = new GLTFLoader();

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);

  const w = canvasWrap.clientWidth || 800;
  const h = canvasWrap.clientHeight || 600;

  camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 5000);
  camera.position.set(2, 1.5, 2.5);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);

  canvasWrap.innerHTML = '';
  canvasWrap.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.target.set(0, 0.0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.0));

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 4, 2);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-3, 2, -2);
  scene.add(fill);

  // Default grid (you can tweak these)
  gridHelper = new THREE.GridHelper(1000, 200, 0x223344, 0x223344);
  gridHelper.material.opacity = 0.35;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  axesHelper = new THREE.AxesHelper(1.0);
  scene.add(axesHelper);

  window.addEventListener('resize', onResize);
  animate();
}

function onResize() {
  if (!renderer || !camera) return;
  const w = canvasWrap.clientWidth;
  const h = canvasWrap.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  controls.autoRotate = !!autoRotateChk.checked;
  controls.update();
  renderer.render(scene, camera);
}

function clearCurrent() {
  if (!currentRoot) return;
  scene.remove(currentRoot);

  currentRoot.traverse(obj => {
    if (obj.isMesh) {
      obj.geometry?.dispose?.();
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
      else obj.material?.dispose?.();
    }
  });

  currentRoot = null;
}

function applyWireframe(enabled) {
  if (!currentRoot) return;
  currentRoot.traverse(obj => {
    if (obj.isMesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) if ('wireframe' in m) m.wireframe = enabled;
    }
  });
}

function frameObject(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Recenter model to origin
  root.position.x += (root.position.x - center.x);
  root.position.y += (root.position.y - center.y);
  root.position.z += (root.position.z - center.z);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const dist = maxDim * 1.6 + 0.6;

  camera.position.set(dist, dist * 0.7, dist);
  controls.target.set(0, 0, 0);
  controls.update();
}

function renderMeta(model) {
  metaTitle.textContent = model?.name || 'No model loaded';
  metaSub.textContent = model?.subtitle || (model?.file ? model.file.split('/').pop() : 'Select a model from the list.');
  metaDesc.textContent = model?.description || 'No description provided.';

  metaTags.innerHTML = '';
  const tags = Array.isArray(model?.tags) ? model.tags : [];
  for (const t of tags) {
    const pill = document.createElement('span');
    pill.className = 'tag';
    pill.textContent = String(t);
    metaTags.appendChild(pill);
  }
}

async function loadModel(model) {
  if (!model?.file) throw new Error('Model is missing "file".');

  setStatus(`Loading ${model.name}...`);
  renderMeta({ ...model, description: 'Loading...' });

  clearCurrent();

  try {
    // Cache-bust the GLB so updates show up immediately
    const sep = model.file.includes('?') ? '&' : '?';
    const bustUrl = model.file + sep + 'v=' + Date.now();

    const gltf = await gltfLoader.loadAsync(bustUrl);

    currentRoot = gltf.scene || (gltf.scenes && gltf.scenes[0]);
    if (!currentRoot) throw new Error('No scene in GLB/GLTF.');

    scene.add(currentRoot);
    frameObject(currentRoot);
    applyWireframe(!!wireframeChk.checked);

    renderMeta(model);
    setStatus(`Loaded: ${model.name}`);
  } catch (err) {
    console.error(err);
    renderMeta({ ...model, description: `Failed to load model: ${err?.message || err}` });
    setStatus(`Error loading ${model.name}`);
  }
}

// --- Models list ---
async function fetchModels() {
  setStatus('Fetching models.json...');
  const res = await fetch(`./models.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`models.json fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('models.json must be a JSON array: [ {...} ]');
  return data;
}

function sanitize(models) {
  return models
    .filter(m => m && typeof m === 'object')
    .map(m => ({
      id: String(m.id ?? fileBaseName(m.file ?? 'model')),
      name: String(m.name ?? fileBaseName(m.file ?? 'Untitled')),
      subtitle: String(m.subtitle ?? ''),
      file: String(m.file ?? ''),
      description: String(m.description ?? ''),
      tags: Array.isArray(m.tags) ? m.tags : []
    }))
    .filter(m => m.file.length > 0);
}

function renderList(models) {
  listEl.innerHTML = '';
  const q = (searchEl.value || '').toLowerCase().trim();

  const filtered = models.filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.subtitle.toLowerCase().includes(q) ||
    m.tags.join(' ').toLowerCase().includes(q)
  );

  for (const m of filtered) {
    const item = document.createElement('div');
    item.className = 'item';

    const t = document.createElement('div');
    t.className = 'thumb';

    const { jpg, png } = thumbFor(m.file);
    const img = document.createElement('img');
    img.alt = m.name;
    img.src = jpg;

    img.onerror = () => {
      if (img.src.endsWith('.jpg')) img.src = png;
      else t.textContent = 'thumb';
    };

    t.appendChild(img);

    const info = document.createElement('div');

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = m.name;

    const small = document.createElement('div');
    small.className = 'small';
    small.textContent = m.subtitle || m.file.split('/').pop();

    info.appendChild(name);
    info.appendChild(small);

    item.appendChild(t);
    item.appendChild(info);

    item.addEventListener('click', async () => {
      document.querySelectorAll('.item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      renderMeta(m);
      await loadModel(m);
    });

    listEl.appendChild(item);
  }

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '12px';
    empty.style.color = 'var(--muted)';
    empty.textContent = models.length ? 'No matches.' : 'No models in models.json.';
    listEl.appendChild(empty);
  }
}

// --- UI hooks ---
function hookUI(models) {
  searchEl.addEventListener('input', () => renderList(models));
  resetViewBtn.addEventListener('click', () => currentRoot && frameObject(currentRoot));
  toggleGridBtn.addEventListener('click', () => {
    gridHelper.visible = !gridHelper.visible;
    axesHelper.visible = !axesHelper.visible;
  });
  wireframeChk.addEventListener('change', () => applyWireframe(!!wireframeChk.checked));
}

// Run
try {
  setStatus('app.js running ✅');
  initThree();

  const raw = await fetchModels();
  const models = sanitize(raw);

  setStatus(`Ready. ${models.length} model(s) found.`);
  renderList(models);
  hookUI(models);

  if (models.length) {
    // auto-load first model
    const first = listEl.querySelector('.item');
    if (first) first.classList.add('active');
    renderMeta(models[0]);
    await loadModel(models[0]);
  }
} catch (e) {
  console.error(e);
  showSidebarError(String(e?.message || e));
  setStatus('Error. See sidebar.');
}
