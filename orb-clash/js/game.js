// ============================================================
// ORB CLASH — Production-Grade Arena Combat Engine with AI
// Corelume Tech © 2026
// ============================================================

// === SOUND ENGINE ===
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null; let sfxVol = 0.7, musicVol = 0.4;
let bgOsc = null, bgGain = null;

function initAudio() { if (!audioCtx) audioCtx = new AudioCtx(); }
function playTone(freq, dur, type, vol) {
  if (!audioCtx || sfxVol === 0) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol * sfxVol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur);
}
function sfxShoot() { playTone(500, 0.1, 'square', 0.15); }
function sfxCharge() { playTone(300, 0.08, 'sine', 0.1); }
function sfxHit() { playTone(200, 0.2, 'sawtooth', 0.2); }
function sfxBounce() { playTone(800, 0.05, 'sine', 0.1); }
function sfxDash() { playTone(600, 0.12, 'triangle', 0.15); }
function sfxShield() { playTone(400, 0.3, 'triangle', 0.2); }
function sfxPup() { playTone(900, 0.15, 'sine', 0.2); setTimeout(() => playTone(1100, 0.1, 'sine', 0.15), 60); }
function sfxKO() { [500, 400, 300, 200, 100].forEach((f, i) => setTimeout(() => playTone(f, 0.3, 'sawtooth', 0.15), i * 80)); }
function sfxWin() { [600, 800, 1000, 1200, 1400].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sine', 0.25), i * 100)); }
function sfxRoundStart() { playTone(600, 0.15, 'sine', 0.2); setTimeout(() => playTone(800, 0.15, 'sine', 0.2), 120); }
function sfxClick() { playTone(800, 0.06, 'sine', 0.15); }

function startBgMusic() {
  if (!audioCtx || bgOsc) return;
  bgOsc = audioCtx.createOscillator(); bgGain = audioCtx.createGain();
  const filt = audioCtx.createBiquadFilter();
  bgOsc.type = 'sine'; bgOsc.frequency.value = 100;
  filt.type = 'lowpass'; filt.frequency.value = 250;
  bgGain.gain.value = musicVol * 0.06;
  bgOsc.connect(filt); filt.connect(bgGain); bgGain.connect(audioCtx.destination); bgOsc.start();
}
function stopBgMusic() { if (bgOsc) { try { bgOsc.stop(); } catch(e) {} bgOsc = null; } }

// === GAME STATE ===
const cv = document.getElementById('c'), cx = cv.getContext('2d');
let W, H, p1, p2, bullets, particles, powerups, st, round;
let p1Score, p2Score, roundsToWin = 3;
let isAI = false, aiDiff = 'medium';
let totalShots = 0, totalHits = 0, totalDashes = 0;
let gamesPlayed = 0, totalWins = 0;

const keys = {};
function clearKeys() { for (const k in keys) keys[k] = false; }
document.addEventListener('keydown', e => { keys[e.key] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter'].includes(e.key)) e.preventDefault(); });
document.addEventListener('keyup', e => { keys[e.key] = false; });
window.addEventListener('blur', clearKeys);

function sz() { W = cv.width = innerWidth; H = cv.height = innerHeight; }

function createPlayer(px, py, color) {
  return {
    x: px, y: py, vx: 0, vy: 0, r: 18, color: color,
    hp: 100, maxHp: 100, cooldown: 0,
    dashCooldown: 0, dashMaxCooldown: 90, dashing: false, dashTimer: 0,
    chargeLevel: 0, charging: false,
    shield: false, speedBoost: false, tripleShot: false,
    speedTimer: 0, tripleTimer: 0,
    regenTimer: 0
  };
}

function init() {
  sz(); round = 1; p1Score = 0; p2Score = 0;
  totalShots = 0; totalHits = 0; totalDashes = 0;
  roundsToWin = parseInt(document.getElementById('roundsSelect').value) || 3;
  resetRound();
}

function resetRound() {
  p1 = createPlayer(W * 0.25, H / 2, '#3b82f6');
  p2 = createPlayer(W * 0.75, H / 2, '#ef4444');
  bullets = []; particles = []; powerups = [];
  updateHUD();
  sfxRoundStart();
}

// === PLAYER MOVEMENT ===
function movePlayer(p, up, dn, lt, rt, fire, chargeKey, dashKey, enemy) {
  const accel = p.speedBoost ? 1.6 : 1.1;
  const fric = 0.90, maxSpd = p.speedBoost ? 12 : 9;

  if (keys[up]) p.vy -= accel; if (keys[dn]) p.vy += accel;
  if (keys[lt]) p.vx -= accel; if (keys[rt]) p.vx += accel;

  p.vx *= fric; p.vy *= fric;
  const s = Math.sqrt(p.vx ** 2 + p.vy ** 2);
  if (s > maxSpd) { p.vx = p.vx / s * maxSpd; p.vy = p.vy / s * maxSpd; }

  // Dashing
  if (keys[dashKey] && p.dashCooldown <= 0 && !p.dashing) {
    p.dashing = true; p.dashTimer = 8; p.dashCooldown = p.dashMaxCooldown;
    const dx = (p.vx || 0), dy = (p.vy || 0);
    const dMag = Math.sqrt(dx * dx + dy * dy) || 1;
    p.vx = dx / dMag * 15; p.vy = dy / dMag * 15;
    sfxDash(); totalDashes++;
  }
  if (p.dashing) { p.dashTimer--; if (p.dashTimer <= 0) p.dashing = false; }
  if (p.dashCooldown > 0) p.dashCooldown--;

  // Charging
  if (keys[chargeKey]) {
    p.charging = true;
    p.chargeLevel = Math.min(100, p.chargeLevel + 2);
    if (p.chargeLevel % 20 === 0) sfxCharge();
  } else if (p.charging && p.chargeLevel > 20) {
    // Release charged shot
    fireProjectile(p, enemy, p.chargeLevel); p.charging = false; p.chargeLevel = 0;
  } else { p.charging = false; p.chargeLevel = 0; }

  p.x += p.vx; p.y += p.vy;
  if (p.x < p.r) { p.x = p.r; p.vx *= -0.6; } if (p.x > W - p.r) { p.x = W - p.r; p.vx *= -0.6; }
  if (p.y < 60 + p.r) { p.y = 60 + p.r; p.vy *= -0.6; } if (p.y > H - p.r) { p.y = H - p.r; p.vy *= -0.6; }

  if (p.cooldown > 0) p.cooldown--;
  if (p.speedTimer > 0) { p.speedTimer--; if (p.speedTimer <= 0) p.speedBoost = false; }
  if (p.tripleTimer > 0) { p.tripleTimer--; if (p.tripleTimer <= 0) p.tripleShot = false; }

  // Health regen (slow)
  p.regenTimer++;
  if (p.regenTimer > 180 && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 0.5); p.regenTimer = 170; }

  // Normal fire
  if (keys[fire] && p.cooldown <= 0 && !p.charging) { fireProjectile(p, enemy, 0); }
}

function fireProjectile(p, enemy, charge) {
  p.cooldown = charge > 50 ? 25 : 18; totalShots++;
  const dx = enemy.x - p.x, dy = enemy.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const bspd = 9 + charge * 0.05;
  const bSize = 5 + charge * 0.04;
  const bDmg = 12 + Math.floor(charge * 0.15);

  const shoot = (offsetAngle) => {
    const angle = Math.atan2(dy, dx) + offsetAngle;
    bullets.push({
      x: p.x, y: p.y,
      vx: Math.cos(angle) * bspd + p.vx * 0.2,
      vy: Math.sin(angle) * bspd + p.vy * 0.2,
      r: bSize, color: p.color, owner: p, life: 200, bounces: 0, dmg: bDmg
    });
  };

  shoot(0);
  if (p.tripleShot) { shoot(0.2); shoot(-0.2); }
  sfxShoot();
}

// === AI SYSTEM ===
function updateAI(ai, enemy) {
  const dx = enemy.x - ai.x, dy = enemy.y - ai.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;

  const cfg = {
    easy:       { aimOff: 0.4, reactDelay: 30, dodgeChance: 0.1, moveSpeed: 0.3 },
    medium:     { aimOff: 0.15, reactDelay: 15, dodgeChance: 0.4, moveSpeed: 0.5 },
    hard:       { aimOff: 0.05, reactDelay: 5, dodgeChance: 0.7, moveSpeed: 0.6 },
    impossible: { aimOff: 0.01, reactDelay: 1, dodgeChance: 0.95, moveSpeed: 0.8 }
  }[aiDiff];

  // Movement — track player with offset
  const accel = cfg.moveSpeed;
  const idealDist = 250;
  if (dist > idealDist + 50) { ai.vx += (dx / dist) * accel; ai.vy += (dy / dist) * accel; }
  else if (dist < idealDist - 50) { ai.vx -= (dx / dist) * accel; ai.vy -= (dy / dist) * accel; }
  // Lateral movement for strafing
  ai.vx += Math.sin(Date.now() * 0.003) * accel * 0.5;
  ai.vy += Math.cos(Date.now() * 0.004) * accel * 0.3;

  ai.vx *= 0.92; ai.vy *= 0.92;
  const s = Math.sqrt(ai.vx ** 2 + ai.vy ** 2);
  const maxSpd = ai.speedBoost ? 8 : 6;
  if (s > maxSpd) { ai.vx = ai.vx / s * maxSpd; ai.vy = ai.vy / s * maxSpd; }

  ai.x += ai.vx; ai.y += ai.vy;
  if (ai.x < ai.r) { ai.x = ai.r; ai.vx *= -0.6; } if (ai.x > W - ai.r) { ai.x = W - ai.r; ai.vx *= -0.6; }
  if (ai.y < 60 + ai.r) { ai.y = 60 + ai.r; ai.vy *= -0.6; } if (ai.y > H - ai.r) { ai.y = H - ai.r; ai.vy *= -0.6; }

  // Dodge incoming bullets
  for (const b of bullets) {
    if (b.owner === ai) continue;
    const bdx = ai.x - b.x, bdy = ai.y - b.y;
    const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
    if (bdist < 80 && Math.random() < cfg.dodgeChance) {
      // Dodge perpendicular to bullet direction
      ai.vx += b.vy * 0.3; ai.vy += -b.vx * 0.3;
      // AI dash if available and close
      if (bdist < 40 && ai.dashCooldown <= 0) {
        ai.dashing = true; ai.dashTimer = 8; ai.dashCooldown = ai.dashMaxCooldown;
        const dMag = Math.sqrt(ai.vx ** 2 + ai.vy ** 2) || 1;
        ai.vx = ai.vx / dMag * 15; ai.vy = ai.vy / dMag * 15;
      }
    }
  }

  // Shoot with aim offset
  if (ai.cooldown > 0) ai.cooldown--;
  if (ai.dashCooldown > 0) ai.dashCooldown--;
  if (ai.dashing) { ai.dashTimer--; if (ai.dashTimer <= 0) ai.dashing = false; }
  if (ai.speedTimer > 0) { ai.speedTimer--; if (ai.speedTimer <= 0) ai.speedBoost = false; }
  if (ai.tripleTimer > 0) { ai.tripleTimer--; if (ai.tripleTimer <= 0) ai.tripleShot = false; }
  ai.regenTimer++;
  if (ai.regenTimer > 180 && ai.hp < ai.maxHp) { ai.hp = Math.min(ai.maxHp, ai.hp + 0.5); ai.regenTimer = 170; }

  if (ai.cooldown <= 0 && Math.random() > 0.3) {
    ai.cooldown = 18; totalShots++;
    // Predictive aiming: lead the shot
    const leadFactor = aiDiff === 'hard' || aiDiff === 'impossible' ? 0.5 : 0;
    const predX = enemy.x + enemy.vx * leadFactor * 10;
    const predY = enemy.y + enemy.vy * leadFactor * 10;
    const aDx = predX - ai.x + (Math.random() - 0.5) * cfg.aimOff * dist;
    const aDy = predY - ai.y + (Math.random() - 0.5) * cfg.aimOff * dist;
    const aD = Math.sqrt(aDx ** 2 + aDy ** 2) || 1;
    const bspd = 9;
    const shoot = (off) => {
      const angle = Math.atan2(aDy, aDx) + off;
      bullets.push({
        x: ai.x, y: ai.y, vx: Math.cos(angle) * bspd + ai.vx * 0.2, vy: Math.sin(angle) * bspd + ai.vy * 0.2,
        r: 5, color: ai.color, owner: ai, life: 200, bounces: 0, dmg: 12
      });
    };
    shoot(0);
    if (ai.tripleShot) { shoot(0.2); shoot(-0.2); }
    sfxShoot();
  }

  // Powerup collection — AI moves toward powerups
  for (const pup of powerups) {
    const pdx = pup.x - ai.x, pdy = pup.y - ai.y;
    const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
    if (pDist < 200) { ai.vx += (pdx / pDist) * 0.4; ai.vy += (pdy / pDist) * 0.4; }
  }
}

// === POWERUPS ===
function spawnPowerup() {
  const types = ['shield', 'speed', 'triple', 'heal'];
  const colors = { shield: '#3b82f6', speed: '#f59e0b', triple: '#8b5cf6', heal: '#22c55e' };
  const icons = { shield: '🛡️', speed: '⚡', triple: '🔱', heal: '💚' };
  const t = types[Math.floor(Math.random() * types.length)];
  const px = 100 + Math.random() * (W - 200), py = 100 + Math.random() * (H - 200);
  powerups.push({ x: px, y: py, r: 12, type: t, color: colors[t], icon: icons[t], life: 600 });
}

function collectPowerup(player, pup) {
  sfxPup();
  if (pup.type === 'shield') { player.shield = true; }
  else if (pup.type === 'speed') { player.speedBoost = true; player.speedTimer = 300; }
  else if (pup.type === 'triple') { player.tripleShot = true; player.tripleTimer = 300; }
  else if (pup.type === 'heal') { player.hp = Math.min(player.maxHp, player.hp + 30); }
  showPupAlert(pup.icon + ' ' + pup.type.toUpperCase());
}

function showPupAlert(text) {
  const el = document.getElementById('pupAlert');
  el.textContent = text; el.classList.remove('hide');
  el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
  setTimeout(() => el.classList.add('hide'), 1200);
}

// === PARTICLES ===
function boom(bx, by, col, count) {
  for (let i = 0; i < (count || 10); i++) {
    const a = Math.random() * 6.28, s = 2 + Math.random() * 5;
    particles.push({ x: bx, y: by, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: col, sz: 2 + Math.random() * 4 });
  }
}

// === HUD ===
function updateHUD() {
  document.getElementById('hp1').style.width = (p1.hp / p1.maxHp * 100) + '%';
  document.getElementById('hp2').style.width = (p2.hp / p2.maxHp * 100) + '%';
  document.getElementById('dash1').style.width = Math.max(0, (1 - p1.dashCooldown / p1.dashMaxCooldown) * 100) + '%';
  document.getElementById('dash2').style.width = Math.max(0, (1 - p2.dashCooldown / p2.dashMaxCooldown) * 100) + '%';
  document.getElementById('rd').textContent = 'Round ' + round;
  document.getElementById('p2Label').textContent = isAI ? 'AI (' + aiDiff + ')' : 'Player 2';
}

// === UPDATE ===
function update() {
  movePlayer(p1, 'w', 's', 'a', 'd', ' ', 'q', 'Shift', p2);
  // In vs AI mode, arrows also control P1 for convenience
  if (isAI) {
    if (keys['ArrowUp']) p1.vy -= (p1.speedBoost ? 1.6 : 1.1);
    if (keys['ArrowDown']) p1.vy += (p1.speedBoost ? 1.6 : 1.1);
    if (keys['ArrowLeft']) p1.vx -= (p1.speedBoost ? 1.6 : 1.1);
    if (keys['ArrowRight']) p1.vx += (p1.speedBoost ? 1.6 : 1.1);
    updateAI(p2, p1);
  } else {
    movePlayer(p2, 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', '0', 'Control', p1);
  }

  // Player collision
  const dx = p2.x - p1.x, dy = p2.y - p1.y, dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < p1.r + p2.r && dist > 0) {
    const overlap = (p1.r + p2.r - dist) / 2;
    const nx = dx / dist, ny = dy / dist;
    p1.x -= nx * overlap; p1.y -= ny * overlap;
    p2.x += nx * overlap; p2.y += ny * overlap;
    const dv1 = p1.vx * nx + p1.vy * ny, dv2 = p2.vx * nx + p2.vy * ny;
    p1.vx += (dv2 - dv1) * nx * 0.8; p1.vy += (dv2 - dv1) * ny * 0.8;
    p2.vx += (dv1 - dv2) * nx * 0.8; p2.vy += (dv1 - dv2) * ny * 0.8;
  }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx; b.y += b.vy; b.life--;
    if (b.x < b.r || b.x > W - b.r) { b.vx *= -1; b.bounces++; b.x = Math.max(b.r, Math.min(W - b.r, b.x)); sfxBounce(); }
    if (b.y < 60 + b.r || b.y > H - b.r) { b.vy *= -1; b.bounces++; b.y = Math.max(60 + b.r, Math.min(H - b.r, b.y)); sfxBounce(); }
    if (b.life <= 0 || b.bounces > 4) { bullets.splice(i, 1); continue; }

    for (const tgt of [p1, p2]) {
      if (tgt === b.owner && b.life > 180) continue;
      if (tgt.dashing) continue; // Invincible during dash
      const hdx = tgt.x - b.x, hdy = tgt.y - b.y;
      if (hdx * hdx + hdy * hdy < (tgt.r + b.r) * (tgt.r + b.r)) {
        if (tgt.shield) { tgt.shield = false; sfxShield(); boom(b.x, b.y, '#38bdf8', 15); bullets.splice(i, 1); break; }
        const dmg = b.dmg + b.bounces * 3;
        tgt.hp -= dmg; tgt.regenTimer = 0;
        sfxHit(); totalHits++; boom(b.x, b.y, b.color);
        tgt.vx += b.vx * 0.3; tgt.vy += b.vy * 0.3;
        bullets.splice(i, 1);
        if (tgt.hp <= 0) { tgt.hp = 0; handleKO(tgt); }
        updateHUD(); break;
      }
    }
  }

  // Powerups
  if (Math.random() < 0.003 && powerups.length < 2) spawnPowerup();
  for (let j = powerups.length - 1; j >= 0; j--) {
    powerups[j].life--;
    if (powerups[j].life <= 0) { powerups.splice(j, 1); continue; }
    for (const plr of [p1, p2]) {
      const pdx = plr.x - powerups[j].x, pdy = plr.y - powerups[j].y;
      if (pdx * pdx + pdy * pdy < (plr.r + powerups[j].r) * (plr.r + powerups[j].r)) {
        collectPowerup(plr, powerups[j]); powerups.splice(j, 1); break;
      }
    }
  }

  // Particles
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k]; p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.025; p.sz *= 0.97;
    if (p.life <= 0) particles.splice(k, 1);
  }

  updateHUD();
}

function handleKO(loser) {
  boom(loser.x, loser.y, loser.color, 25); sfxKO();
  if (loser === p1) p2Score++; else p1Score++;

  if (p1Score >= roundsToWin || p2Score >= roundsToWin) {
    st = 'win'; stopBgMusic();
    const winner = p1Score >= roundsToWin ? 'Player 1' : (isAI ? 'AI' : 'Player 2');
    document.getElementById('wt').textContent = winner + ' Wins!';
    document.getElementById('wt').style.color = p1Score >= roundsToWin ? '#3b82f6' : '#ef4444';
    document.getElementById('winShots').textContent = totalShots;
    document.getElementById('winHits').textContent = totalHits;
    document.getElementById('winDashes').textContent = totalDashes;
    if (p1Score >= roundsToWin) totalWins++;
    gamesPlayed++; localStorage.setItem('orbclash_wins', totalWins); localStorage.setItem('orbclash_gp', gamesPlayed);
    document.getElementById('hud').classList.add('hide');
    sfxWin();
    showScreen('win');
  } else {
    round++;
    // Show round transition
    document.getElementById('roundTitle').textContent = 'Round ' + round;
    document.getElementById('rsP1').textContent = p1Score;
    document.getElementById('rsP2').textContent = p2Score;
    document.getElementById('roundMsg').textContent = loser === p1 ? (isAI ? 'AI' : 'Player 2') + ' wins the round!' : 'Player 1 wins the round!';
    st = 'roundTransition';
    showScreen('roundScreen');
    setTimeout(() => { resetRound(); st = 'play'; showScreen(null); document.getElementById('hud').classList.remove('hide'); }, 2000);
  }
}

// === DRAWING ===
function drawOrb(ox, oy, r, color, p) {
  cx.fillStyle = color; cx.shadowColor = color; cx.shadowBlur = 25;
  cx.beginPath(); cx.arc(ox, oy, r, 0, 6.28); cx.fill(); cx.shadowBlur = 0;
  // Sheen
  const g = cx.createRadialGradient(ox - r * 0.3, oy - r * 0.3, 0, ox, oy, r);
  g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g; cx.beginPath(); cx.arc(ox, oy, r, 0, 6.28); cx.fill();
  // Shield ring
  if (p && p.shield) {
    cx.strokeStyle = '#22d3ee'; cx.lineWidth = 3;
    cx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.008) * 0.3;
    cx.beginPath(); cx.arc(ox, oy, r + 8, 0, 6.28); cx.stroke();
    cx.globalAlpha = 1;
  }
  // Charge indicator
  if (p && p.charging && p.chargeLevel > 0) {
    cx.strokeStyle = '#f59e0b'; cx.lineWidth = 3;
    cx.beginPath(); cx.arc(ox, oy, r + 12, -Math.PI / 2, -Math.PI / 2 + (p.chargeLevel / 100) * 6.28); cx.stroke();
  }
  // Dash trail
  if (p && p.dashing) {
    cx.globalAlpha = 0.3; cx.fillStyle = color;
    cx.beginPath(); cx.arc(ox - p.vx * 2, oy - p.vy * 2, r * 0.8, 0, 6.28); cx.fill();
    cx.beginPath(); cx.arc(ox - p.vx * 4, oy - p.vy * 4, r * 0.5, 0, 6.28); cx.fill();
    cx.globalAlpha = 1;
  }
}

function draw() {
  cx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#080812';
  cx.fillRect(0, 0, W, H);

  if (st !== 'play' && st !== 'roundTransition') return;

  // Arena border
  cx.strokeStyle = 'rgba(255,255,255,0.06)'; cx.lineWidth = 2; cx.strokeRect(4, 60, W - 8, H - 64);
  // Center line
  cx.setLineDash([8, 8]); cx.strokeStyle = 'rgba(255,255,255,0.04)';
  cx.beginPath(); cx.moveTo(W / 2, 60); cx.lineTo(W / 2, H); cx.stroke(); cx.setLineDash([]);

  // Players
  drawOrb(p1.x, p1.y, p1.r, p1.color, p1);
  drawOrb(p2.x, p2.y, p2.r, p2.color, p2);

  // Bullets
  for (const b of bullets) {
    cx.fillStyle = b.color; cx.globalAlpha = 0.8;
    cx.shadowColor = b.color; cx.shadowBlur = b.r > 6 ? 15 : 10;
    cx.beginPath(); cx.arc(b.x, b.y, b.r, 0, 6.28); cx.fill();
    cx.shadowBlur = 0; cx.globalAlpha = 1;
  }

  // Powerups
  for (const pup of powerups) {
    const pulse = 0.8 + Math.sin(Date.now() * 0.005) * 0.2;
    cx.fillStyle = pup.color; cx.shadowColor = pup.color; cx.shadowBlur = 15;
    cx.beginPath(); cx.arc(pup.x, pup.y, pup.r * pulse, 0, 6.28); cx.fill(); cx.shadowBlur = 0;
    cx.fillStyle = '#fff'; cx.font = '14px Inter'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(pup.icon, pup.x, pup.y);
    // Fade when dying
    if (pup.life < 120) { cx.globalAlpha = pup.life / 120; }
  }
  cx.globalAlpha = 1;

  // Particles
  for (const p of particles) {
    cx.globalAlpha = p.life; cx.fillStyle = p.color;
    cx.beginPath(); cx.arc(p.x, p.y, p.sz, 0, 6.28); cx.fill();
  }
  cx.globalAlpha = 1;

  // Score display at bottom
  cx.fillStyle = '#3b82f6'; cx.font = 'bold 14px Inter'; cx.textAlign = 'left';
  cx.fillText('Wins: ' + p1Score + '/' + roundsToWin, 20, H - 16);
  cx.fillStyle = '#ef4444'; cx.textAlign = 'right';
  cx.fillText('Wins: ' + p2Score + '/' + roundsToWin, W - 20, H - 16);
}

function loop() { if (st === 'play') { update(); draw(); } else { draw(); } requestAnimationFrame(loop); }

// === SCREENS ===
function showScreen(id) {
  ['menu', 'aiSelect', 'howToPlay', 'settings', 'pause', 'win', 'roundScreen'].forEach(s => {
    document.getElementById(s).classList.toggle('hide', s !== id);
  });
}

function startGame(vsAI, diff) {
  initAudio(); startBgMusic();
  isAI = vsAI; if (diff) aiDiff = diff;
  init(); st = 'play';
  showScreen(null);
  document.getElementById('hud').classList.remove('hide');
}

function showMenu() {
  st = 'menu'; stopBgMusic();
  totalWins = parseInt(localStorage.getItem('orbclash_wins')) || 0;
  gamesPlayed = parseInt(localStorage.getItem('orbclash_gp')) || 0;
  document.getElementById('menuWins').textContent = totalWins;
  document.getElementById('menuGames').textContent = gamesPlayed;
  document.getElementById('hud').classList.add('hide');
  showScreen('menu');
}

// === EVENT LISTENERS ===
document.getElementById('vsAiBtn').addEventListener('click', () => { sfxClick(); showScreen('aiSelect'); });
document.getElementById('vsPlayerBtn').addEventListener('click', () => { sfxClick(); startGame(false); });
document.getElementById('howBtn').addEventListener('click', () => { sfxClick(); showScreen('howToPlay'); });
document.getElementById('settingsBtn').addEventListener('click', () => { sfxClick(); showScreen('settings'); });
document.getElementById('howBackBtn').addEventListener('click', () => { sfxClick(); showScreen('menu'); });
document.getElementById('settingsBackBtn').addEventListener('click', () => { sfxClick(); showScreen('menu'); });
document.getElementById('aiBackBtn').addEventListener('click', () => { sfxClick(); showScreen('menu'); });

document.querySelectorAll('[data-ai]').forEach(card => {
  card.addEventListener('click', () => { sfxClick(); startGame(true, card.dataset.ai); });
});

document.getElementById('rematchBtn').addEventListener('click', () => { sfxClick(); startGame(isAI, aiDiff); });
document.getElementById('menuBtn').addEventListener('click', () => { sfxClick(); showMenu(); });
document.getElementById('resumeBtn').addEventListener('click', () => { sfxClick(); clearKeys(); st = 'play'; showScreen(null); document.getElementById('hud').classList.remove('hide'); });
document.getElementById('restartBtn2').addEventListener('click', () => { sfxClick(); startGame(isAI, aiDiff); });
document.getElementById('pauseMenuBtn').addEventListener('click', () => { sfxClick(); showMenu(); });

document.getElementById('sfxVol').addEventListener('input', e => { sfxVol = e.target.value / 100; });
document.getElementById('musicVol').addEventListener('input', e => { musicVol = e.target.value / 100; if (bgGain) bgGain.gain.value = musicVol * 0.06; });
document.getElementById('themeSelect').addEventListener('change', e => { document.documentElement.setAttribute('data-theme', e.target.value); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (st === 'play') { st = 'paused'; showScreen('pause'); }
    else if (st === 'paused') { clearKeys(); st = 'play'; showScreen(null); document.getElementById('hud').classList.remove('hide'); }
  }
  if (e.key === 'r' || e.key === 'R') { if (st === 'play' || st === 'over' || st === 'win') startGame(isAI, aiDiff); }
  if (e.key === 'm' || e.key === 'M') { if (st !== 'menu') showMenu(); }
});

// Gamepad
function pollGamepad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let gi = 0; gi < gps.length; gi++) {
    const gp = gps[gi]; if (!gp) continue;
    const player = gi === 0 ? 'p1' : 'p2';
    if (player === 'p1') {
      if (gp.axes[0] < -0.3) keys['a'] = true; else keys['a'] = false;
      if (gp.axes[0] > 0.3) keys['d'] = true; else keys['d'] = false;
      if (gp.axes[1] < -0.3) keys['w'] = true; else keys['w'] = false;
      if (gp.axes[1] > 0.3) keys['s'] = true; else keys['s'] = false;
      if (gp.buttons[7] && gp.buttons[7].pressed) keys[' '] = true; else keys[' '] = false;
      if (gp.buttons[0] && gp.buttons[0].pressed) keys['Shift'] = true; else keys['Shift'] = false;
    }
    if (player === 'p2' && !isAI) {
      if (gp.axes[0] < -0.3) keys['ArrowLeft'] = true; else keys['ArrowLeft'] = false;
      if (gp.axes[0] > 0.3) keys['ArrowRight'] = true; else keys['ArrowRight'] = false;
      if (gp.axes[1] < -0.3) keys['ArrowUp'] = true; else keys['ArrowUp'] = false;
      if (gp.axes[1] > 0.3) keys['ArrowDown'] = true; else keys['ArrowDown'] = false;
      if (gp.buttons[7] && gp.buttons[7].pressed) keys['Enter'] = true; else keys['Enter'] = false;
      if (gp.buttons[0] && gp.buttons[0].pressed) keys['Control'] = true; else keys['Control'] = false;
    }
  }
  requestAnimationFrame(pollGamepad);
}

window.addEventListener('resize', sz);

// === INIT ===
sz();
totalWins = parseInt(localStorage.getItem('orbclash_wins')) || 0;
gamesPlayed = parseInt(localStorage.getItem('orbclash_gp')) || 0;
document.getElementById('menuWins').textContent = totalWins;
document.getElementById('menuGames').textContent = gamesPlayed;
loop();
pollGamepad();
