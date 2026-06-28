// ═══════════════════════════════════════════════════════════
//  CHIFFREMENT CÉSAR  (from=46 chars, to=46 chars)
// ═══════════════════════════════════════════════════════════
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

function renderClue(template) {
  const encoded = caesar(playerName, 3);
  return template
    .replace(/\{name\}/g, playerName)
    .replace(/\{name_encoded\}/g, encoded);
}

// ═══════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════
let PANO_W        = 1360;
let PANO_H        = 972;
let STEPS         = [];
let victoryMsg    = '';
let GAME_DURATION = 3600; // secondes, remplacé par le config

const TOAST_MS = 3500;

// ═══════════════════════════════════════════════════════════
//  ÉTAT
// ═══════════════════════════════════════════════════════════
let playerName    = '';
let panX          = 0;
let panY          = 0;
let zoom          = 1.0;
let centerOffset  = 0;
let panVel        = 0;
let panVelY       = 0;
let rafId         = null;
let isDrag        = false;
let didDrag       = false;
let hadPinch      = false;
let dragStartX    = 0;
let dragStartY    = 0;
let dragStartPan  = 0;
let dragStartPanY = 0;
let lastMoveX     = 0;
let lastMoveY     = 0;
let lastMoveT     = 0;
let pinchDist0    = 0;
let pinchZoom0    = 1.0;
let pinchCx       = 0;
let pinchCy       = 0;
let lastTapT      = 0;
let curStep       = 0;   // index dans STEPS (plus de curPhase : c'est step.type qui sert)
let won           = false;
let hintShown     = false;
let gameStarted   = false;
let timerInterval = null;
let timerSeconds  = 3600;
let timerPaused   = false;
let toastTmr;
let usedHints     = new Set();
let inventory     = [];   // [{name,icon,text,image,stepIdx}, ...]

// Puzzle (taquin) state
let puzzlePieces = [];   // arrangement courant, 9 valeurs (0-7=pièce, 8=vide)
let puzzleEmpty  = 8;    // index de la case vide dans la grille 3×3
let puzzleImgSrc = '';
let puzzleCellW  = 0;
let puzzleCellH  = 0;

// ═══════════════════════════════════════════════════════════
//  GÉOMÉTRIE
// ═══════════════════════════════════════════════════════════
function getVP()    { return document.getElementById('pano-vp'); }
function getScale() { return (getVP().offsetHeight / PANO_H) * zoom; }

function screenToPano(sx, sy) {
  const sc = getScale();
  if (zoom === 1) {
    // En mode original : le strip est positionné via left:centerOffset
    return { px: (sx - centerOffset + panX) / sc, py: sy / sc };
  }
  // En mode zoom : panX/panY couvrent aussi le centrage (valeurs négatives)
  return { px: (sx + panX) / sc, py: (sy + panY) / sc };
}
function panoToScreen(px, py) {
  const sc = getScale();
  if (zoom === 1) {
    return { sx: px * sc + centerOffset - panX, sy: py * sc };
  }
  return { sx: px * sc - panX, sy: py * sc - panY };
}

// ═══════════════════════════════════════════════════════════
//  PAN ENGINE
// ═══════════════════════════════════════════════════════════
function applyPan(x, y) {
  if (y === undefined) y = panY;
  const vp   = getVP();
  const vpW  = vp.offsetWidth;
  const vpH  = vp.offsetHeight;
  const base = vpH / PANO_H;
  const strip = document.getElementById('pano-strip');

  // Effacer tout style inline résiduel (ancienne implémentation)
  strip.style.height = '';
  strip.style.top    = '';

  if (zoom === 1) {
    // ── Comportement original éprouvé (pas de transform scale) ──
    const sc   = base;
    const imgW = PANO_W * sc;
    panY = 0;
    if (imgW <= vpW) {
      centerOffset = Math.round((vpW - imgW) / 2);
      panX = 0;
      strip.style.left      = `${centerOffset}px`;
      strip.style.transform = '';
    } else {
      centerOffset = 0;
      panX = Math.max(0, Math.min(x, imgW - vpW));
      strip.style.left      = '0';
      strip.style.transform = `translateX(-${panX}px)`;
    }
  } else {
    // ── Mode zoom : scale-transform depuis l'origine ──
    const sc   = base * zoom;
    const imgW = PANO_W * sc;
    const imgH = PANO_H * sc;
    panX = imgW <= vpW ? -(vpW - imgW) / 2 : Math.max(0, Math.min(x, imgW - vpW));
    panY = imgH <= vpH ? -(vpH - imgH) / 2 : Math.max(0, Math.min(y, imgH - vpH));
    centerOffset = imgW <= vpW ? Math.round(-panX) : 0;
    strip.style.left      = '0';
    strip.style.transform = `scale(${zoom}) translate(${-panX / zoom}px,${-panY / zoom}px)`;
  }
  updateMinimap();
}

let _zoomHideTmr = null;
function setZoom(newZoom, cx, cy) {
  const vp   = getVP();
  const base = vp.offsetHeight / PANO_H;
  const minZ = Math.max(0.5, vp.offsetWidth / (PANO_W * base));
  newZoom = Math.max(minZ, Math.min(4.0, newZoom));

  // Point pano sous le curseur avant changement de zoom
  const { px: panoX, py: panoY } = screenToPano(cx, cy);

  zoom = newZoom;

  applyPan(panoX * base * zoom - cx, panoY * base * zoom - cy);

  // Indicateur de zoom
  const ind = document.getElementById('zoom-indicator');
  const btn = document.getElementById('zoom-reset-btn');
  if (ind) {
    ind.textContent = '× ' + zoom.toFixed(1);
    ind.classList.add('show');
    clearTimeout(_zoomHideTmr);
    _zoomHideTmr = setTimeout(() => ind.classList.remove('show'), 1500);
  }
  if (btn) btn.style.display = Math.abs(zoom - 1.0) > 0.05 ? 'block' : 'none';
}

function resetZoom() {
  zoom = 1.0;
  applyPan(0, 0);
  const btn = document.getElementById('zoom-reset-btn');
  if (btn) btn.style.display = 'none';
  clearTimeout(_zoomHideTmr);
  const ind = document.getElementById('zoom-indicator');
  if (ind) ind.classList.remove('show');
}

function startInertia() {
  cancelAnimationFrame(rafId);
  const FRICTION = 0.88;
  function step() {
    panVel  *= FRICTION;
    panVelY *= FRICTION;
    if (Math.abs(panVel) < 0.5 && Math.abs(panVelY) < 0.5) { panVel = 0; panVelY = 0; return; }
    applyPan(panX + panVel, panY + panVelY);
    rafId = requestAnimationFrame(step);
  }
  rafId = requestAnimationFrame(step);
}

// ═══════════════════════════════════════════════════════════
//  DRAG — MOUSE
// ═══════════════════════════════════════════════════════════
function onMouseDown(e) {
  if (won) return;
  if (e.target.closest && e.target.closest('button')) return;
  cancelAnimationFrame(rafId);
  isDrag = true; didDrag = false;
  dragStartX = e.clientX; dragStartY = e.clientY;
  dragStartPan = panX; dragStartPanY = panY;
  lastMoveX = e.clientX; lastMoveY = e.clientY; lastMoveT = Date.now();
  getVP().classList.add('dragging');
  e.preventDefault();
}
function onMouseMove(e) {
  if (!isDrag) return;
  const dx = e.clientX - lastMoveX;
  const dy = e.clientY - lastMoveY;
  const dt = Date.now() - lastMoveT;
  panVel  = dt > 0 ? (-dx / dt) * 16 : 0;
  panVelY = dt > 0 ? (-dy / dt) * 16 : 0;
  lastMoveX = e.clientX; lastMoveY = e.clientY; lastMoveT = Date.now();
  if (Math.abs(dragStartX - e.clientX) > 10 || Math.abs(dragStartY - e.clientY) > 10) didDrag = true;
  applyPan(dragStartPan + (dragStartX - e.clientX), dragStartPanY + (dragStartY - e.clientY));
}
function onMouseUp(e) {
  if (!isDrag) return;
  isDrag = false;
  getVP().classList.remove('dragging');
  if (didDrag) { startInertia(); } else { handleClick(e); }
}
function onWheel(e) {
  e.preventDefault();
  const rect  = getVP().getBoundingClientRect();
  const cx    = e.clientX - rect.left;
  const cy    = e.clientY - rect.top;
  const delta = e.deltaY > 0 ? 1 / 1.12 : 1.12;
  setZoom(zoom * delta, cx, cy);
}

// ═══════════════════════════════════════════════════════════
//  DRAG — TOUCH
// ═══════════════════════════════════════════════════════════
function onTouchStart(e) {
  if (won) return;
  if (e.target.closest && e.target.closest('button')) return;

  if (e.touches.length === 2) {
    isDrag = false; hadPinch = true;
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    pinchDist0 = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    pinchZoom0 = zoom;
    pinchCx    = (t0.clientX + t1.clientX) / 2;
    pinchCy    = (t0.clientY + t1.clientY) / 2;
    return;
  }
  if (e.touches.length > 2) return;

  hadPinch = false;
  cancelAnimationFrame(rafId);
  const t = e.touches[0];
  isDrag = true; didDrag = false;
  dragStartX = t.clientX; dragStartY = t.clientY;
  dragStartPan = panX; dragStartPanY = panY;
  lastMoveX = t.clientX; lastMoveY = t.clientY; lastMoveT = Date.now();
}
function onTouchMove(e) {
  // Pinch-to-zoom (2 doigts)
  if (e.touches.length === 2) {
    e.preventDefault();
    hadPinch = true; isDrag = false;
    const t0   = e.touches[0];
    const t1   = e.touches[1];
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    if (pinchDist0 > 10) {
      const rect = getVP().getBoundingClientRect();
      setZoom(pinchZoom0 * (dist / pinchDist0),
              pinchCx - rect.left, pinchCy - rect.top);
    }
    return;
  }
  if (!isDrag) return;
  e.preventDefault();
  const t  = e.touches[0];
  const dx = t.clientX - lastMoveX;
  const dy = t.clientY - lastMoveY;
  const dt = Date.now() - lastMoveT;
  panVel  = dt > 0 ? (-dx / dt) * 16 : 0;
  panVelY = dt > 0 ? (-dy / dt) * 16 : 0;
  lastMoveX = t.clientX; lastMoveY = t.clientY; lastMoveT = Date.now();
  if (Math.abs(dragStartX - t.clientX) > 6 || Math.abs(dragStartY - t.clientY) > 6) didDrag = true;
  applyPan(dragStartPan + (dragStartX - t.clientX), dragStartPanY + (dragStartY - t.clientY));
}
function onTouchEnd(e) {
  if (hadPinch && e.touches.length === 0) { hadPinch = false; isDrag = false; return; }
  if (!isDrag) return;
  isDrag = false;
  if (didDrag) { startInertia(); } else {
    const t = e.changedTouches[0];
    // Double-tap → reset zoom
    const now = Date.now();
    if (now - lastTapT < 300) { lastTapT = 0; resetZoom(); return; }
    lastTapT = now;
    handleClick({ clientX: t.clientX, clientY: t.clientY });
  }
}

// ═══════════════════════════════════════════════════════════
//  CLICK / ZONE CHECK
// ═══════════════════════════════════════════════════════════
function handleClick(e) {
  const step = STEPS[curStep];
  if (won || timerPaused || !step || step.type !== 'click') return;
  if (!document.getElementById('clue-popup').classList.contains('hidden')) return;

  const rect = getVP().getBoundingClientRect();
  const { px, py } = screenToPano(e.clientX - rect.left, e.clientY - rect.top);
  const z = step.zone;
  if (!z || z.w === 0) return;

  const sc  = getScale();
  const PAD = window.matchMedia('(pointer: coarse)').matches ? Math.round(20 / sc) : 0;
  const hit = px >= z.x - PAD && px <= z.x + z.w + PAD &&
              py >= z.y - PAD && py <= z.y + z.h + PAD;

  spawnRipple(e.clientX - rect.left, e.clientY - rect.top, hit ? 'ok' : 'ko');

  if (hit) {
    showSuccessScreen(step);
  } else {
    applyPenalty();
    showToast("Ce n'est pas là… −1 minute !", 'ko');
  }
}

function advanceStep(delay = 0) {
  curStep++;
  if (curStep >= STEPS.length) {
    triggerVictory(delay);
  } else {
    saveProgress();
    setTimeout(() => showChallenge(curStep), delay);
  }
}

function showSuccessScreen(step) {
  const overlay = document.getElementById('step-success');
  const txt = document.getElementById('step-success-txt');
  if (!overlay || !txt) return;

  txt.textContent = renderClue(step?.success || 'Bien trouvé !');

  const itemFound = document.getElementById('ss-item-found');
  if (step?.item && step.item.name) {
    addToInventory(step.item, curStep);
    document.getElementById('ss-item-icon').textContent = step.item.icon || '📦';
    document.getElementById('ss-item-name').textContent = step.item.name;
    if (itemFound) itemFound.style.display = 'block';
  } else {
    if (itemFound) itemFound.style.display = 'none';
  }

  overlay.classList.add('show');
  setTimerPaused(true);
}

function resumeAfterSuccess() {
  const overlay = document.getElementById('step-success');
  if (!overlay || !overlay.classList.contains('show')) return;
  overlay.classList.remove('show');
  setTimerPaused(false);
  advanceStep(0);
}

function triggerVictory(delay) {
  won = true;
  setTimerPaused(false);
  clearInterval(timerInterval);
  clearSave();
  closeClue();
  closeAide();
  document.getElementById('aide-btn').classList.remove('visible');
  const h = Math.floor(timerSeconds / 3600);
  const m = Math.floor((timerSeconds % 3600) / 60);
  const s = timerSeconds % 60;
  document.getElementById('victory-name').textContent = playerName;
  document.getElementById('victory-time').textContent =
    `${h}h ${String(m).padStart(2,'0')}min ${String(s).padStart(2,'0')}s`;
  document.getElementById('victory-msg').textContent =
    victoryMsg || 'Vous avez retrouvé toutes les preuves. Le village peut reprendre son souffle.';
  setTimeout(() => { document.getElementById('victory').style.display = 'flex'; }, delay);
}

function spawnRipple(x, y, cls) {
  const r = document.createElement('div');
  r.className = 'ripple ' + cls;
  r.style.left = x + 'px'; r.style.top = y + 'px';
  getVP().appendChild(r);
  setTimeout(() => r.remove(), 750);
}

// ═══════════════════════════════════════════════════════════
//  PUZZLE — TAQUIN 3×3
// ═══════════════════════════════════════════════════════════
function initPuzzle(step) {
  puzzleImgSrc = step.image;
  puzzlePieces = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  puzzleEmpty  = 8;
  shufflePuzzle();

  const img = new Image();
  img.onload = () => {
    const natW = img.naturalWidth  || 600;
    const natH = img.naturalHeight || 600;
    const maxW = Math.min(window.innerWidth  * 0.85, 480);
    const maxH = window.innerHeight * 0.50;
    let bW = maxW, bH = maxW * natH / natW;
    if (bH > maxH) { bH = maxH; bW = maxH * natW / natH; }
    puzzleCellW = Math.floor((bW - 6) / 3);
    puzzleCellH = Math.floor((bH - 6) / 3);
    renderPuzzleBoard();
  };
  img.onerror = () => {
    puzzleCellW = puzzleCellH = 120;
    renderPuzzleBoard();
  };
  img.src = step.image;
}

function shufflePuzzle() {
  let lastEmpty = -1;
  for (let i = 0; i < 300; i++) {
    const neighbors = getPuzzleMovable().filter(p => p !== lastEmpty);
    const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
    lastEmpty = puzzleEmpty;
    puzzleSwap(pick);
  }
}

function getPuzzleMovable() {
  const r = Math.floor(puzzleEmpty / 3), c = puzzleEmpty % 3, res = [];
  if (r > 0) res.push(puzzleEmpty - 3);
  if (r < 2) res.push(puzzleEmpty + 3);
  if (c > 0) res.push(puzzleEmpty - 1);
  if (c < 2) res.push(puzzleEmpty + 1);
  return res;
}

function puzzleSwap(pos) {
  puzzlePieces[puzzleEmpty] = puzzlePieces[pos];
  puzzlePieces[pos] = 8;
  puzzleEmpty = pos;
}

function isPuzzleSolved() {
  return puzzlePieces.every((p, i) => p === i);
}

function renderPuzzleBoard() {
  const board = document.getElementById('puzzle-board');
  board.innerHTML = '';
  board.style.width  = (puzzleCellW * 3 + 6) + 'px';
  board.style.height = (puzzleCellH * 3 + 6) + 'px';
  for (let i = 0; i < 9; i++) {
    const pieceIdx = puzzlePieces[i];
    const cell = document.createElement('div');
    cell.className = 'puzzle-cell' + (pieceIdx === 8 ? ' empty' : '');
    cell.style.width  = puzzleCellW + 'px';
    cell.style.height = puzzleCellH + 'px';
    if (pieceIdx !== 8) {
      const pc = pieceIdx % 3, pr = Math.floor(pieceIdx / 3);
      cell.style.backgroundImage    = `url('${puzzleImgSrc}')`;
      cell.style.backgroundSize     = `${puzzleCellW * 3}px ${puzzleCellH * 3}px`;
      cell.style.backgroundPosition = `-${pc * puzzleCellW}px -${pr * puzzleCellH}px`;
    }
    cell.addEventListener('click', () => onPuzzleClick(i));
    cell.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); onPuzzleClick(i); }, { passive: false });
    board.appendChild(cell);
  }
}

function onPuzzleClick(pos) {
  if (!getPuzzleMovable().includes(pos)) return;
  const prevEmpty = puzzleEmpty;
  puzzleSwap(pos);
  renderPuzzleBoard();
  // Anime la pièce qui vient d'arriver à prevEmpty
  const cells = document.querySelectorAll('.puzzle-cell');
  if (cells[prevEmpty]) {
    cells[prevEmpty].classList.add('pop');
    cells[prevEmpty].addEventListener('animationend', () => cells[prevEmpty]?.classList.remove('pop'), { once: true });
  }
  if (isPuzzleSolved()) {
    setTimeout(() => {
      document.getElementById('puzzle-modal').classList.add('hidden');
      showSuccessScreen(STEPS[curStep]);
    }, 450);
  }
}

// ═══════════════════════════════════════════════════════════
//  CHALLENGE ENGINE  (remplace showPhase)
// ═══════════════════════════════════════════════════════════
function updateHintUi() {
  const step = STEPS[curStep];
  if (!step) return;

  const hasHint  = !!(step.hint && step.hint.trim());
  const hintUsed = usedHints.has(curStep);

  const codeRow   = document.getElementById('cm-hint-row');
  const vpBtn     = document.getElementById('vp-hint-btn');
  const puzzleRow = document.getElementById('pm-hint-row');
  const t9Row     = document.getElementById('t9-hint-row');

  // Bouton "indice" dans le panorama (clic) : disparaît après usage car l'indice est affiché dans le popup d'énoncé
  if (vpBtn) vpBtn.style.display = (step.type === 'click' && hasHint && !hintUsed) ? 'block' : 'none';

  // Boutons indice dans les modales code/puzzle/t9 : restent visibles après usage pour permettre de revoir
  [[codeRow, 'code'], [puzzleRow, 'puzzle'], [t9Row, 't9']].forEach(([row, type]) => {
    if (!row) return;
    if (step.type !== type || !hasHint) { row.style.display = 'none'; return; }
    row.style.display = 'block';
    const btn = row.querySelector('button');
    if (!btn) return;
    if (hintUsed) {
      btn.textContent = '💡 Revoir l\'indice';
      btn.onclick = reopenHint;
    } else {
      btn.textContent = '💡 Voir un indice (−1 min)';
      btn.onclick = openHintConfirm;
    }
  });
}

function reopenHint() {
  document.getElementById('hint-popup').classList.remove('hidden');
}

function openAide() {
  const step = STEPS[curStep];
  if (!step) return;

  document.getElementById('aide-lbl-txt').textContent =
    `Défi ${curStep + 1}/${STEPS.length} — Énigme & indice`;
  document.getElementById('aide-clue-txt').textContent = renderClue(step.clue || '');

  const hintSec  = document.getElementById('aide-hint-section');
  const hasHint  = !!(step.hint && step.hint.trim());
  const hintUsed = usedHints.has(curStep);

  hintSec.innerHTML = '';

  if (hasHint) {
    const divider = document.createElement('div');
    divider.className = 'aide-divider';
    hintSec.appendChild(divider);

    const ttl = document.createElement('div');
    ttl.className = 'aide-hint-ttl';

    if (!hintUsed) {
      ttl.textContent = 'INDICE';
      hintSec.appendChild(ttl);
      const btn = document.createElement('button');
      btn.className = 'aide-hint-buy-btn';
      btn.textContent = '💡 Voir un indice (−1 min)';
      btn.addEventListener('click', () => { closeAide(); openHintConfirm(); });
      hintSec.appendChild(btn);
    } else {
      ttl.textContent = '💡 Indice dévoilé';
      hintSec.appendChild(ttl);
      const txt = document.createElement('div');
      txt.className = 'aide-hint-txt';
      txt.textContent = renderClue(step.hint);
      hintSec.appendChild(txt);
      if (step.hint_image) {
        const img = document.createElement('img');
        img.src = step.hint_image;
        img.alt = 'indice';
        img.className = 'aide-hint-img';
        hintSec.appendChild(img);
      }
    }
  }

  document.getElementById('aide-popup').classList.remove('hidden');
}

function closeAide() {
  document.getElementById('aide-popup').classList.add('hidden');
}

function showChallenge(n) {
  curStep = n;
  const step = STEPS[n];
  if (!step) return;

  // Réinitialise toujours le zoom au changement d'étape
  zoom = 1.0; panX = 0; panY = 0;
  // Charge l'image si ce défi en définit une (resetZoom appelé dans onload)
  if (step.image) setStepImage(step);

  const total = STEPS.length;
  const lbl   = `Défi ${n + 1} / ${total}`;
  document.getElementById('prog-txt').textContent = lbl;
  document.querySelectorAll('.sd').forEach((d, i) => {
    d.className = 'sd' + (i < n ? ' done' : '') + (i === n ? ' cur' : '');
  });

  if (step.type === 'code') {
    document.getElementById('phase-badge').textContent = '🔐 Code';
    document.getElementById('phase-badge').className   = 'code';
    document.getElementById('cm-lbl').textContent      = lbl;
    document.getElementById('cm-clue-txt').textContent = renderClue(step.clue || '');
    document.getElementById('cm-error').textContent    = '';
    initCryptex(step.code || 'A');
    document.getElementById('code-modal').classList.remove('hidden');
    document.getElementById('puzzle-modal').classList.add('hidden');
    document.getElementById('t9-modal').classList.add('hidden');
    document.getElementById('clue-popup').classList.add('hidden');
    document.getElementById('clue-toggle').classList.remove('visible');
    saveProgress();
  } else if (step.type === 'puzzle') {
    document.getElementById('phase-badge').textContent = '🧩 Puzzle';
    document.getElementById('phase-badge').className   = 'puzzle';
    document.getElementById('code-modal').classList.add('hidden');
    document.getElementById('t9-modal').classList.add('hidden');
    document.getElementById('clue-popup').classList.add('hidden');
    document.getElementById('clue-toggle').classList.remove('visible');
    document.getElementById('pm-lbl').textContent      = lbl;
    document.getElementById('pm-clue-txt').textContent = renderClue(step.clue || '');
    document.getElementById('pm-timer').textContent    = formatTimer(timerSeconds);
    initPuzzle(step);
    document.getElementById('puzzle-modal').classList.remove('hidden');
    saveProgress();
  } else if (step.type === 't9') {
    document.getElementById('phase-badge').textContent = '📱 T9';
    document.getElementById('phase-badge').className   = 't9';
    document.getElementById('code-modal').classList.add('hidden');
    document.getElementById('puzzle-modal').classList.add('hidden');
    document.getElementById('clue-popup').classList.add('hidden');
    document.getElementById('clue-toggle').classList.remove('visible');
    document.getElementById('t9-lbl').textContent      = lbl;
    document.getElementById('t9-clue-txt').textContent = renderClue(step.clue || '');
    document.getElementById('t9-error').textContent    = '';
    initT9();
    document.getElementById('t9-modal').classList.remove('hidden');
    saveProgress();
  } else {
    // type === 'click'
    document.getElementById('phase-badge').textContent = '🗺 Trouver';
    document.getElementById('phase-badge').className   = 'click';
    document.getElementById('code-modal').classList.add('hidden');
    document.getElementById('puzzle-modal').classList.add('hidden');
    document.getElementById('t9-modal').classList.add('hidden');

    const z = step.zone;
    if (!z || z.w === 0) {
      showToast('Zone non définie — défi ignoré.', 'ko');
      if (n + 1 < STEPS.length) setTimeout(() => showChallenge(n + 1), 2200);
      return;
    }

    document.getElementById('clue-txt').textContent = renderClue(step.clue || '');
    document.getElementById('clue-lbl').textContent = lbl;
    openClue();
    saveProgress();
  }

  updateHintUi();
  document.getElementById('hint-popup').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════
//  CRYPTEX
// ═══════════════════════════════════════════════════════════
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let ringVals   = [];   // current letter index (0-25) per ring
let focusedRing = 0;  // ring with keyboard focus

function initCryptex(code) {
  ringVals    = Array.from({ length: code.length }, () => 0);
  focusedRing = 0;
  buildCryptex(code.length);
}

function buildCryptex(len) {
  const wrap = document.getElementById('cx-rings');
  wrap.innerHTML = '';
  for (let i = 0; i < len; i++) {
    const ring = document.createElement('div');
    ring.className = 'cx-ring';
    ring.dataset.i = i;
    ring.innerHTML = `
      <button class="cx-ring-btn" data-dir="-1">▲</button>
      <div class="cx-drum" id="cxd-${i}"></div>
      <button class="cx-ring-btn" data-dir="1">▼</button>`;
    wrap.appendChild(ring);
    renderDrum(i);
    ring.querySelectorAll('.cx-ring-btn').forEach(btn => {
      const dir = Number(btn.dataset.dir);
      btn.addEventListener('click', () => ringMove(i, dir));
      btn.addEventListener('touchstart', e => {
        e.stopPropagation();
        e.preventDefault();
        ringMove(i, dir);
      }, { passive: false });
    });
    attachRingInput(ring, i);
  }
}

function renderDrum(i) {
  const drum = document.getElementById(`cxd-${i}`);
  if (!drum) return;
  const v = ringVals[i];
  drum.innerHTML = [
    `<div class="cx-l cx-l-2">${ALPHA[(v-2+26)%26]}</div>`,
    `<div class="cx-l cx-l-1">${ALPHA[(v-1+26)%26]}</div>`,
    `<div class="cx-l cx-l-0">${ALPHA[v]}</div>`,
    `<div class="cx-l cx-l-1">${ALPHA[(v+1)%26]}</div>`,
    `<div class="cx-l cx-l-2">${ALPHA[(v+2)%26]}</div>`,
  ].join('');
}

function ringMove(i, dir) {
  ringVals[i] = (ringVals[i] + dir + 26) % 26;
  renderDrum(i);
}

function attachRingInput(ring, i) {
  // Molette
  ring.addEventListener('wheel', e => {
    e.preventDefault();
    ringMove(i, e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  // Touch swipe vertical
  let ty0 = null, tyL = null;
  ring.addEventListener('touchstart', e => {
    if (e.target.closest('button')) return; // laisser les boutons ▲▼ fonctionner
    ty0 = tyL = e.touches[0].clientY;
    e.preventDefault();
  }, { passive: false });
  ring.addEventListener('touchmove', e => {
    if (tyL === null) return;
    const dy = tyL - e.touches[0].clientY;
    if (Math.abs(dy) >= 10) { ringMove(i, dy > 0 ? 1 : -1); tyL = e.touches[0].clientY; }
    e.preventDefault();
  }, { passive: false });
  ring.addEventListener('touchend', () => { ty0 = tyL = null; });
  // Click → focus
  ring.addEventListener('mousedown', () => { focusedRing = i; });
}

function validateCryptex() {
  const step     = STEPS[curStep];
  const expected = (step?.code || '').toUpperCase().trim();
  const entered  = ringVals.map(v => ALPHA[v]).join('');
  if (entered === expected) {
    const rings = document.getElementById('cx-rings');
    rings.style.cssText += '; filter: brightness(1.4)';
    setTimeout(() => { rings.style.filter = ''; showSuccessScreen(step); }, 400);
  } else {
    document.getElementById('cx-rings').classList.add('shake');
    setTimeout(() => document.getElementById('cx-rings').classList.remove('shake'), 420);
    document.getElementById('cm-error').textContent = 'Code incorrect — réessaie (−1 min)';
    setTimeout(() => document.getElementById('cm-error').textContent = '', 2200);
    applyPenalty();
  }
}

document.addEventListener('keydown', e => {
  if (STEPS[curStep]?.type === 'code' && !document.getElementById('code-modal').classList.contains('hidden')) {
    if (e.key === 'Enter') { e.preventDefault(); validateCryptex(); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); ringMove(focusedRing, -1); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); ringMove(focusedRing, +1); return; }
    if (e.key === 'ArrowLeft'  && focusedRing > 0)                       { focusedRing--; return; }
    if (e.key === 'ArrowRight' && focusedRing < ringVals.length - 1)     { focusedRing++; return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      focusedRing = (focusedRing + (e.shiftKey ? -1 : 1) + ringVals.length) % ringVals.length;
      return;
    }
    if (/^[a-zA-Z]$/.test(e.key)) {
      ringVals[focusedRing] = ALPHA.indexOf(e.key.toUpperCase());
      renderDrum(focusedRing);
      if (focusedRing < ringVals.length - 1) focusedRing++;
    }
  }
});

// ═══════════════════════════════════════════════════════════
//  CLUE POPUP
// ═══════════════════════════════════════════════════════════
function openClue() {
  const step = STEPS[curStep];
  const section = document.getElementById('clue-hint-section');
  const hintTxt = document.getElementById('clue-hint-txt');
  if (step && usedHints.has(curStep) && step.hint) {
    hintTxt.textContent = renderClue(step.hint);
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
  }
  const buyRow = document.getElementById('cp-hint-buy');
  if (buyRow) {
    const canBuy = step && step.hint && step.hint.trim() && !usedHints.has(curStep) && step.type === 'click';
    buyRow.style.display = canBuy ? 'block' : 'none';
  }
  document.getElementById('clue-popup').classList.remove('hidden');
  document.getElementById('clue-toggle').classList.remove('visible');
}
function closeClue() {
  document.getElementById('clue-popup').classList.add('hidden');
  document.getElementById('clue-toggle').classList.add('visible');
}

// ═══════════════════════════════════════════════════════════
//  HINT
// ═══════════════════════════════════════════════════════════
function openHintConfirm() {
  const step = STEPS[curStep];
  if (!step || !step.hint || !step.hint.trim()) return;
  if (usedHints.has(curStep)) return;
  document.getElementById('hint-confirm').classList.add('show');
}
function closeHintConfirm() {
  document.getElementById('hint-confirm').classList.remove('show');
}
function confirmHint() {
  closeHintConfirm();
  applyPenalty();
  usedHints.add(curStep);
  updateHintUi();
  const buyRow = document.getElementById('cp-hint-buy');
  if (buyRow) buyRow.style.display = 'none';
  const step = STEPS[curStep];
  const hintText = renderClue(step?.hint || '');
  document.getElementById('hint-txt').textContent = hintText;
  const hintImgWrap = document.getElementById('hint-img-wrap');
  const hintImg     = document.getElementById('hint-img');
  if (step?.hint_image) {
    hintImg.src = step.hint_image;
    hintImgWrap.style.display = 'block';
  } else {
    hintImgWrap.style.display = 'none';
  }
  document.getElementById('hint-popup').classList.remove('hidden');
  // met aussi à jour le clue popup si l'indice de base est déjà visible
  const section = document.getElementById('clue-hint-section');
  const hintTxt = document.getElementById('clue-hint-txt');
  if (section && hintTxt) {
    hintTxt.textContent = hintText;
    section.style.display = 'block';
  }
}
function closeHint() {
  document.getElementById('hint-popup').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════
//  MINIMAP
// ═══════════════════════════════════════════════════════════
function updateMinimap() {
  const sc   = getScale();
  const imgW = PANO_W * sc;
  const vpW  = getVP().offsetWidth;
  const th   = document.getElementById('mm-thumb');
  if (imgW <= vpW) { th.style.width = '100%'; th.style.left = '0%'; return; }
  const ratio  = vpW / imgW;
  const offset = panX / imgW;
  th.style.width = (ratio * 100).toFixed(2) + '%';
  th.style.left  = (offset * 100).toFixed(2) + '%';
}

// ═══════════════════════════════════════════════════════════
//  TIMER & PENALTY
// ═══════════════════════════════════════════════════════════
function startTimer(seconds = 3600) {
  clearInterval(timerInterval);
  timerSeconds = seconds;
  timerPaused = false;
  renderTimer();
  timerInterval = setInterval(() => {
    if (won || timerPaused) return;
    timerSeconds--;
    renderTimer();
    if (timerSeconds % 10 === 0) saveProgress();
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      timerSeconds = 0;
      renderTimer();
      closeAide();
      document.getElementById('aide-btn').classList.remove('visible');
      document.getElementById('game-over').style.display = 'flex';
    }
  }, 1000);
}

function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function renderTimer() {
  const txt = `${timerPaused ? '⏸ ' : ''}${formatTimer(timerSeconds)}`;
  const warn = timerSeconds <= 300 && !timerPaused;
  const timerEl   = document.getElementById('timer');
  const cmTimerEl = document.getElementById('cm-timer');
  const pmTimerEl = document.getElementById('pm-timer');
  const ssTimerEl = document.getElementById('ss-timer');
  timerEl.textContent = txt;
  timerEl.classList.toggle('warning', warn);
  timerEl.classList.toggle('paused', timerPaused);
  cmTimerEl.textContent = txt;
  cmTimerEl.classList.toggle('warning', warn);
  cmTimerEl.classList.toggle('paused', timerPaused);
  if (pmTimerEl) {
    pmTimerEl.textContent = txt;
    pmTimerEl.classList.toggle('warning', warn);
    pmTimerEl.classList.toggle('paused', timerPaused);
  }
  const t9TimerEl = document.getElementById('t9-timer');
  if (t9TimerEl) {
    t9TimerEl.textContent = txt;
    t9TimerEl.classList.toggle('warning', warn);
    t9TimerEl.classList.toggle('paused', timerPaused);
  }
  ssTimerEl.textContent = formatTimer(timerSeconds);
  ssTimerEl.classList.toggle('warning', timerSeconds <= 300);
}

function setTimerPaused(paused) {
  timerPaused = paused;
  renderTimer();
}

// ═══════════════════════════════════════════════════════════
//  INVENTAIRE
// ═══════════════════════════════════════════════════════════
function addToInventory(item, stepIdx) {
  if (!item || inventory.find(i => i.stepIdx === stepIdx)) return;
  inventory.push({ ...item, stepIdx });
  renderInventoryButton();
}

function renderInventoryButton() {
  const btn = document.getElementById('inv-btn');
  const cnt = document.getElementById('inv-count');
  if (!btn || !cnt) return;
  cnt.textContent = inventory.length;
  if (inventory.length > 0) btn.classList.add('active');
  else btn.classList.remove('active');
}

function openInventory() {
  showInventoryList();
  document.getElementById('inv-panel').classList.remove('hidden');
}

function closeInventory() {
  document.getElementById('inv-panel').classList.add('hidden');
}

function showInventoryList() {
  const list = document.getElementById('inv-list');
  if (inventory.length === 0) {
    list.innerHTML = '<div class="inv-empty">Votre inventaire est vide.</div>';
  } else {
    list.innerHTML = inventory.map((item, idx) => `
      <div class="inv-item" onclick="showItemDetail(${idx})">
        <span class="inv-item-icon">${item.icon || '📦'}</span>
        <span class="inv-item-name">${item.name}</span>
        <span class="inv-item-arr">→</span>
      </div>`).join('');
  }
  document.getElementById('inv-list-view').style.display = 'flex';
  document.getElementById('inv-detail-view').style.display = 'none';
}

function showItemDetail(idx) {
  const item = inventory[idx];
  if (!item) return;
  document.getElementById('inv-detail-title').textContent = `${item.icon || '📦'} ${item.name}`;
  let html = '';
  if (item.image) html += `<img src="${item.image}" alt="${item.name}">`;
  if (item.text)  html += `<pre>${item.text}</pre>`;
  if (!html)      html  = '<p style="color:var(--muted);font-style:italic">Pas de contenu supplémentaire.</p>';
  document.getElementById('inv-detail-body').innerHTML = html;
  document.getElementById('inv-list-view').style.display = 'none';
  document.getElementById('inv-detail-view').style.display = 'flex';
}

function applyPenalty() {
  timerSeconds = Math.max(0, timerSeconds - 60);
  renderTimer();
  const el = document.getElementById('penalty-flash');
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

// ═══════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'show ' + type;
  clearTimeout(toastTmr);
  toastTmr = setTimeout(() => { t.className = ''; }, TOAST_MS);
}

// ═══════════════════════════════════════════════════════════
//  SAUVEGARDE / REPRISE
// ═══════════════════════════════════════════════════════════
function saveProgress() {
  if (!gameStarted || won) return;
  try {
    localStorage.setItem('escape_game_save', JSON.stringify({
      playerName, curStep, timerSeconds,
      inventorySteps: inventory.map(i => i.stepIdx)
    }));
  } catch(e) {}
}

function getSavedGame() {
  try {
    const raw = localStorage.getItem('escape_game_save');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearSave() {
  localStorage.removeItem('escape_game_save');
}

function resumeGame() {
  if (gameStarted) return;
  const save = getSavedGame();
  if (!save || !STEPS.length) return;
  gameStarted  = true;
  playerName   = save.playerName;
  curStep      = Math.min(save.curStep || 0, STEPS.length - 1);
  timerSeconds = save.timerSeconds || GAME_DURATION;
  inventory = [];
  (save.inventorySteps || []).forEach(stepIdx => {
    const s = STEPS[stepIdx];
    if (s?.item) addToInventory(s.item, stepIdx);
  });
  launchGame(curStep);
}

// ═══════════════════════════════════════════════════════════
//  CHARGEMENT CONFIG
// ═══════════════════════════════════════════════════════════
async function loadConfig() {
  try {
    const cfg = await fetch('game_config.json').then(r => r.json());
    document.getElementById('welcome-title').textContent = cfg.title    || '';
    document.getElementById('welcome-tag').textContent   = cfg.subtitle || '';
    document.getElementById('welcome-story').textContent = cfg.intro    || '';
    document.title = cfg.title || document.title;
    victoryMsg    = cfg.victoryMessage || '';
    GAME_DURATION = (cfg.duration || 60) * 60;
    STEPS = (cfg.steps || []).map(s => ({
      type:        s.type || 'code',
      image:       s.image       || '',
      imageWidth:  s.imageWidth  || 0,
      imageHeight: s.imageHeight || 0,
      clue:        s.clue        || '',
      code:        (s.code || '').toUpperCase().trim(),
      zone:        s.zone || null,
      // compatibilité ancien format : successFinal → success pour les clics
      success:     s.success || s.successFinal || 'Bien trouvé !',
      hint:        s.hint || '',
      hint_image:  s.hint_image || '',
      item:        s.item || null,
    }));
  } catch {
    document.getElementById('cfg-missing').style.display = 'block';
  }
}

function setStepImage(step) {
  if (!step.image) return;
  PANO_W = step.imageWidth  || PANO_W;
  PANO_H = step.imageHeight || PANO_H;
  const img = document.getElementById('pano-img');
  if (img.getAttribute('data-step') !== step.image) {
    img.setAttribute('data-step', step.image);
    img.onload = () => {
      PANO_W = img.naturalWidth  || PANO_W;
      PANO_H = img.naturalHeight || PANO_H;
      requestAnimationFrame(() => resetZoom());
    };
    img.src = step.image;
  } else {
    // Même image déjà chargée : reset le pan sans recharger
    requestAnimationFrame(() => resetZoom());
  }
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
function startGame() {
  if (gameStarted) return;
  if (STEPS.length === 0) {
    showToast("Aucune étape configurée. Crée d'abord le jeu dans l'éditeur.", 'ko');
    return;
  }
  gameStarted  = true;
  usedHints.clear();
  inventory = []; renderInventoryButton();
  playerName   = document.getElementById('player-name-input').value.trim() || 'Joueur';
  timerSeconds = GAME_DURATION;
  clearSave();
  launchGame(0);
}

function launchGame(startStep = 0) {
  curStep = startStep;
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('game').style.display = 'flex';
  document.getElementById('hdr-ttl').textContent = `Village Mystère · ${playerName}`;

  const sd = document.getElementById('sdots');
  sd.innerHTML = '';
  STEPS.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'sd'; d.id = 'sd-' + i;
    sd.appendChild(d);
  });

  const vp = getVP();
  vp.addEventListener('mousedown',  onMouseDown);
  vp.addEventListener('mousemove',  onMouseMove);
  vp.addEventListener('mouseup',    onMouseUp);
  vp.addEventListener('mouseleave', onMouseUp);
  vp.addEventListener('touchstart', onTouchStart, { passive: true });
  vp.addEventListener('touchmove',  onTouchMove,  { passive: false });
  vp.addEventListener('touchend',   onTouchEnd);
  vp.addEventListener('wheel',      onWheel,       { passive: false });
  vp.addEventListener('dblclick',   resetZoom);

  vp.addEventListener('mousedown', () => {
    if (!hintShown) {
      hintShown = true;
      const hint = document.getElementById('drag-hint');
      if (hint) { hint.style.opacity = '0'; setTimeout(() => hint.remove(), 600); }
    }
  }, { once: true });

  window.addEventListener('resize', () => applyPan(panX, panY));

  requestAnimationFrame(() => resetZoom());
  startTimer(timerSeconds);
  document.getElementById('aide-btn').classList.add('visible');
  showChallenge(curStep);
}

// ═══════════════════════════════════════════════════════════
//  T9  — multi-tap Nokia : lettres réelles, commit auto 800ms
// ═══════════════════════════════════════════════════════════
const T9_MAP = { '2':'ABC','3':'DEF','4':'GHI','5':'JKL','6':'MNO','7':'PQRS','8':'TUV','9':'WXYZ' };
const T9_DELAY = 800;

let t9Word       = '';   // lettres commitées
let t9PKey       = '';   // touche en cours de multi-tap
let t9PIdx       = 0;    // combien de fois cette touche a été tapée (index modulo)
let t9Timer      = null;

function initT9() {
  t9Word = ''; t9PKey = ''; t9PIdx = 0;
  clearTimeout(t9Timer); t9Timer = null;
  renderT9Screen();
}

function t9CommitPending() {
  clearTimeout(t9Timer); t9Timer = null;
  if (!t9PKey) return;
  const letters = T9_MAP[t9PKey] || '';
  if (letters) t9Word += letters[t9PIdx % letters.length];
  t9PKey = ''; t9PIdx = 0;
}

function t9Full() {
  if (!t9PKey) return t9Word;
  const letters = T9_MAP[t9PKey] || '';
  return t9Word + (letters[t9PIdx % letters.length] || '');
}

function renderT9Screen() {
  const screen = document.getElementById('t9-screen');
  if (!screen) return;
  const code    = (STEPS[curStep]?.code || '').trim().toUpperCase();
  const maxLen  = code.length;
  const full    = t9Full();
  if (!full.length) {
    const placeholders = maxLen > 0
      ? Array.from({ length: maxLen }, () => '<span style="color:#0d2218">_</span>').join('')
      : '<span style="color:#0d2218;font-size:.9rem;letter-spacing:.05em">· · ·</span>';
    screen.innerHTML = placeholders;
    return;
  }
  let html = '';
  for (let i = 0; i < t9Word.length; i++) {
    html += `<span>${t9Word[i] === ' ' ? '&nbsp;' : t9Word[i]}</span>`;
  }
  if (t9PKey) {
    const ch = (T9_MAP[t9PKey] || '')[t9PIdx % (T9_MAP[t9PKey]?.length || 1)] || '';
    html += `<span class="t9-pending">${ch}</span>`;
  }
  for (let i = full.length; i < maxLen; i++) {
    html += `<span style="color:#0d2218">_</span>`;
  }
  if (!t9PKey && (full.length < maxLen || !maxLen)) {
    html += `<span class="t9-pending" style="font-size:.9rem;padding:0 1px;border-bottom:none">▮</span>`;
  }
  screen.innerHTML = html;
}

function t9Press(key) {
  const code   = (STEPS[curStep]?.code || '').trim().toUpperCase();
  const maxLen = code.length;
  if (maxLen > 0 && t9Full().length >= maxLen) return;

  // 0 → espace direct (pas de multi-tap)
  if (key === '0') { t9CommitPending(); t9Word += ' '; renderT9Screen(); return; }

  if (t9PKey === key) {
    t9PIdx++; // cycle vers la lettre suivante
  } else {
    t9CommitPending(); // commit la lettre précédente
    t9PKey = key; t9PIdx = 0;
  }

  clearTimeout(t9Timer);
  t9Timer = setTimeout(() => { t9CommitPending(); renderT9Screen(); }, T9_DELAY);
  renderT9Screen();
}

function t9Back() {
  clearTimeout(t9Timer); t9Timer = null;
  if (t9PKey) { t9PKey = ''; t9PIdx = 0; }
  else if (t9Word.length) { t9Word = t9Word.slice(0, -1); }
  renderT9Screen();
}

function t9Validate() {
  t9CommitPending(); // finalise la lettre en attente
  renderT9Screen();

  const step     = STEPS[curStep];
  const expected = (step?.code || '').trim().toUpperCase();
  if (!expected) {
    document.getElementById('t9-error').textContent = 'Aucun mot défini pour ce défi.';
    return;
  }
  if (!t9Word.length) return;
  if (t9Word.toUpperCase() === expected) {
    const phone = document.getElementById('t9-phone');
    if (phone) { phone.style.filter = 'brightness(1.5)'; setTimeout(() => { phone.style.filter = ''; showSuccessScreen(step); }, 380); }
    else showSuccessScreen(step);
  } else {
    const phone = document.getElementById('t9-phone');
    if (phone) { phone.classList.add('t9-shake'); setTimeout(() => phone.classList.remove('t9-shake'), 420); }
    document.getElementById('t9-error').textContent = 'Incorrect — réessaie (−1 min)';
    setTimeout(() => document.getElementById('t9-error').textContent = '', 2200);
    applyPenalty();
    t9Word = ''; t9PKey = ''; t9PIdx = 0;
    setTimeout(renderT9Screen, 420);
  }
}

// ═══════════════════════════════════════════════════════════
function restartGame() {
  won = false; curStep = 0;
  usedHints.clear();
  inventory = []; renderInventoryButton();
  setTimerPaused(false);
  document.getElementById('step-success').classList.remove('show');
  clearSave();
  document.getElementById('victory').style.display   = 'none';
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('aide-btn').classList.add('visible');
  resetZoom();
  startTimer(GAME_DURATION);
  showChallenge(0);
}

loadConfig().then(() => {
  const save = getSavedGame();
  if (save && STEPS.length > 0 && (save.curStep || 0) < STEPS.length) {
    const btn = document.getElementById('btn-resume');
    btn.textContent = `↩ Reprendre — ${save.playerName}`;
    btn.style.display = 'block';
  }
});
