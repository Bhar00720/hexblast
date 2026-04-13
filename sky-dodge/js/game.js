// ============================================================
// SKY DODGE — Production-Grade Endless Runner Engine
// Corelume Tech © 2026
// ============================================================

// === SOUND ENGINE ===
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null; let sfxVol = 0.7, musicVol = 0.4;
let bgOsc = null, bgGain = null;

function initAudio() { if (!audioCtx) audioCtx = new AudioCtx(); }

function playTone(freq, dur, type, vol, detune) {
  if (!audioCtx || sfxVol === 0) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  g.gain.setValueAtTime(vol * sfxVol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur);
}

function sfxDodge() { playTone(600, 0.08, 'sine', 0.15); }
function sfxCollect() { playTone(800, 0.12, 'sine', 0.25); setTimeout(() => playTone(1000, 0.1, 'sine', 0.2), 50); }
function sfxShield() { playTone(400, 0.3, 'triangle', 0.3); }
function sfxNearMiss() { playTone(1200, 0.1, 'sine', 0.2); }
function sfxDie() { [400, 300, 200, 100].forEach((f, i) => setTimeout(() => playTone(f, 0.4, 'sawtooth', 0.15), i * 100)); }
function sfxSlowMo() { playTone(200, 0.5, 'sine', 0.2); }
function sfxBoss() { [300, 400, 500, 600, 500, 400].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'square', 0.1), i * 80)); }
function sfxClick() { playTone(800, 0.06, 'sine', 0.15); }
function sfxBoost() { playTone(500, 0.15, 'sawtooth', 0.1); }

function startBgMusic() {
  if (!audioCtx || bgOsc) return;
  bgOsc = audioCtx.createOscillator(); bgGain = audioCtx.createGain();
  const filt = audioCtx.createBiquadFilter();
  bgOsc.type = 'sawtooth'; bgOsc.frequency.value = 80;
  filt.type = 'lowpass'; filt.frequency.value = 200;
  bgGain.gain.value = musicVol * 0.05;
  bgOsc.connect(filt); filt.connect(bgGain); bgGain.connect(audioCtx.destination); bgOsc.start();
}
function stopBgMusic() { if (bgOsc) { try { bgOsc.stop(); } catch(e) {} bgOsc = null; } }

// === GAME STATE ===
const cv = document.getElementById('c'), cx = cv.getContext('2d');
let W, H, player, obs, pups, particles, score, best, spd, st, frame;
let gameMode = 'classic', gamesPlayed = 0;
let nearMissCount = 0, pupsCollected = 0, distanceTraveled = 0;
let shieldActive = false, slowMoActive = false, magnetActive = false;
let slowMoTimer = 0, magnetTimer = 0;
let heldPowerup = null; // stored powerup for Space activation
let sprintTimer = 60, sprintInterval = null;
let bossActive = false, bossPatternY = -200;
let stars = [];

const keys = {};
function clearKeys() { for (const k in keys) keys[k] = false; }
document.addEventListener('keydown', e => { keys[e.key] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault(); });
document.addEventListener('keyup', e => { keys[e.key] = false; });
// Also clear keys when window loses focus to prevent stuck keys
window.addEventListener('blur', clearKeys);
const touch = { active: false, x: 0, startX: 0 };
cv.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); touch.active = true; touch.x = e.touches[0].clientX; touch.startX = e.touches[0].clientX; });
cv.addEventListener('touchmove', e => { e.preventDefault(); touch.x = e.touches[0].clientX; });
cv.addEventListener('touchend', () => { touch.active = false; });

function sz() { W = cv.width = innerWidth; H = cv.height = innerHeight; }

// === STARS BACKGROUND ===
function initStars() { stars = []; for (let i = 0; i < 60; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random() * 2, b: Math.random() }); }

// === INIT ===
function init() {
  sz(); score = 0; frame = 0; nearMissCount = 0; pupsCollected = 0; distanceTraveled = 0;
  shieldActive = false; slowMoActive = false; magnetActive = false;
  slowMoTimer = 0; magnetTimer = 0; heldPowerup = null;
  bossActive = false; bossPatternY = -200;
  best = parseInt(localStorage.getItem('skydodge_best')) || 0;
  gamesPlayed = parseInt(localStorage.getItem('skydodge_gp')) || 0;

  const speedMult = gameMode === 'zen' ? 0.6 : gameMode === 'insane' ? 2.0 : 1.0;
  spd = 3 * speedMult;

  player = { x: W / 2, y: H * 0.75, r: 14, trail: [], boosting: false };
  obs = []; pups = []; particles = [];
  initStars();

  document.getElementById('hs').textContent = '0';
  document.getElementById('hb').textContent = best;
  document.getElementById('pupInd').classList.add('hide');
  document.getElementById('timerItem').style.display = gameMode === 'sprint' ? 'flex' : 'none';
}

// === SPAWN ===
function spawnObs() {
  if (bossActive) return;
  const t = Math.random();
  const zenMult = gameMode === 'zen' ? 0.7 : 1;
  if (t < 0.35) {
    // Bar obstacle
    const w = (60 + Math.random() * 120) * zenMult;
    obs.push({ x: Math.random() * (W - w), y: -20, w: w, h: 16, type: 'bar', color: '#ef4444' });
  } else if (t < 0.55) {
    // Orb obstacle
    obs.push({ x: Math.random() * W, y: -20, w: 20, h: 20, type: 'orb', color: '#f59e0b' });
  } else if (t < 0.8) {
    // Wall with gap
    const gapW = (gameMode === 'zen' ? 200 : 120) + Math.random() * 80;
    const gapX = Math.random() * (W - gapW);
    obs.push({ x: 0, y: -20, w: gapX, h: 14, type: 'wall', color: '#8b5cf6' });
    obs.push({ x: gapX + gapW, y: -20, w: W - (gapX + gapW), h: 14, type: 'wall', color: '#8b5cf6' });
  } else if (score > 200) {
    // Homing missile (appears after score 200)
    const mx = Math.random() * W;
    obs.push({ x: mx, y: -20, w: 12, h: 24, type: 'missile', color: '#ef4444', vx: 0 });
  }
}

function spawnPup() {
  const types = ['score', 'shield', 'slowmo', 'magnet'];
  const type = types[Math.floor(Math.random() * types.length)];
  const colors = { score: '#22c55e', shield: '#3b82f6', slowmo: '#f59e0b', magnet: '#8b5cf6' };
  pups.push({ x: 40 + Math.random() * (W - 80), y: -20, r: 12, type, color: colors[type] });
}

function spawnBoss() {
  if (bossActive || gameMode === 'zen') return;
  bossActive = true; bossPatternY = -200;
  sfxBoss();
}

// === PARTICLES ===
function boom(bx, by, col, count) {
  for (let i = 0; i < (count || 12); i++) {
    const a = Math.random() * 6.28, s = 2 + Math.random() * 5;
    particles.push({ x: bx, y: by, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col, sz: 2 + Math.random() * 4 });
  }
}

// === NEAR MISS ===
function checkNearMiss(o) {
  const margin = 8;
  let near = false;
  if (o.type === 'orb' || o.type === 'missile') {
    const dx = player.x - o.x, dy = player.y - o.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    near = dist < (player.r + 15 + margin) && dist > (player.r + 10);
  } else {
    near = (player.x + player.r + margin > o.x && player.x - player.r - margin < o.x + o.w &&
            player.y + player.r + margin > o.y && player.y - player.r - margin < o.y + o.h) &&
           !(player.x + player.r > o.x && player.x - player.r < o.x + o.w &&
             player.y + player.r > o.y && player.y - player.r < o.y + o.h);
  }
  if (near) {
    score += 5; nearMissCount++; sfxNearMiss();
    const el = document.getElementById('nearMiss');
    el.classList.remove('hide'); el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
    setTimeout(() => el.classList.add('hide'), 500);
  }
}

// === UPDATE ===
function update() {
  frame++; distanceTraveled++;
  const speedBase = gameMode === 'insane' ? 6 : gameMode === 'zen' ? 2 : 3;
  spd = speedBase + score * 0.005; if (spd > 14) spd = 14;
  if (slowMoActive) { spd *= 0.4; slowMoTimer--; if (slowMoTimer <= 0) { slowMoActive = false; } }
  if (magnetTimer > 0) { magnetTimer--; if (magnetTimer <= 0) magnetActive = false; }

  // Player movement — direct and responsive
  const moveSpd = 10;
  if (keys['ArrowLeft'] || keys['a']) player.x -= moveSpd;
  if (keys['ArrowRight'] || keys['d']) player.x += moveSpd;
  if (keys['ArrowUp'] || keys['w']) { player.y -= moveSpd * 0.6; player.boosting = true; spd += 0.5; if (frame % 6 === 0) sfxBoost(); } else { player.boosting = false; }
  if (keys['ArrowDown'] || keys['s']) { player.y += moveSpd * 0.4; spd = Math.max(1, spd - 1); }
  if (keys[' '] && heldPowerup) { activatePowerup(heldPowerup); heldPowerup = null; document.getElementById('pupInd').classList.add('hide'); }

  if (touch.active) player.x += (touch.x - player.x) * 0.15;
  player.x = Math.max(player.r, Math.min(W - player.r, player.x));
  player.y = Math.max(80, Math.min(H - player.r, player.y));

  // Trail
  player.trail.push({ x: player.x, y: player.y, a: 1 });
  if (player.trail.length > 25) player.trail.shift();
  for (const t of player.trail) t.a *= 0.9;

  // Spawning
  const spawnRate = gameMode === 'zen' ? 50 : Math.max(12, 35 - Math.floor(score / 80));
  if (frame % spawnRate === 0) spawnObs();
  if (frame % 180 === 0) spawnPup();
  if (score > 0 && score % 500 === 0 && !bossActive && frame % 60 === 0) spawnBoss();

  // Boss pattern
  if (bossActive) {
    bossPatternY += spd * 0.5;
    if (bossPatternY > H + 100) { bossActive = false; score += 100; }
    // Boss collision — series of walls with narrow gaps
    const bossHeight = 150;
    if (player.y > bossPatternY && player.y < bossPatternY + bossHeight) {
      const gapCenter = W / 2 + Math.sin(bossPatternY * 0.02) * (W * 0.3);
      const gapW = 80;
      if (player.x < gapCenter - gapW / 2 || player.x > gapCenter + gapW / 2) { die(); return; }
    }
  }

  // Obstacles
  for (let i = obs.length - 1; i >= 0; i--) {
    const o = obs[i];
    o.y += spd;
    // Missile homing
    if (o.type === 'missile') {
      const dx = player.x - o.x;
      o.vx = o.vx || 0;
      o.vx += (dx > 0 ? 0.15 : -0.15);
      o.vx *= 0.95;
      o.x += o.vx;
    }

    if (o.y > H + 40) { obs.splice(i, 1); score++; document.getElementById('hs').textContent = score; continue; }

    checkNearMiss(o);

    // Collision
    let hit = false;
    if (o.type === 'orb' || o.type === 'missile') {
      const dx = player.x - o.x, dy = player.y - o.y;
      hit = dx * dx + dy * dy < (player.r + 10) * (player.r + 10);
    } else {
      hit = player.x + player.r > o.x && player.x - player.r < o.x + o.w &&
            player.y + player.r > o.y && player.y - player.r < o.y + o.h;
    }
    if (hit) {
      if (shieldActive) {
        shieldActive = false; sfxShield(); boom(player.x, player.y, '#3b82f6', 20);
        obs.splice(i, 1);
      } else { die(); return; }
    }
  }

  // Powerups
  for (let j = pups.length - 1; j >= 0; j--) {
    pups[j].y += spd * 0.8;
    if (magnetActive) {
      const dx = player.x - pups[j].x, dy = player.y - pups[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 200) { pups[j].x += dx / dist * 3; pups[j].y += dy / dist * 3; }
    }
    const dx = player.x - pups[j].x, dy = player.y - pups[j].y;
    if (dx * dx + dy * dy < (player.r + pups[j].r) * (player.r + pups[j].r)) {
      const pup = pups[j]; pupsCollected++;
      sfxCollect(); boom(pup.x, pup.y, pup.color);
      if (pup.type === 'score') { score += 25; }
      else { heldPowerup = pup.type; showPupIndicator(pup.type); }
      pups.splice(j, 1);
      document.getElementById('hs').textContent = score; continue;
    }
    if (pups[j] && pups[j].y > H + 40) pups.splice(j, 1);
  }

  // Particles
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k]; p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.025; p.sz *= 0.96;
    if (p.life <= 0) particles.splice(k, 1);
  }

  // Stars scroll
  for (const s of stars) { s.y += spd * s.b * 0.3; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } }
}

function activatePowerup(type) {
  if (type === 'shield') { shieldActive = true; sfxShield(); }
  else if (type === 'slowmo') { slowMoActive = true; slowMoTimer = 180; sfxSlowMo(); }
  else if (type === 'magnet') { magnetActive = true; magnetTimer = 300; }
}

function showPupIndicator(type) {
  const icons = { shield: '🛡️', slowmo: '🕐', magnet: '🧲' };
  const names = { shield: 'Shield', slowmo: 'Slow-Mo', magnet: 'Magnet' };
  document.getElementById('pupIcon').textContent = icons[type] || '⚡';
  document.getElementById('pupName').textContent = (names[type] || type) + ' [Space]';
  const el = document.getElementById('pupInd');
  el.classList.remove('hide'); el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
}

function die() {
  boom(player.x, player.y, '#3b82f6', 20); st = 'over'; sfxDie(); stopBgMusic();
  if (score > best) { best = score; localStorage.setItem('skydodge_best', best); }
  gamesPlayed++; localStorage.setItem('skydodge_gp', gamesPlayed);
  if (sprintInterval) { clearInterval(sprintInterval); sprintInterval = null; }

  document.getElementById('fs').textContent = score;
  document.getElementById('fb').textContent = 'Best: ' + best;
  document.getElementById('overNear').textContent = nearMissCount;
  document.getElementById('overPups').textContent = pupsCollected;
  document.getElementById('overDist').textContent = Math.floor(distanceTraveled / 10) + 'm';
  document.getElementById('hud').classList.add('hide');
  showScreen('over');
}

// === DRAWING ===
function draw() {
  cx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#050510';
  cx.fillRect(0, 0, W, H);

  if (st !== 'play' && st !== 'paused') return;

  // Stars
  cx.fillStyle = 'rgba(255,255,255,0.4)';
  for (const s of stars) { cx.globalAlpha = 0.3 + s.b * 0.5; cx.fillRect(s.x, s.y, s.s, s.s); }
  cx.globalAlpha = 1;

  // Boss pattern
  if (bossActive) {
    const bossHeight = 150;
    cx.fillStyle = 'rgba(239,68,68,0.15)';
    cx.fillRect(0, bossPatternY, W, bossHeight);
    const gapCenter = W / 2 + Math.sin(bossPatternY * 0.02) * (W * 0.3);
    const gapW = 80;
    cx.fillStyle = '#ef4444';
    cx.fillRect(0, bossPatternY, gapCenter - gapW / 2, bossHeight);
    cx.fillRect(gapCenter + gapW / 2, bossPatternY, W - (gapCenter + gapW / 2), bossHeight);
    cx.fillStyle = '#22c55e'; cx.globalAlpha = 0.3;
    cx.fillRect(gapCenter - gapW / 2, bossPatternY, gapW, bossHeight);
    cx.globalAlpha = 1;
    cx.fillStyle = '#fff'; cx.font = 'bold 16px Inter'; cx.textAlign = 'center';
    cx.fillText('⚠️ BOSS PATTERN', W / 2, bossPatternY - 10);
  }

  // Player trail
  for (const t of player.trail) {
    cx.globalAlpha = t.a * 0.4; cx.fillStyle = '#3b82f6';
    cx.beginPath(); cx.arc(t.x, t.y, player.r * t.a, 0, 6.28); cx.fill();
  }
  cx.globalAlpha = 1;

  // Player
  cx.fillStyle = '#3b82f6'; cx.shadowColor = '#3b82f6'; cx.shadowBlur = 20;
  cx.beginPath(); cx.arc(player.x, player.y, player.r, 0, 6.28); cx.fill(); cx.shadowBlur = 0;
  // Sheen
  const pg = cx.createRadialGradient(player.x - 4, player.y - 4, 0, player.x, player.y, player.r);
  pg.addColorStop(0, 'rgba(255,255,255,0.5)'); pg.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = pg; cx.beginPath(); cx.arc(player.x, player.y, player.r, 0, 6.28); cx.fill();
  // Shield glow
  if (shieldActive) {
    cx.strokeStyle = '#22d3ee'; cx.lineWidth = 3; cx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.008) * 0.3;
    cx.beginPath(); cx.arc(player.x, player.y, player.r + 8, 0, 6.28); cx.stroke();
    cx.globalAlpha = 1;
  }
  // Boosting flame
  if (player.boosting) {
    cx.fillStyle = '#f97316'; cx.globalAlpha = 0.7;
    cx.beginPath(); cx.moveTo(player.x - 6, player.y + player.r);
    cx.lineTo(player.x, player.y + player.r + 12 + Math.random() * 8);
    cx.lineTo(player.x + 6, player.y + player.r); cx.fill();
    cx.globalAlpha = 1;
  }
  // Slow-mo vignette
  if (slowMoActive) {
    cx.fillStyle = 'rgba(245,158,11,0.05)'; cx.fillRect(0, 0, W, H);
  }

  // Obstacles
  for (const o of obs) {
    cx.fillStyle = o.color;
    if (o.type === 'orb') { cx.beginPath(); cx.arc(o.x, o.y, 10, 0, 6.28); cx.fill(); }
    else if (o.type === 'missile') {
      cx.shadowColor = '#ef4444'; cx.shadowBlur = 12;
      cx.beginPath(); cx.moveTo(o.x, o.y - 12); cx.lineTo(o.x - 6, o.y + 12); cx.lineTo(o.x + 6, o.y + 12);
      cx.closePath(); cx.fill(); cx.shadowBlur = 0;
      // Missile trail
      cx.fillStyle = 'rgba(239,68,68,0.3)';
      cx.beginPath(); cx.arc(o.x, o.y + 16, 4, 0, 6.28); cx.fill();
    } else {
      cx.shadowColor = o.color; cx.shadowBlur = 8;
      cx.fillRect(o.x, o.y, o.w, o.h); cx.shadowBlur = 0;
    }
  }

  // Powerups
  for (const p of pups) {
    cx.fillStyle = p.color; cx.shadowColor = p.color; cx.shadowBlur = 15;
    cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.28); cx.fill(); cx.shadowBlur = 0;
    // Icon inside
    cx.fillStyle = '#fff'; cx.font = '12px Inter'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    const icons = { score: '$', shield: 'S', slowmo: 'T', magnet: 'M' };
    cx.fillText(icons[p.type] || '+', p.x, p.y);
  }

  // Particles
  for (const p of particles) {
    cx.globalAlpha = p.life; cx.fillStyle = p.color;
    cx.beginPath(); cx.arc(p.x, p.y, p.sz, 0, 6.28); cx.fill();
  }
  cx.globalAlpha = 1;
}

function loop() { if (st === 'play') { update(); draw(); } requestAnimationFrame(loop); }

// === SCREENS ===
function showScreen(id) {
  ['menu', 'modeSelect', 'howToPlay', 'settings', 'pause', 'over'].forEach(s => {
    document.getElementById(s).classList.toggle('hide', s !== id);
  });
}

function startGame(mode) {
  initAudio(); startBgMusic();
  gameMode = mode; init(); st = 'play';
  showScreen(null);
  document.getElementById('hud').classList.remove('hide');

  if (mode === 'sprint') {
    sprintTimer = 60;
    document.getElementById('ht').textContent = sprintTimer;
    sprintInterval = setInterval(() => {
      if (st !== 'play') return;
      sprintTimer--;
      document.getElementById('ht').textContent = sprintTimer;
      if (sprintTimer <= 0) { clearInterval(sprintInterval); sprintInterval = null; die(); }
    }, 1000);
  }
}

function showMenu() {
  st = 'menu'; stopBgMusic();
  if (sprintInterval) { clearInterval(sprintInterval); sprintInterval = null; }
  best = parseInt(localStorage.getItem('skydodge_best')) || 0;
  gamesPlayed = parseInt(localStorage.getItem('skydodge_gp')) || 0;
  document.getElementById('menuBest').textContent = best;
  document.getElementById('menuGames').textContent = gamesPlayed;
  document.getElementById('hud').classList.add('hide');
  showScreen('menu');
}

// === EVENT LISTENERS ===
document.getElementById('playBtn').addEventListener('click', () => { sfxClick(); showScreen('modeSelect'); });
document.getElementById('howBtn').addEventListener('click', () => { sfxClick(); showScreen('howToPlay'); });
document.getElementById('settingsBtn').addEventListener('click', () => { sfxClick(); showScreen('settings'); });
document.getElementById('howBackBtn').addEventListener('click', () => { sfxClick(); showScreen('menu'); });
document.getElementById('settingsBackBtn').addEventListener('click', () => { sfxClick(); showScreen('menu'); });
document.getElementById('modeBackBtn').addEventListener('click', () => { sfxClick(); showScreen('menu'); });

document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    sfxClick();
    document.querySelectorAll('.mode-card').forEach(c2 => c2.classList.remove('selected'));
    card.classList.add('selected');
    startGame(card.dataset.mode);
  });
});

document.getElementById('retryBtn').addEventListener('click', () => { sfxClick(); startGame(gameMode); });
document.getElementById('menuBtn').addEventListener('click', () => { sfxClick(); showMenu(); });
document.getElementById('resumeBtn').addEventListener('click', () => { sfxClick(); clearKeys(); st = 'play'; showScreen(null); document.getElementById('hud').classList.remove('hide'); });
document.getElementById('restartBtn2').addEventListener('click', () => { sfxClick(); startGame(gameMode); });
document.getElementById('pauseMenuBtn').addEventListener('click', () => { sfxClick(); showMenu(); });

document.getElementById('sfxVol').addEventListener('input', e => { sfxVol = e.target.value / 100; });
document.getElementById('musicVol').addEventListener('input', e => { musicVol = e.target.value / 100; if (bgGain) bgGain.gain.value = musicVol * 0.05; });
document.getElementById('themeSelect').addEventListener('change', e => { document.documentElement.setAttribute('data-theme', e.target.value); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (st === 'play') { st = 'paused'; showScreen('pause'); }
    else if (st === 'paused') { clearKeys(); st = 'play'; showScreen(null); document.getElementById('hud').classList.remove('hide'); }
  }
  if (e.key === 'r' || e.key === 'R') { if (st === 'play' || st === 'over') startGame(gameMode); }
  if (e.key === 'm' || e.key === 'M') { if (st !== 'menu') showMenu(); }
});

// Gamepad
function pollGamepad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of gps) {
    if (!gp) continue;
    if (gp.axes[0] < -0.3) keys['ArrowLeft'] = true; else if (!keys['a']) keys['ArrowLeft'] = false;
    if (gp.axes[0] > 0.3) keys['ArrowRight'] = true; else if (!keys['d']) keys['ArrowRight'] = false;
    if (gp.buttons[0] && gp.buttons[0].pressed) keys[' '] = true; else keys[' '] = false;
    if (gp.buttons[9] && gp.buttons[9].pressed) { if (st === 'play') { st = 'paused'; showScreen('pause'); } }
  }
  requestAnimationFrame(pollGamepad);
}

window.addEventListener('resize', sz);

// === INIT ===
sz();
best = parseInt(localStorage.getItem('skydodge_best')) || 0;
gamesPlayed = parseInt(localStorage.getItem('skydodge_gp')) || 0;
document.getElementById('menuBest').textContent = best;
document.getElementById('menuGames').textContent = gamesPlayed;
loop();
pollGamepad();
