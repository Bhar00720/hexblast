// ============================================================
// HEX BLAST — Production-Grade Puzzle Engine
// Corelume Tech © 2026
// ============================================================

// === SOUND ENGINE (Web Audio API — procedural, zero files) ===
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let sfxVol = 0.7, musicVol = 0.4;
let bgOsc = null, bgGain = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new AudioCtx();
}

function playTone(freq, dur, type, vol, detune) {
  if (!audioCtx || sfxVol === 0) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  g.gain.setValueAtTime(vol * sfxVol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + dur);
}

function sfxPop(chain) { playTone(400 + chain * 80, 0.15, 'sine', 0.3, chain * 30); }
function sfxCascade() { playTone(600, 0.3, 'triangle', 0.2); setTimeout(() => playTone(800, 0.2, 'triangle', 0.15), 100); }
function sfxCombo(n) { for (let i = 0; i < Math.min(n, 5); i++) setTimeout(() => playTone(500 + i * 100, 0.12, 'sine', 0.25), i * 60); }
function sfxLevelUp() { [600, 800, 1000, 1200].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sine', 0.3), i * 80)); }
function sfxGameOver() { [400, 300, 200].forEach((f, i) => setTimeout(() => playTone(f, 0.4, 'sawtooth', 0.15), i * 150)); }
function sfxClick() { playTone(800, 0.06, 'sine', 0.15); }
function sfxSpecial() { playTone(1000, 0.3, 'sine', 0.3); setTimeout(() => playTone(1200, 0.3, 'sine', 0.2), 100); }
function sfxFrozen() { playTone(200, 0.2, 'sawtooth', 0.2); }

function startBgMusic() {
  if (!audioCtx || bgOsc) return;
  bgOsc = audioCtx.createOscillator();
  bgGain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  bgOsc.type = 'sine'; bgOsc.frequency.value = 120;
  filter.type = 'lowpass'; filter.frequency.value = 300;
  bgGain.gain.value = musicVol * 0.08;
  bgOsc.connect(filter); filter.connect(bgGain); bgGain.connect(audioCtx.destination);
  bgOsc.start();
}

function stopBgMusic() { if (bgOsc) { bgOsc.stop(); bgOsc = null; } }

// === GAME STATE ===
const c = document.getElementById('c'), ctx = c.getContext('2d');
let W, H, HR = 28, cols, rows, grid = [], score = 0, level = 1;
let moves = 30, st = 'menu', hi = 0, gamesPlayed = 0, pts = [], hov = null;
let gameMode = 'classic', difficulty = 'normal';
let comboCount = 0, comboTimer = 0, maxCombo = 0, chainCount = 0, specialsUsed = 0;
let timeLeft = 90, timerInterval = null;
let undoStack = [], animating = false;
let challengeTarget = 500, challengeLevel = 1;
let floatingTexts = []; // {x, y, text, life, color}
let kbCursor = null; // keyboard cursor {c, r}
let kbCursorBlink = 0;

const COLORS_MAP = {
  neon:   ['#22c55e', '#8b5cf6', '#3b82f6', '#ef4444', '#f59e0b', '#ec4899'],
  ocean:  ['#06b6d4', '#0ea5e9', '#38bdf8', '#2dd4bf', '#a78bfa', '#f472b6'],
  forest: ['#4ade80', '#a3e635', '#22d3ee', '#fbbf24', '#f87171', '#c084fc'],
  sunset: ['#f97316', '#f43f5e', '#fb923c', '#fbbf24', '#a78bfa', '#34d399'],
  mono:   ['#ffffff', '#cccccc', '#999999', '#666666', '#aaaaaa', '#dddddd']
};
let CL = COLORS_MAP.neon;
let currentTheme = 'neon';

const DIFF = {
  casual:  { colors: 3, moves: 40, speed: 0.8 },
  normal:  { colors: 4, moves: 30, speed: 1.0 },
  expert:  { colors: 5, moves: 20, speed: 1.2 },
  master:  { colors: 6, moves: 15, speed: 1.5 }
};

// Special tile types: 0+ = normal color, -2 = bomb, -3 = rainbow, -4 = frozen (stores color+frozen flag)
const BOMB = -2, RAINBOW = -3;

// === CANVAS SIZING ===
function sz() {
  W = c.width = innerWidth; H = c.height = innerHeight;
  cols = Math.min(10, Math.max(5, Math.floor((W - 80) / (HR * 1.8))));
  rows = Math.min(10, Math.max(5, Math.floor((H - 160) / (HR * 1.6))));
}

// === HEX MATH ===
function hexPos(col, row) {
  const ox = (W - cols * HR * 1.8) / 2 + HR;
  return { x: HR * 1.8 * col + (row % 2 ? HR * 0.9 : 0) + ox, y: HR * 1.6 * row + 100 };
}

function pixToHex(px, py) {
  for (let r = 0; r < rows; r++) for (let co = 0; co < cols; co++) {
    const p = hexPos(co, r);
    if ((px - p.x) ** 2 + (py - p.y) ** 2 < HR * HR * 0.75) return { c: co, r: r };
  }
  return null;
}

// === GRID ===
function initGrid() {
  grid = [];
  const nc = DIFF[difficulty].colors;
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let co = 0; co < cols; co++) {
      grid[r][co] = { color: Math.floor(Math.random() * nc), special: null, frozen: false };
    }
  }
  // Inject specials based on level
  if (level >= 2) injectSpecials();
}

function injectSpecials() {
  const bombCount = Math.min(2, Math.floor(level / 3));
  const rainbowCount = Math.min(2, Math.floor(level / 4));
  for (let i = 0; i < bombCount; i++) {
    const r = Math.floor(Math.random() * rows), co = Math.floor(Math.random() * cols);
    grid[r][co].special = 'bomb';
  }
  for (let i = 0; i < rainbowCount; i++) {
    const r = Math.floor(Math.random() * rows), co = Math.floor(Math.random() * cols);
    grid[r][co].special = 'rainbow';
  }
  if (level >= 5) {
    const frozenCount = Math.min(3, Math.floor(level / 5));
    for (let i = 0; i < frozenCount; i++) {
      const r = Math.floor(Math.random() * rows), co = Math.floor(Math.random() * cols);
      grid[r][co].frozen = true;
    }
  }
}

// === NEIGHBOR LOGIC ===
function neighbors(co, r) {
  const n = [], e = r % 2 === 0;
  const d = e ? [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1]] : [[-1,0],[1,0],[0,-1],[0,1],[1,-1],[1,1]];
  for (const [dc, dr] of d) {
    const nc = co + dc, nr = r + dr;
    if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) n.push({ c: nc, r: nr });
  }
  return n;
}

// === CLUSTER FINDING ===
function findCluster(co, r) {
  const cell = grid[r][co];
  if (!cell || cell.color < 0) return [];
  // Rainbow matches everything
  const targetColor = cell.special === 'rainbow' ? -99 : cell.color;
  const visited = {}, cluster = [], queue = [{ c: co, r: r }];
  visited[r + ',' + co] = true;
  while (queue.length) {
    const u = queue.shift(); cluster.push(u);
    for (const nb of neighbors(u.c, u.r)) {
      const key = nb.r + ',' + nb.c;
      if (visited[key]) continue;
      const nc = grid[nb.r][nb.c];
      if (!nc || nc.color < 0) continue;
      if (targetColor === -99 || nc.color === targetColor || nc.special === 'rainbow') {
        visited[key] = true; queue.push(nb);
      }
    }
  }
  return cluster;
}

// === GRAVITY & REFILL ===
function applyGravity() {
  for (let co = 0; co < cols; co++) {
    for (let r = rows - 1; r >= 1; r--) {
      if (grid[r][co].color < 0) {
        for (let a = r - 1; a >= 0; a--) {
          if (grid[a][co].color >= 0) {
            grid[r][co] = { ...grid[a][co] };
            grid[a][co] = { color: -1, special: null, frozen: false };
            break;
          }
        }
      }
    }
    // Refill empty top cells
    const nc = DIFF[difficulty].colors;
    for (let r = 0; r < rows; r++) {
      if (grid[r][co].color < 0) {
        grid[r][co] = { color: Math.floor(Math.random() * nc), special: null, frozen: false };
      }
    }
  }
}

// === PARTICLES ===
function burst(px, py, col, count) {
  for (let i = 0; i < (count || 8); i++) {
    const a = Math.random() * 6.28, s = 2 + Math.random() * 5;
    pts.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1, c: col, s: 3 + Math.random() * 5 });
  }
}

// === CLICK HANDLER ===
function handleClick(e) {
  if (st !== 'play' || animating) return;
  const re = c.getBoundingClientRect();
  const h = pixToHex(e.clientX - re.left, e.clientY - re.top);
  if (!h) return;

  const cell = grid[h.r][h.c];

  // Handle frozen tile
  if (cell.frozen) {
    cell.frozen = false;
    sfxFrozen();
    if (gameMode !== 'zen') { moves--; updateHUD(); }
    return;
  }

  // Handle bomb special
  if (cell.special === 'bomb') {
    sfxSpecial(); specialsUsed++;
    const nbs = neighbors(h.c, h.r);
    const allCells = [{ c: h.c, r: h.r }, ...nbs];
    let pts2 = 0;
    for (const cell2 of allCells) {
      const p = hexPos(cell2.c, cell2.r);
      burst(p.x, p.y, CL[Math.abs(grid[cell2.r][cell2.c].color) % CL.length]);
      grid[cell2.r][cell2.c] = { color: -1, special: null, frozen: false };
      pts2 += 15;
    }
    score += pts2;
    if (gameMode !== 'zen') { moves--; }
    saveUndo();
    animating = true;
    setTimeout(() => { applyGravity(); animating = false; checkState(); }, 300);
    updateHUD();
    return;
  }

  const cl = findCluster(h.c, h.r);
  if (cl.length < 3) return;

  saveUndo();
  sfxPop(cl.length);

  // Score calculation with chain multiplier
  let basePoints = cl.length * cl.length * 10;
  if (cl.length >= 6) basePoints *= 2;
  if (cl.length >= 10) basePoints *= 3;

  // Combo system
  comboCount++;
  comboTimer = 120; // frames
  if (comboCount > 1) {
    basePoints *= comboCount;
    sfxCombo(comboCount);
    showCombo(comboCount);
  }
  if (comboCount > maxCombo) maxCombo = comboCount;

  score += basePoints;
  // Show floating score popup
  const centerCell = cl[Math.floor(cl.length / 2)];
  const cp = hexPos(centerCell.c, centerCell.r);
  floatingTexts.push({ x: cp.x, y: cp.y, text: '+' + basePoints, life: 60, color: '#fff' });
  if (comboCount > 1) floatingTexts.push({ x: cp.x, y: cp.y - 22, text: 'COMBO x' + comboCount, life: 60, color: '#f59e0b' });
  if (gameMode !== 'zen') moves--;
  chainCount++;

  // Remove tiles
  for (const cell2 of cl) {
    const pp = hexPos(cell2.c, cell2.r);
    burst(pp.x, pp.y, CL[grid[cell2.r][cell2.c].color % CL.length]);
    if (grid[cell2.r][cell2.c].special === 'rainbow') specialsUsed++;
    grid[cell2.r][cell2.c] = { color: -1, special: null, frozen: false };
  }

  // Animate gravity
  animating = true;
  setTimeout(() => {
    applyGravity();
    sfxCascade();
    // Check for auto-chains (cascade matches)
    const cascadeMatches = findAllMatches();
    if (cascadeMatches > 0) {
      chainCount += cascadeMatches;
      // Auto-chains are free — no move cost
    }
    animating = false;
    checkState();
  }, 250);

  updateHUD();
}

function findAllMatches() {
  // After gravity, check if any clusters of 3+ formed naturally
  let cascades = 0;
  const visited = {};
  for (let r = 0; r < rows; r++) for (let co = 0; co < cols; co++) {
    const key = r + ',' + co;
    if (visited[key] || grid[r][co].color < 0) continue;
    const cl = findCluster(co, r);
    if (cl.length >= 3) {
      cascades++;
      for (const cell of cl) {
        visited[cell.r + ',' + cell.c] = true;
        const pp = hexPos(cell.c, cell.r);
        burst(pp.x, pp.y, CL[grid[cell.r][cell.c].color % CL.length], 4);
        grid[cell.r][cell.c] = { color: -1, special: null, frozen: false };
      }
      score += cl.length * 20 * (cascades + 1);
    }
  }
  if (cascades > 0) {
    setTimeout(() => applyGravity(), 200);
    sfxCascade();
  }
  return cascades;
}

// === UNDO ===
function saveUndo() {
  undoStack.push({ grid: JSON.parse(JSON.stringify(grid)), score, moves, level });
  if (undoStack.length > 5) undoStack.shift();
}

function undo() {
  if (undoStack.length === 0 || animating) return;
  const state = undoStack.pop();
  grid = state.grid; score = state.score; moves = state.moves; level = state.level;
  updateHUD();
}

// === HINT SYSTEM ===
let hintCell = null;
function showHint() {
  for (let r = 0; r < rows; r++) for (let co = 0; co < cols; co++) {
    const cl = findCluster(co, r);
    if (cl.length >= 3) { hintCell = { c: co, r: r, time: 90 }; return; }
  }
}

// === STATE CHECK ===
function checkState() {
  updateHUD();

  // Level up check
  if (gameMode === 'classic' || gameMode === 'challenge') {
    const target = gameMode === 'challenge' ? challengeTarget : level * 500;
    if (score >= target) {
      level++;
      if (gameMode !== 'zen') moves += 5;
      if (gameMode === 'challenge') { challengeLevel++; challengeTarget += 400 + challengeLevel * 100; }
      sfxLevelUp();
      initGrid();
      updateHUD();
      return;
    }
  }

  // Game over check
  if (gameMode === 'classic' || gameMode === 'challenge') {
    if (moves <= 0) { endGame(); return; }
  }
}

function endGame() {
  st = 'over'; stopTimer();
  if (score > hi) { hi = score; try { localStorage.setItem('hxhi', hi); } catch (e) {} }
  gamesPlayed++; try { localStorage.setItem('hxgp', gamesPlayed); } catch (e) {}
  sfxGameOver(); stopBgMusic();

  document.getElementById('hud').classList.add('hide');
  document.getElementById('fs').textContent = score;
  document.getElementById('bs').textContent = 'Best: ' + hi;
  document.getElementById('overChains').textContent = chainCount;
  document.getElementById('overMaxCombo').textContent = maxCombo;
  document.getElementById('overSpecials').textContent = specialsUsed;
  document.getElementById('overLabel').textContent = (gameMode === 'challenge' && score >= challengeTarget) ? 'Level Complete!' : 'Game Over';
  showScreen('over');
}

// === TIMER (Blitz mode) ===
function startTimer() {
  timeLeft = 90;
  document.getElementById('resourceLabel').textContent = 'Time';
  document.getElementById('mv').textContent = timeLeft;
  timerInterval = setInterval(() => {
    if (st !== 'play') return;
    timeLeft--;
    document.getElementById('mv').textContent = timeLeft;
    if (timeLeft <= 0) { clearInterval(timerInterval); endGame(); }
  }, 1000);
}

function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }

// === HUD ===
function updateHUD() {
  document.getElementById('sc').textContent = score;
  document.getElementById('lv').textContent = level;
  if (gameMode === 'timed') {
    document.getElementById('mv').textContent = timeLeft;
  } else if (gameMode === 'zen') {
    document.getElementById('mv').textContent = '∞';
  } else {
    document.getElementById('mv').textContent = moves;
  }
  const target = gameMode === 'challenge' ? challengeTarget : level * 500;
  document.getElementById('tgt').textContent = gameMode === 'zen' ? '—' : target;
}

function showCombo(n) {
  const el = document.getElementById('comboDisplay');
  document.getElementById('comboText').textContent = 'COMBO x' + n;
  el.classList.remove('hide');
  el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
  setTimeout(() => el.classList.add('hide'), 1500);
}

// === DRAWING ===
function drawHex(px, py, rad, col, special, frozen) {
  ctx.save(); ctx.translate(px, py); ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i - Math.PI / 6;
    if (i === 0) ctx.moveTo(rad * Math.cos(a), rad * Math.sin(a));
    else ctx.lineTo(rad * Math.cos(a), rad * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1.5; ctx.stroke();

  // Sheen gradient
  const g = ctx.createRadialGradient(-2, -rad * 0.3, 0, 0, 0, rad);
  g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fill();

  // Special icons
  if (special === 'bomb') {
    ctx.fillStyle = '#000'; ctx.font = 'bold ' + (rad * 0.7) + 'px Inter';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('💣', 0, 2);
  } else if (special === 'rainbow') {
    ctx.fillStyle = '#000'; ctx.font = 'bold ' + (rad * 0.7) + 'px Inter';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌈', 0, 2);
  }

  // Frozen overlay
  if (frozen) {
    ctx.fillStyle = 'rgba(150,200,255,0.4)'; ctx.fill();
    ctx.strokeStyle = '#88ccff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (rad * 0.5) + 'px Inter';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('❄', 0, 2);
  }

  ctx.restore();
}

function draw() {
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0a0a14';
  ctx.fillRect(0, 0, W, H);

  if (st !== 'play' && st !== 'paused') return;

  // Draw grid
  for (let r = 0; r < rows; r++) for (let co = 0; co < cols; co++) {
    const cell = grid[r][co];
    if (!cell || cell.color < 0) continue;
    const p = hexPos(co, r);
    const colorIdx = cell.special === 'rainbow' ? (Math.floor(Date.now() / 200) % CL.length) : cell.color;
    drawHex(p.x, p.y, HR * 0.88, CL[colorIdx % CL.length], cell.special, cell.frozen);
  }

  // Hover highlight
  if (hov && st === 'play') {
    const hcl = findCluster(hov.c, hov.r);
    if (hcl.length >= 3) {
      ctx.globalAlpha = 0.2 + Math.sin(Date.now() * 0.005) * 0.1;
      for (const cell of hcl) {
        const pp = hexPos(cell.c, cell.r);
        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
          const ag = Math.PI / 3 * j - Math.PI / 6;
          if (j === 0) ctx.moveTo(pp.x + HR * Math.cos(ag), pp.y + HR * Math.sin(ag));
          else ctx.lineTo(pp.x + HR * Math.cos(ag), pp.y + HR * Math.sin(ag));
        }
        ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Cluster size + predicted score indicator
      const fp = hexPos(hcl[0].c, hcl[0].r);
      let previewPts = hcl.length * hcl.length * 10;
      if (hcl.length >= 6) previewPts *= 2;
      if (hcl.length >= 10) previewPts *= 3;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Inter'; ctx.textAlign = 'center';
      ctx.fillText(hcl.length + ' tiles → +' + previewPts + ' pts', fp.x, fp.y - HR - 5);
    }
  }

  // Hint glow
  if (hintCell && hintCell.time > 0) {
    hintCell.time--;
    const hp = hexPos(hintCell.c, hintCell.r);
    ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.01) * 0.2;
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(hp.x, hp.y, HR + 4, 0, 6.28); ctx.stroke();
    ctx.globalAlpha = 1;
    if (hintCell.time <= 0) hintCell = null;
  }

  // Particles
  for (let k = pts.length - 1; k >= 0; k--) {
    const pt = pts[k];
    pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.12; pt.l -= 0.02; pt.s *= 0.97;
    if (pt.l <= 0) { pts.splice(k, 1); continue; }
    ctx.globalAlpha = pt.l; ctx.fillStyle = pt.c;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.s, 0, 6.28); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Floating score texts
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y -= 1.2; ft.life--;
    if (ft.life <= 0) { floatingTexts.splice(i, 1); continue; }
    ctx.globalAlpha = ft.life / 60;
    ctx.fillStyle = ft.color; ctx.font = 'bold 18px Inter'; ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;

  // Keyboard cursor
  if (kbCursor && st === 'play') {
    kbCursorBlink++;
    const kp = hexPos(kbCursor.c, kbCursor.r);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.5 + Math.sin(kbCursorBlink * 0.1) * 0.3;
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const ag = Math.PI / 3 * j - Math.PI / 6;
      if (j === 0) ctx.moveTo(kp.x + (HR + 3) * Math.cos(ag), kp.y + (HR + 3) * Math.sin(ag));
      else ctx.lineTo(kp.x + (HR + 3) * Math.cos(ag), kp.y + (HR + 3) * Math.sin(ag));
    }
    ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 1;
    hov = kbCursor;
  }

  // Combo timer decay
  if (comboTimer > 0) { comboTimer--; if (comboTimer <= 0) comboCount = 0; }
}

function loop() { draw(); requestAnimationFrame(loop); }

// === SCREEN MANAGEMENT ===
function showScreen(id) {
  ['menu', 'modeSelect', 'howToPlay', 'settings', 'pause', 'over'].forEach(s => {
    document.getElementById(s).classList.toggle('hide', s !== id);
  });
}

// === START GAME ===
function startGame(mode) {
  initAudio(); startBgMusic();
  gameMode = mode; difficulty = document.getElementById('diffSelect').value;
  sz(); score = 0; level = 1; comboCount = 0; maxCombo = 0; chainCount = 0;
  specialsUsed = 0; undoStack = []; hintCell = null; pts = []; hov = null;
  floatingTexts = []; kbCursor = null;
  challengeTarget = 500; challengeLevel = 1;
  moves = DIFF[difficulty].moves;

  hi = parseInt(localStorage.getItem('hxhi')) || 0;
  gamesPlayed = parseInt(localStorage.getItem('hxgp')) || 0;

  initGrid();

  if (mode === 'timed') { startTimer(); document.getElementById('resourceLabel').textContent = 'Time'; }
  else if (mode === 'zen') { document.getElementById('resourceLabel').textContent = 'Moves'; }
  else { stopTimer(); document.getElementById('resourceLabel').textContent = 'Moves'; }

  st = 'play';
  showScreen(null);
  document.getElementById('hud').classList.remove('hide');
  updateHUD();
}

function showMenu() {
  st = 'menu'; stopTimer(); stopBgMusic();
  hi = parseInt(localStorage.getItem('hxhi')) || 0;
  gamesPlayed = parseInt(localStorage.getItem('hxgp')) || 0;
  document.getElementById('menuBest').textContent = hi;
  document.getElementById('menuGames').textContent = gamesPlayed;
  document.getElementById('hud').classList.add('hide');
  showScreen('menu');
}

// === EVENT LISTENERS ===
// Menu buttons
document.getElementById('playBtn').addEventListener('click', () => { sfxClick(); showScreen('modeSelect'); });
document.getElementById('howBtn').addEventListener('click', () => { sfxClick(); showScreen('howToPlay'); });
document.getElementById('settingsBtn').addEventListener('click', () => { sfxClick(); showScreen('settings'); });
document.getElementById('howBackBtn').addEventListener('click', () => { sfxClick(); showScreen('menu'); });
document.getElementById('settingsBackBtn').addEventListener('click', () => { sfxClick(); showScreen('menu'); });
document.getElementById('modeBackBtn').addEventListener('click', () => { sfxClick(); showScreen('menu'); });

// Mode selection
document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    sfxClick();
    document.querySelectorAll('.mode-card').forEach(c2 => c2.classList.remove('selected'));
    card.classList.add('selected');
    startGame(card.dataset.mode);
  });
});

// Game buttons
document.getElementById('retryBtn').addEventListener('click', () => { sfxClick(); startGame(gameMode); });
document.getElementById('menuBtn').addEventListener('click', () => { sfxClick(); showMenu(); });
document.getElementById('resumeBtn').addEventListener('click', () => { sfxClick(); st = 'play'; showScreen(null); document.getElementById('hud').classList.remove('hide'); });
document.getElementById('restartBtn2').addEventListener('click', () => { sfxClick(); startGame(gameMode); });
document.getElementById('pauseMenuBtn').addEventListener('click', () => { sfxClick(); showMenu(); });

// Canvas interactions
c.addEventListener('click', handleClick);
c.addEventListener('mousemove', (e) => {
  if (st !== 'play') return;
  const re = c.getBoundingClientRect();
  hov = pixToHex(e.clientX - re.left, e.clientY - re.top);
});
c.addEventListener('touchstart', (e) => {
  e.preventDefault(); initAudio();
  handleClick({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
});

// Settings
document.getElementById('sfxVol').addEventListener('input', (e) => { sfxVol = e.target.value / 100; });
document.getElementById('musicVol').addEventListener('input', (e) => {
  musicVol = e.target.value / 100;
  if (bgGain) bgGain.gain.value = musicVol * 0.08;
});
document.getElementById('themeSelect').addEventListener('change', (e) => {
  currentTheme = e.target.value;
  document.documentElement.setAttribute('data-theme', currentTheme);
  CL = COLORS_MAP[currentTheme] || COLORS_MAP.neon;
  if (st === 'play') initGrid();
});

// Keyboard shortcuts & arrow cursor
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (st === 'play') { st = 'paused'; showScreen('pause'); }
    else if (st === 'paused') { st = 'play'; showScreen(null); document.getElementById('hud').classList.remove('hide'); }
  }
  if (e.key === 'r' || e.key === 'R') { if (st === 'play' || st === 'over') startGame(gameMode); }
  if (e.key === 'm' || e.key === 'M') { if (st === 'play' || st === 'over' || st === 'paused') showMenu(); }
  if (e.key === 'h') { if (st === 'play') showHint(); }
  if (e.key === 'u') { if (st === 'play') undo(); }

  // Arrow key cursor navigation
  if (st === 'play') {
    if (!kbCursor) kbCursor = { c: Math.floor(cols / 2), r: Math.floor(rows / 2) };
    if (e.key === 'ArrowLeft') { kbCursor.c = Math.max(0, kbCursor.c - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { kbCursor.c = Math.min(cols - 1, kbCursor.c + 1); e.preventDefault(); }
    if (e.key === 'ArrowUp') { kbCursor.r = Math.max(0, kbCursor.r - 1); e.preventDefault(); }
    if (e.key === 'ArrowDown') { kbCursor.r = Math.min(rows - 1, kbCursor.r + 1); e.preventDefault(); }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const p = hexPos(kbCursor.c, kbCursor.r);
      handleClick({ clientX: p.x, clientY: p.y });
    }
  }
});

// Gamepad support
let gamepadCursor = { c: 0, r: 0 };
function pollGamepad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of gps) {
    if (!gp) continue;
    // D-pad or left stick
    if (gp.axes[0] < -0.5) gamepadCursor.c = Math.max(0, gamepadCursor.c - 1);
    if (gp.axes[0] > 0.5) gamepadCursor.c = Math.min(cols - 1, gamepadCursor.c + 1);
    if (gp.axes[1] < -0.5) gamepadCursor.r = Math.max(0, gamepadCursor.r - 1);
    if (gp.axes[1] > 0.5) gamepadCursor.r = Math.min(rows - 1, gamepadCursor.r + 1);
    // A button = select
    if (gp.buttons[0] && gp.buttons[0].pressed) {
      const p = hexPos(gamepadCursor.c, gamepadCursor.r);
      handleClick({ clientX: p.x, clientY: p.y });
    }
    // Start = pause
    if (gp.buttons[9] && gp.buttons[9].pressed) {
      if (st === 'play') { st = 'paused'; showScreen('pause'); }
    }
  }
  requestAnimationFrame(pollGamepad);
}

// Resize
window.addEventListener('resize', () => { sz(); if (st === 'play') initGrid(); });

// === INIT ===
sz();
hi = parseInt(localStorage.getItem('hxhi')) || 0;
gamesPlayed = parseInt(localStorage.getItem('hxgp')) || 0;
document.getElementById('menuBest').textContent = hi;
document.getElementById('menuGames').textContent = gamesPlayed;
loop();
pollGamepad();
