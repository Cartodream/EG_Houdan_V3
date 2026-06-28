// ═══════════════════════════════════════════════════════
//  ÉTAT
// ═══════════════════════════════════════════════════════
let PANO_W = 1360;
let PANO_H = 972;

let steps          = [];
let selectedId     = null;
let gameTitle      = '';
let gameSubtitle   = '';
let gameIntro      = '';
let victoryMessage = '';
let gameDuration   = 60; // minutes

function toggleItemSection() {
  document.getElementById('section-item').style.display =
    document.getElementById('f-item-enabled').checked ? '' : 'none';
}

function loadItemImage(event) {
  const file = event.target.files[0];
  if (!file || selectedId === null) return;
  const step = steps.find(s => s.id === selectedId);
  if (!step) return;
  if (!step.item) step.item = {};
  if (step._itemBlobUrl) URL.revokeObjectURL(step._itemBlobUrl);
  step.item.image    = file.name;
  step._itemBlobUrl  = URL.createObjectURL(file);
  const el = document.getElementById('f-item-image-name');
  if (el) { el.textContent = file.name; el.style.color = 'var(--gold)'; }
  event.target.value = '';
  toast(`Image objet : ${file.name}`, 'ok');
}
function clearItemImage() {
  if (selectedId === null) return;
  const step = steps.find(s => s.id === selectedId);
  if (!step) return;
  if (step._itemBlobUrl) { URL.revokeObjectURL(step._itemBlobUrl); delete step._itemBlobUrl; }
  if (step.item) delete step.item.image;
  const el = document.getElementById('f-item-image-name');
  if (el) { el.textContent = '— aucune image —'; el.style.color = 'var(--muted)'; }
}

function loadHintImage(event) {
  const file = event.target.files[0];
  if (!file || selectedId === null) return;
  const step = steps.find(s => s.id === selectedId);
  if (!step) return;
  if (step._hintBlobUrl) URL.revokeObjectURL(step._hintBlobUrl);
  step.hint_image    = file.name;
  step._hintBlobUrl  = URL.createObjectURL(file);
  const el = document.getElementById('f-hint-image-name');
  if (el) { el.textContent = file.name; el.style.color = 'var(--gold)'; }
  event.target.value = '';
  toast(`Image indice : ${file.name}`, 'ok');
}
function clearHintImage() {
  if (selectedId === null) return;
  const step = steps.find(s => s.id === selectedId);
  if (!step) return;
  if (step._hintBlobUrl) { URL.revokeObjectURL(step._hintBlobUrl); delete step._hintBlobUrl; }
  delete step.hint_image;
  const el = document.getElementById('f-hint-image-name');
  if (el) { el.textContent = '— aucune image d\'indice —'; el.style.color = 'var(--muted)'; }
}

function updateDurationHint() {
  const m = gameDuration;
  const h = Math.floor(m / 60);
  const r = m % 60;
  document.getElementById('f-duration-hint').textContent =
    h > 0 ? `= ${h}h${r > 0 ? String(r).padStart(2,'0') : '00'}` : `= ${r} min`;
}

let mode         = 'pan';    // 'pan' | 'draw'
let panX         = 0;
let panVel       = 0;
let isDrag       = false;
let didDrag      = false;
let dragStartX   = 0;
let dragStartPan = 0;
let drawStart    = null;
let rafId        = null;
let nextId       = 1;

// ═══════════════════════════════════════════════════════
//  GEOMETRY
// ═══════════════════════════════════════════════════════
function vp()       { return document.getElementById('pano-vp'); }
function getScale() { return vp().offsetHeight / PANO_H; }
function getMaxPan(){
  const sc = getScale();
  return Math.max(0, PANO_W * sc - vp().offsetWidth);
}
function clamp(x)   { return Math.max(0, Math.min(x, getMaxPan())); }

function screenToPano(sx, sy) {
  const sc = getScale();
  return { px: (sx + panX) / sc, py: sy / sc };
}
function panoToScreen(px, py) {
  const sc = getScale();
  return { sx: px * sc - panX, sy: py * sc };
}

// ═══════════════════════════════════════════════════════
//  PAN ENGINE
// ═══════════════════════════════════════════════════════
function applyPan(x) {
  panX = clamp(x);
  document.getElementById('pano-img').style.transform = `translateX(-${panX}px)`;
  renderZones();
}

function startInertia() {
  cancelAnimationFrame(rafId);
  const FRICTION = 0.87;
  function step() {
    panVel *= FRICTION;
    if (Math.abs(panVel) < 0.4) return;
    applyPan(panX + panVel);
    rafId = requestAnimationFrame(step);
  }
  rafId = requestAnimationFrame(step);
}

// ═══════════════════════════════════════════════════════
//  MODE
// ═══════════════════════════════════════════════════════
function setMode(m) {
  mode = m;
  document.getElementById('btn-pan').classList.toggle('active', m === 'pan');
  document.getElementById('btn-draw').classList.toggle('active', m === 'draw');
  document.getElementById('mode-txt').textContent = m === 'pan' ? 'Déplacer' : 'Dessiner zone';
  vp().classList.toggle('draw-mode', m === 'draw');
  if (m === 'draw' && !selectedId) {
    toast('Sélectionne d\'abord une étape dans la liste (ou crée-en une)', 'info');
  }
}

// ═══════════════════════════════════════════════════════
//  MOUSE EVENTS — PANORAMA
// ═══════════════════════════════════════════════════════
let lastMoveX = 0, lastMoveT = 0;

vp().addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  cancelAnimationFrame(rafId);

  if (mode === 'draw' && selectedId !== null) {
    // Start drawing rectangle
    const rect = vp().getBoundingClientRect();
    drawStart = { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
    const dr = document.getElementById('draw-rect');
    dr.style.display = 'block';
    dr.style.left   = drawStart.sx + 'px';
    dr.style.top    = drawStart.sy + 'px';
    dr.style.width  = '0'; dr.style.height = '0';
    isDrag = true; didDrag = false;
    return;
  }

  // Pan mode
  isDrag = true; didDrag = false;
  dragStartX   = e.clientX;
  dragStartPan = panX;
  lastMoveX    = e.clientX;
  lastMoveT    = Date.now();
  e.preventDefault();
});

vp().addEventListener('mousemove', e => {
  const rect = vp().getBoundingClientRect();
  const sx   = e.clientX - rect.left;
  const sy   = e.clientY - rect.top;
  const { px, py } = screenToPano(sx, sy);
  document.getElementById('coords-bar').textContent =
    `x: ${Math.round(px)}   y: ${Math.round(py)}`;

  if (!isDrag) return;

  if (mode === 'draw' && drawStart) {
    // Update draw rect
    const x = Math.min(sx, drawStart.sx);
    const y = Math.min(sy, drawStart.sy);
    const w = Math.abs(sx - drawStart.sx);
    const h = Math.abs(sy - drawStart.sy);
    const dr = document.getElementById('draw-rect');
    dr.style.left   = x + 'px'; dr.style.top    = y + 'px';
    dr.style.width  = w + 'px'; dr.style.height = h + 'px';
    if (w > 5 || h > 5) didDrag = true;
    return;
  }

  // Pan
  const dx = e.clientX - lastMoveX;
  const dt = Date.now() - lastMoveT;
  panVel = dt > 0 ? (-dx / dt) * 16 : 0;
  lastMoveX = e.clientX; lastMoveT = Date.now();
  if (Math.abs(dragStartX - e.clientX) > 5) didDrag = true;
  applyPan(dragStartPan + (dragStartX - e.clientX));
});

vp().addEventListener('mouseup', e => {
  if (!isDrag) return;
  isDrag = false;

  if (mode === 'draw' && drawStart) {
    document.getElementById('draw-rect').style.display = 'none';
    if (didDrag) {
      // Convert draw rect to pano coords
      const rect = vp().getBoundingClientRect();
      const ex = e.clientX - rect.left;
      const ey = e.clientY - rect.top;
      const p1 = screenToPano(Math.min(drawStart.sx, ex), Math.min(drawStart.sy, ey));
      const p2 = screenToPano(Math.max(drawStart.sx, ex), Math.max(drawStart.sy, ey));
      const zone = {
        x: Math.round(p1.px), y: Math.round(p1.py),
        w: Math.round(p2.px - p1.px), h: Math.round(p2.py - p1.py)
      };
      applyZoneToSelected(zone);
    }
    drawStart = null;
    return;
  }

  if (didDrag) { startInertia(); } else { onVpClick(e); }
});

vp().addEventListener('mouseleave', e => {
  if (!isDrag) return;
  isDrag = false;
  if (mode === 'draw') {
    document.getElementById('draw-rect').style.display = 'none';
    drawStart = null;
  } else {
    startInertia();
  }
});

// Touch
vp().addEventListener('touchstart', e => {
  cancelAnimationFrame(rafId);
  const t = e.touches[0];
  isDrag = true; didDrag = false;
  dragStartX = t.clientX; dragStartPan = panX;
  lastMoveX = t.clientX; lastMoveT = Date.now();
}, { passive: true });

vp().addEventListener('touchmove', e => {
  if (!isDrag) return; e.preventDefault();
  const t = e.touches[0];
  const dx = t.clientX - lastMoveX;
  const dt = Date.now() - lastMoveT;
  panVel = dt > 0 ? (-dx / dt) * 16 : 0;
  lastMoveX = t.clientX; lastMoveT = Date.now();
  if (Math.abs(dragStartX - t.clientX) > 6) didDrag = true;
  applyPan(dragStartPan + (dragStartX - t.clientX));
}, { passive: false });

vp().addEventListener('touchend', e => {
  if (!isDrag) return; isDrag = false;
  if (didDrag) startInertia();
});

window.addEventListener('resize', () => { applyPan(panX); });

function onVpClick(e) {
  // Click on viewport (no draw, no pan) — deselect if nothing hit
}

// ═══════════════════════════════════════════════════════
//  ZONE APPLICATION
// ═══════════════════════════════════════════════════════
function applyZoneToSelected(zone) {
  if (selectedId === null) return;
  const step = steps.find(s => s.id === selectedId);
  if (!step) return;
  step.zone = zone;
  updateZoneDisplay(zone);
  renderZones();
  renderList();
  toast('Zone tracée ! Enregistre pour valider.', 'ok');
  autoSave();
}

function updateZoneDisplay(zone) {
  const el = document.getElementById('f-zone-display');
  if (!zone) {
    el.textContent = '— pas encore définie —';
    el.classList.add('empty');
  } else {
    el.textContent = `x:${zone.x}  y:${zone.y}  w:${zone.w}  h:${zone.h}`;
    el.classList.remove('empty');
  }
}

// ═══════════════════════════════════════════════════════
//  IMAGE PAR DÉFI (avec héritage pour les défis clic)
// ═══════════════════════════════════════════════════════
function onImgLoad() {
  const img = document.getElementById('pano-img');
  PANO_W = img.naturalWidth;
  PANO_H = img.naturalHeight;
  // Ne met à jour les dimensions que si c'est l'image propre du défi sélectionné
  if (img.dataset.isOwnImage === '1' && selectedId !== null) {
    const step = steps.find(s => s.id === selectedId);
    if (step) { step.imageWidth = PANO_W; step.imageHeight = PANO_H; autoSave(); }
  }
  applyPan(0);
  renderZones();
}

function getInheritedImage(stepId) {
  const idx = steps.findIndex(s => s.id === stepId);
  for (let i = idx - 1; i >= 0; i--) {
    const s = steps[i];
    if (s._blobUrl || s.image) return s;
  }
  return null;
}

function loadStepImage(event) {
  const file = event.target.files[0];
  if (!file || selectedId === null) return;
  const step = steps.find(s => s.id === selectedId);
  if (!step) return;
  if (step._blobUrl) URL.revokeObjectURL(step._blobUrl);
  step.image    = file.name;
  step._blobUrl = URL.createObjectURL(file);
  const img = document.getElementById('pano-img');
  img.dataset.isOwnImage = '1';
  img.style.display = 'none';
  img.src = step._blobUrl;
  document.getElementById('f-image-name').textContent = file.name;
  document.getElementById('f-image-name').style.color = 'var(--gold)';
  event.target.value = '';
  toast(`Image : ${file.name}`, 'ok');
}

function clearStepImage() {
  if (selectedId === null) return;
  const step = steps.find(s => s.id === selectedId);
  if (!step) return;
  if (step._blobUrl) { URL.revokeObjectURL(step._blobUrl); delete step._blobUrl; }
  step.image = ''; step.imageWidth = 0; step.imageHeight = 0;
  showStepImage(step);
  autoSave();
}

function showStepImage(step) {
  const img = document.getElementById('pano-img');
  const nameEl = document.getElementById('f-image-name');
  let src = step._blobUrl || step.image || '';
  let w = step.imageWidth || 0, h = step.imageHeight || 0;
  let isOwn = !!src;

  if (!src) {
    const parent = getInheritedImage(step.id);
    if (parent) {
      src = parent._blobUrl || parent.image;
      w = parent.imageWidth || 0; h = parent.imageHeight || 0;
      nameEl.textContent  = `(héritée : ${parent.image || '…'})`;
      nameEl.style.color  = 'var(--muted)';
    } else {
      nameEl.textContent  = '— aucune image —';
      nameEl.style.color  = 'var(--muted)';
    }
  } else {
    nameEl.textContent = step.image || 'image chargée';
    nameEl.style.color = 'var(--gold)';
  }

  if (!src) { img.style.display = 'none'; img.src = ''; return; }
  if (w) { PANO_W = w; PANO_H = h; }
  img.dataset.isOwnImage = isOwn ? '1' : '0';
  img.style.display = 'none';
  const prevSrc = img.getAttribute('src') || '';
  if (prevSrc === src) {
    // Même URL : le navigateur ne refait pas le load, on force
    img.removeAttribute('src');
  }
  img.src = src;
  // Si le blob est déjà décodé en mémoire, complete peut être true immédiatement
  if (img.complete && img.naturalWidth > 0) {
    img.style.display = 'block';
    onImgLoad();
  }
  // sinon : onload="this.style.display='block';onImgLoad()" prend le relai
}

// ═══════════════════════════════════════════════════════
//  STEPS CRUD
// ═══════════════════════════════════════════════════════
function addStep(type = 'code') {
  const step = { id: nextId++, type,
                 image: '', imageWidth: 0, imageHeight: 0,
                 clue: '', code: '', zone: null, success: '', hint: '', hint_image: '', item: null };
  steps.push(step);
  renderList();
  selectStep(step.id);
  const typeLabels = { code: 'Code', click: 'Clic', puzzle: 'Puzzle', t9: 'T9' };
  toast(`Défi ${typeLabels[type] || type} créé.`, 'info');
  autoSave();
}

function selectStep(id) {
  selectedId = id;
  const step = steps.find(s => s.id === id);
  if (!step) return;

  const isCode   = step.type === 'code';
  const isClick  = step.type === 'click';
  const isPuzzle = step.type === 'puzzle';
  const isT9     = step.type === 't9';

  document.getElementById('edit-num').textContent = steps.indexOf(step) + 1;
  const typeEl = document.getElementById('edit-type');
  typeEl.textContent = isCode ? '🔐 Code' : isClick ? '🗺 Clic' : isPuzzle ? '🧩 Puzzle' : '📱 T9';
  typeEl.style.color = isCode ? 'var(--gold)' : isClick ? 'var(--ok)' : isPuzzle ? '#a87ce8' : '#5cb8e8';

  document.getElementById('f-clue-lbl').textContent = (isCode || isT9)
    ? 'Énigme / indice'
    : isClick ? 'Instruction (affichée dans le popup)'
    : 'Instruction du puzzle';
  document.getElementById('clue-hint').style.display = (isCode || isT9) ? '' : 'none';

  document.getElementById('f-clue').value    = step.clue    || '';
  document.getElementById('f-code').value    = step.code    || '';
  document.getElementById('f-success').value = step.success || '';
  document.getElementById('f-hint').value    = step.hint    || '';

  // Picker image d'indice
  const hintImgEl = document.getElementById('f-hint-image-name');
  if (hintImgEl) {
    const hi = step.hint_image || '';
    hintImgEl.textContent = hi || '— aucune image d\'indice —';
    hintImgEl.style.color = hi ? 'var(--gold)' : 'var(--muted)';
  }

  const hasItem = !!(step.item && step.item.name);
  document.getElementById('f-item-enabled').checked = hasItem;
  document.getElementById('f-item-icon').value       = step.item?.icon || '';
  document.getElementById('f-item-name').value       = step.item?.name || '';
  document.getElementById('f-item-text').value       = step.item?.text || '';
  document.getElementById('section-item').style.display = hasItem ? '' : 'none';

  // Picker image d'objet
  const itemImgEl = document.getElementById('f-item-image-name');
  if (itemImgEl) {
    const ii = step.item?.image || '';
    itemImgEl.textContent = ii || '— aucune image —';
    itemImgEl.style.color = ii ? 'var(--gold)' : 'var(--muted)';
  }

  document.getElementById('section-code').style.display  = (isCode || isT9) ? '' : 'none';
  document.getElementById('section-click').style.display = isClick  ? '' : 'none';
  const codeLbl   = document.getElementById('f-code-lbl');
  const codeInput = document.getElementById('f-code');
  if (isT9) {
    codeLbl.textContent            = 'Mot attendu (lettres en majuscules)';
    codeInput.placeholder          = 'Ex : REMPARTS';
    codeInput.style.textTransform  = 'uppercase';
    codeInput.style.letterSpacing  = '.15em';
  } else {
    codeLbl.textContent            = 'Code attendu (mot en clair)';
    codeInput.placeholder          = 'GUERRE';
    codeInput.style.textTransform  = 'uppercase';
    codeInput.style.letterSpacing  = '.15em';
  }
  document.getElementById('btn-redraw').style.display    = isClick  ? '' : 'none';

  updateZoneDisplay(step.zone);
  showStepImage(step);
  document.getElementById('edit-panel').classList.add('visible');
  renderList();
  // scroll la carte sélectionnée dans la timeline
  const card = document.querySelector('.tl-card.active');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  renderZones();
  updateCluePreview();
}

function saveStep() {
  if (selectedId === null) return;
  const step = steps.find(s => s.id === selectedId);
  if (!step) return;
  step.clue    = document.getElementById('f-clue').value.trim();
  step.success = document.getElementById('f-success').value.trim();
  step.hint    = document.getElementById('f-hint').value.trim();
  // image d'indice (stockée via loadHintImage, déjà sur step.hint_image)
  if (!step.hint_image) delete step.hint_image;
  if (document.getElementById('f-item-enabled').checked) {
    const iName = document.getElementById('f-item-name').value.trim();
    if (iName) {
      const prevImage = step.item?.image || '';
      step.item = { name: iName };
      const icon = document.getElementById('f-item-icon').value.trim();
      const text = document.getElementById('f-item-text').value.trim();
      if (icon)       step.item.icon  = icon;
      if (text)       step.item.text  = text;
      if (prevImage)  step.item.image = prevImage; // gardé depuis loadItemImage
    } else { step.item = null; }
  } else { step.item = null; }
  if (step.type === 'code') {
    step.code = document.getElementById('f-code').value.trim().toUpperCase();
  }
  if (step.type === 't9') {
    step.code = document.getElementById('f-code').value.trim().toUpperCase();
  }
  renderList();
  autoSave();
  toast('Défi enregistré.', 'ok');
}

function deleteStep() {
  if (selectedId === null) return;
  steps = steps.filter(s => s.id !== selectedId);
  selectedId = null;
  document.getElementById('edit-panel').classList.remove('visible');
  renderList();
  renderZones();
  autoSave();
  toast('Étape supprimée.', 'info');
}

function moveStep(id, dir) {
  const i = steps.findIndex(s => s.id === id);
  const j = i + dir;
  if (j < 0 || j >= steps.length) return;
  [steps[i], steps[j]] = [steps[j], steps[i]];
  renderList();
  renderZones();
  autoSave();
}

function startRedraw() {
  setMode('draw');
  toast('Trace la nouvelle zone sur le panorama.', 'info');
}

// ═══════════════════════════════════════════════════════
//  RENDER LIST
// ═══════════════════════════════════════════════════════
function renderList() {
  const el = document.getElementById('timeline-cards');
  const empty = document.getElementById('tl-empty');
  if (steps.length === 0) {
    el.innerHTML = '';
    if (empty) el.appendChild(empty);
    return;
  }
  el.innerHTML = '';
  steps.forEach((step, i) => {
    const card = document.createElement('div');
    card.className = 'tl-card' + (step.id === selectedId ? ' active' : '');
    card.onclick = () => selectStep(step.id);
    const isCode   = step.type === 'code';
    const isClick  = step.type === 'click';
    const isT9     = step.type === 't9';
    const color    = isCode ? 'var(--gold)' : isClick ? 'var(--ok)' : isT9 ? '#5cb8e8' : '#a87ce8';
    const badge    = isCode ? '🔐 CODE'     : isClick ? '🗺 CLIC'   : isT9 ? '📱 T9'   : '🧩 PUZZLE';
    const hasClue  = !!step.clue;
    const hasMain  = (isCode || isT9) ? !!step.code : isClick ? !!step.zone : !!step.image;
    const footTxt  = (isCode || isT9)
      ? (step.code || 'code manquant')
      : isClick
        ? (step.zone ? `${step.zone.w}×${step.zone.h}` : 'zone manquante')
        : (step.image || 'image manquante');
    card.innerHTML = `
      <div class="tl-num" style="color:${color}">${i + 1} — ${badge}</div>
      <div class="tl-clue">${step.clue || '<em style="color:var(--muted)">texte vide</em>'}</div>
      <div class="tl-foot">
        <span class="tl-dot ${hasClue ? 'ok' : 'ko'}"></span>
        <span class="tl-dot ${hasMain ? 'ok' : 'ko'}"></span>
        <span class="tl-foot-txt">${footTxt}</span>
      </div>
      <div class="tl-arrows">
        <button onclick="event.stopPropagation();moveStep(${step.id},-1)">◀</button>
        <button onclick="event.stopPropagation();moveStep(${step.id},+1)">▶</button>
        <button onclick="event.stopPropagation();selectedId=${step.id};deleteStep()" title="Supprimer" style="color:var(--ko)">✕</button>
      </div>`;
    el.appendChild(card);
  });
}

// ═══════════════════════════════════════════════════════
//  RENDER ZONES ON PANORAMA
// ═══════════════════════════════════════════════════════
function renderZones() {
  const layer = document.getElementById('zones-layer');
  layer.innerHTML = '';
  if (selectedId === null) return;
  const step = steps.find(s => s.id === selectedId);
  if (!step || !step.zone) return;
  const i = steps.indexOf(step);
  const z = step.zone;
  const { sx, sy } = panoToScreen(z.x, z.y);
  const sc = getScale();
  const sw = z.w * sc;
  const sh = z.h * sc;

  const box = document.createElement('div');
  box.className = `zone-box zone-color-${i % 6} selected`;
  box.style.left   = sx + 'px';
  box.style.top    = sy + 'px';
  box.style.width  = sw + 'px';
  box.style.height = sh + 'px';
  box.style.zIndex = 5;

  const lbl = document.createElement('div');
  lbl.className = 'zone-lbl';
  lbl.textContent = i + 1;
  box.appendChild(lbl);
  layer.appendChild(box);
}

// ═══════════════════════════════════════════════════════
//  IMPORT / EXPORT
// ═══════════════════════════════════════════════════════
function buildConfig() {
  return {
    title:          document.getElementById('f-game-title').value.trim(),
    subtitle:       document.getElementById('f-game-subtitle').value.trim(),
    intro:          document.getElementById('f-game-intro').value.trim(),
    duration:       gameDuration,
    victoryMessage: document.getElementById('f-victory-msg').value.trim(),
    steps: steps.map(s => {
      const obj = { type: s.type, clue: s.clue, success: s.success };
      if (s.hint)           obj.hint = s.hint;
      if (s.hint_image)     obj.hint_image = s.hint_image;
      if (s.image)          { obj.image = s.image; obj.imageWidth = s.imageWidth || 0; obj.imageHeight = s.imageHeight || 0; }
      if ((s.type === 'code' || s.type === 't9') && s.code) obj.code = s.code;
      if (s.type === 'click' && s.zone) obj.zone = s.zone;
      if (s.item?.name)     obj.item = s.item;
      return obj;
    })
  };
}

function exportJSON() {
  const warnings = [];
  if (steps.length === 0) warnings.push('Aucune étape configurée !');
  steps.forEach((s, i) => {
    const n = i + 1;
    if (!s.image)                       warnings.push(`Étape ${n} : image manquante`);
    if ((s.type === 'code' || s.type === 't9') && !s.code) warnings.push(`Étape ${n} : code non défini`);
    if (!s.clue)                        warnings.push(`Étape ${n} : texte/indice vide`);
    if (s.type === 'click' && !s.zone)  warnings.push(`Étape ${n} : zone cliquable non définie`);
  });
  if (warnings.length > 0) {
    const msg = `Problèmes détectés :\n• ${warnings.join('\n• ')}\n\nExporter quand même ?`;
    if (!confirm(msg)) return;
  }
  const cfg  = buildConfig();
  const json = JSON.stringify(cfg, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'game_config.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('game_config.json téléchargé !', 'ok');
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const cfg = JSON.parse(e.target.result);
      loadConfig(cfg);
      dismissStartup();
      toast(`${cfg.steps.length} étape(s) importée(s).`, 'ok');
    } catch(err) {
      toast('Erreur de lecture du JSON.', 'ko');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// Normalise les étapes : gère l'ancien format (code+zone dans une seule étape)
// et le nouveau format (liste plate de défis typés)
function normalizeSteps(rawSteps) {
  const result = [];
  rawSteps.forEach(s => {
    if (!s.type && s.code && s.zone) {
      // Ancien format → split automatique en défi code + défi clic
      result.push({ id: nextId++, type: 'code', image: s.image || '', imageWidth: s.imageWidth || 0, imageHeight: s.imageHeight || 0, clue: s.clue || '', code: s.code, zone: null, success: s.success || '', hint: s.hint || '', hint_image: '', item: null });
      result.push({ id: nextId++, type: 'click', image: '', imageWidth: 0, imageHeight: 0, clue: s.success || '', code: '', zone: s.zone, success: s.successFinal || '', hint: '', hint_image: '', item: null });
    } else {
      result.push({ id: s.id || nextId++, type: s.type || 'code', image: s.image || '', imageWidth: s.imageWidth || 0, imageHeight: s.imageHeight || 0, clue: s.clue || '', code: s.code || '', zone: s.zone || null, success: s.success || '', hint: s.hint || '', hint_image: s.hint_image || '', item: s.item || null });
    }
  });
  return result;
}

function loadConfig(cfg) {
  gameTitle    = cfg.title    || '';
  gameSubtitle = cfg.subtitle || '';
  gameIntro    = cfg.intro    || '';
  document.getElementById('f-game-title').value    = gameTitle;
  document.getElementById('f-game-subtitle').value = gameSubtitle;
  document.getElementById('f-game-intro').value    = gameIntro;
  gameDuration = cfg.duration || 60;
  document.getElementById('f-game-duration').value = gameDuration;
  updateDurationHint();
  victoryMessage = cfg.victoryMessage || '';
  document.getElementById('f-victory-msg').value = victoryMessage;
  steps = normalizeSteps(cfg.steps || []);
  selectedId = null;
  document.getElementById('edit-panel').classList.remove('visible');
  document.getElementById('pano-img').style.display = 'none';
  document.getElementById('pano-img').src = '';
  renderList();
  renderZones();
  if (steps.length > 0) selectStep(steps[0].id);
  autoSave();
}

// ═══════════════════════════════════════════════════════
//  AUTO-SAVE  (localStorage)
// ═══════════════════════════════════════════════════════
function autoSave() {
  try {
    const toSave = steps.map(({ _blobUrl, ...rest }) => rest);
    localStorage.setItem('escape_editor', JSON.stringify({ steps: toSave, nextId, victoryMessage, gameDuration }));
  } catch(e) {}
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem('escape_editor');
    if (!raw) return;
    const data = JSON.parse(raw);
    steps          = normalizeSteps(data.steps || []);
    nextId         = data.nextId || (steps.length + 1);
    gameDuration = data.gameDuration || 60;
    document.getElementById('f-game-duration').value = gameDuration;
    updateDurationHint();
    victoryMessage = data.victoryMessage || '';
    document.getElementById('f-victory-msg').value = victoryMessage;
    renderList();
    renderZones();
    if (steps.length > 0) {
      toast(`${steps.length} défi(s) restauré(s) depuis la session précédente.`, 'info');
      selectStep(steps[0].id);
    }
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════
//  PRÉVISUALISATION INDICE
// ═══════════════════════════════════════════════════════
function caesar(text, shift) {
  const from = 'ÀÂÄÁÃÈÉÊËÎÏÌÍÔÖÒÓÙÚÛÜÝÇàâäáãèéêëîïìíôöòóùúûüýç';
  const to   = 'AAAAAEEEEIIIIOOOOUUUUYCaaaaaeeeeiiiioooouuuuyc';
  return text.split('').map(c => {
    const i = from.indexOf(c);
    const base = (i >= 0 ? to[i] : c).toUpperCase();
    if (/[A-Z]/.test(base))
      return String.fromCharCode(((base.charCodeAt(0) - 65 + shift) % 26) + 65);
    if (c === '-') return '-';
    return '';
  }).join('');
}

function updateCluePreview() {
  const raw = document.getElementById('f-clue').value;
  const el  = document.getElementById('clue-preview');
  if (!raw.trim()) { el.style.display = 'none'; return; }
  const testName    = 'Alice';
  const testEncoded = caesar(testName, 3);
  const rendered    = raw
    .replace(/\{name\}/g, testName)
    .replace(/\{name_encoded\}/g, testEncoded);
  el.textContent  = `Avec « ${testName} » :\n${rendered}`;
  el.style.display = 'block';
}

// ═══════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════
let toastTmr;
function toast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'show ' + type;
  clearTimeout(toastTmr);
  toastTmr = setTimeout(() => { t.className = ''; }, 3500);
}

// ═══════════════════════════════════════════════════════
//  STARTUP
// ═══════════════════════════════════════════════════════
function dismissStartup() {
  document.getElementById('startup-screen').classList.add('hidden');
}
function startupNew() {
  dismissStartup();
}
function startupImport() {
  const fi = document.getElementById('file-input');
  fi.onchange = e => { importJSON(e); fi.onchange = null; };
  fi.click();
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
applyPan(0);
