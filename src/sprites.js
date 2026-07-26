// Canvas setup, pseudo-3D background, monster species, and the hero sprite.

export const canvas = document.getElementById('game-canvas');
export const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

export const HORIZON_RATIO = 0.34;

let stars = [];

export function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
  initStars();
}

export function initStars() {
  stars = Array.from({ length: 110 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height * HORIZON_RATIO,
    r: Math.random() * 1.6 + 0.4,
    speed: Math.random() * 6 + 2,
    phase: Math.random() * Math.PI * 2,
    tint: Math.random() < 0.18 ? '255,46,196' : (Math.random() < 0.3 ? '0,246,255' : '255,255,255'),
  }));
}

export function updateStars(dt) {
  const horizon = canvas.height * HORIZON_RATIO;
  for (const s of stars) {
    s.x -= s.speed * dt;
    if (s.x < -2) {
      s.x = canvas.width + 2;
      s.y = Math.random() * horizon;
    }
    s.phase += dt * 2;
  }
}

export function drawSky(now) {
  const horizon = canvas.height * HORIZON_RATIO;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#07021a');
  sky.addColorStop(0.6, '#150637');
  sky.addColorStop(1, '#2d0a52');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, horizon);

  // slow drifting nebula blooms
  const t = now / 1000;
  const blooms = [
    { x: 0.25 + Math.sin(t * 0.08) * 0.05, c: '120,40,180' },
    { x: 0.72 + Math.cos(t * 0.06) * 0.05, c: '20,120,190' },
  ];
  for (const b of blooms) {
    const g = ctx.createRadialGradient(
      canvas.width * b.x, horizon * 0.75, 0,
      canvas.width * b.x, horizon * 0.75, canvas.width * 0.3
    );
    g.addColorStop(0, `rgba(${b.c},0.22)`);
    g.addColorStop(1, `rgba(${b.c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, horizon);
  }

  for (const s of stars) {
    const tw = (Math.sin(s.phase) + 1) / 2;
    ctx.fillStyle = `rgba(${s.tint},${0.25 + tw * 0.6})`;
    ctx.fillRect(Math.round(s.x), Math.round(s.y), s.r * 2, s.r * 2);
  }

  const ground = ctx.createLinearGradient(0, horizon, 0, canvas.height);
  ground.addColorStop(0, '#1b0640');
  ground.addColorStop(1, '#050112');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon);

  ctx.fillStyle = 'rgba(160,90,255,0.35)';
  ctx.fillRect(0, horizon - 2, canvas.width, 2);
}

// Receding floor grid that scrolls toward the camera; this is what sells depth.
export function drawGrid(now) {
  const horizon = canvas.height * HORIZON_RATIO;
  const depth = canvas.height - horizon;
  const vp = canvas.width / 2;

  ctx.save();
  ctx.lineWidth = 1;

  ctx.strokeStyle = 'rgba(120,60,220,0.30)';
  for (let i = -14; i <= 14; i++) {
    const xBottom = vp + i * (canvas.width / 9);
    ctx.beginPath();
    ctx.moveTo(vp, horizon);
    ctx.lineTo(xBottom, canvas.height);
    ctx.stroke();
  }

  const scroll = (now / 1000 * 0.28) % 1;
  for (let i = 0; i < 18; i++) {
    const k = (i + scroll) / 18;
    const y = horizon + depth * k * k;
    const alpha = 0.06 + k * 0.34;
    ctx.strokeStyle = `rgba(150,80,255,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- shared pixel helpers ----------

export function px(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function drawChip(x, y, w, h, color, glow, glowColor) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = glowColor || color;
    ctx.shadowBlur = 16;
  }
  px(x, y, w, h, '#04010c');
  ctx.restore();

  px(x + 2, y + 2, w - 4, h - 4, color);
  px(x + 2, y + 2, w - 4, 2, 'rgba(255,255,255,0.35)');
  px(x + 2, y + 2, 2, h - 4, 'rgba(255,255,255,0.28)');
  px(x + 2, y + h - 4, w - 4, 2, 'rgba(0,0,0,0.4)');
  px(x + w - 4, y + 2, 2, h - 4, 'rgba(0,0,0,0.4)');
}

export function drawText3D(text, x, y, color, shadow, depth = 2) {
  ctx.fillStyle = shadow;
  for (let d = depth; d >= 1; d--) ctx.fillText(text, x + d, y + d);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// ---------- monsters ----------

export const MONSTER_TYPES = ['slime', 'bat', 'ghost', 'skull', 'eye'];

export const MONSTER_PITCH = { slime: 0.8, bat: 1.6, ghost: 1.1, skull: 0.65, eye: 1.3 };

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

export function drawSlime(t, color, seed) {
  const squash = 1 + Math.sin(t * 4 + seed) * 0.14;
  const w = 26 * squash;
  const h = 20 / squash;
  const dark = shade(color, -70);
  const light = shade(color, 70);

  px(-w / 2 - 2, -h, w + 4, h + 2, '#04010c');
  px(-w / 2, -h + 2, w, h - 2, color);
  px(-w / 2 + 2, -h + 3, w - 4, 3, light);
  px(-w / 2, -4, w, 3, dark);

  px(-8, -h + 6, 5, 6, '#fff');
  px(3, -h + 6, 5, 6, '#fff');
  px(-7, -h + 8, 3, 3, '#04010c');
  px(4, -h + 8, 3, 3, '#04010c');
}

export function drawBat(t, color, seed) {
  const flap = Math.sin(t * 9 + seed);
  const dark = shade(color, -70);
  const light = shade(color, 60);

  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.scale(dir, 1);
    ctx.rotate(flap * 0.55);
    px(7, -16, 16, 4, dark);
    px(9, -12, 13, 4, color);
    px(12, -8, 9, 3, dark);
    ctx.restore();
  }

  px(-9, -18, 18, 16, '#04010c');
  px(-7, -16, 14, 12, color);
  px(-7, -16, 14, 3, light);
  px(-8, -22, 4, 6, color);
  px(4, -22, 4, 6, color);
  px(-5, -13, 4, 4, '#ffd83d');
  px(1, -13, 4, 4, '#ffd83d');
  px(-4, -6, 2, 3, '#fff');
  px(2, -6, 2, 3, '#fff');
}

export function drawGhost(t, color, seed) {
  const float = Math.sin(t * 2.5 + seed) * 2;
  const dark = shade(color, -60);

  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.translate(0, float);

  px(-11, -22, 22, 18, '#04010c');
  px(-9, -20, 18, 16, color);
  px(-9, -20, 18, 3, shade(color, 70));

  for (let i = 0; i < 3; i++) {
    const wob = Math.sin(t * 5 + i * 1.5 + seed) * 3;
    px(-9 + i * 6, -6, 6, 5 + wob, i % 2 ? dark : color);
  }

  px(-6, -16, 4, 6, '#04010c');
  px(2, -16, 4, 6, '#04010c');
  px(-5, -14, 2, 2, '#9fe8ff');
  px(3, -14, 2, 2, '#9fe8ff');
  ctx.restore();
}

export function drawSkull(t, color, seed) {
  const chatter = Math.max(0, Math.sin(t * 7 + seed)) * 3;
  const light = shade(color, 80);

  px(-11, -24, 22, 18, '#04010c');
  px(-9, -22, 18, 15, color);
  px(-9, -22, 18, 3, light);

  px(-7, -18, 6, 7, '#04010c');
  px(1, -18, 6, 7, '#04010c');
  px(-6, -17, 4, 4, '#ff2ec4');
  px(2, -17, 4, 4, '#ff2ec4');
  px(-2, -11, 3, 3, '#04010c');

  px(-7, -6 + chatter, 14, 5, '#04010c');
  px(-6, -5 + chatter, 12, 3, color);
  for (let i = 0; i < 4; i++) px(-5 + i * 3, -5 + chatter, 1, 3, '#04010c');
}

export function drawEye(t, color, seed, lookDir) {
  const blink = Math.sin(t * 1.3 + seed) > 0.93;
  const dark = shade(color, -70);

  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI + Math.PI * 0.15;
    const wig = Math.sin(t * 4 + i + seed) * 3;
    const len = 12;
    ctx.save();
    ctx.translate(Math.cos(ang) * 9, -6 + Math.sin(ang) * 3);
    ctx.rotate(ang + wig * 0.05);
    px(0, 0, 3, len, dark);
    ctx.restore();
  }

  px(-13, -24, 26, 22, '#04010c');
  px(-11, -22, 22, 18, color);
  px(-11, -22, 22, 4, shade(color, 70));

  if (blink) {
    px(-11, -14, 22, 4, dark);
  } else {
    px(-8, -19, 14, 12, '#fff');
    const lx = Math.max(-3, Math.min(3, lookDir * 3));
    px(-3 + lx, -16, 6, 6, '#1a0d3d');
    px(-2 + lx, -15, 3, 3, '#04010c');
    px(-1 + lx, -18, 2, 2, 'rgba(255,255,255,0.9)');
  }
}

export function drawMonster(type, t, color, seed, lookDir, frozen, hitFlash) {
  ctx.save();
  if (hitFlash > 0) {
    ctx.filter = 'brightness(2.4)';
  }
  switch (type) {
    case 'slime': drawSlime(t, color, seed); break;
    case 'bat': drawBat(t, color, seed); break;
    case 'ghost': drawGhost(t, color, seed); break;
    case 'skull': drawSkull(t, color, seed); break;
    default: drawEye(t, color, seed, lookDir); break;
  }
  ctx.filter = 'none';

  if (frozen) drawIceEncasement(t, seed);
  ctx.restore();
}

// Ice block + crystal shards drawn over a frozen monster.
export function drawIceEncasement(t, seed) {
  ctx.save();
  ctx.globalAlpha = 0.42;
  px(-15, -27, 30, 30, '#9fe8ff');
  ctx.globalAlpha = 0.85;

  ctx.strokeStyle = '#eaffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(-15, -27, 30, 30);

  ctx.fillStyle = '#eaffff';
  const shards = [
    [-15, -27, 8, 5], [7, -27, 8, 5],
    [-15, -8, 6, 8], [9, -10, 6, 10],
    [-4, -30, 8, 5], [-6, 0, 10, 4],
  ];
  for (const [sx, sy, sw, sh] of shards) {
    const jitter = Math.sin(t * 3 + seed + sx) * 0.6;
    ctx.beginPath();
    ctx.moveTo(sx, sy + jitter);
    ctx.lineTo(sx + sw, sy + sh * 0.35 + jitter);
    ctx.lineTo(sx + sw * 0.4, sy + sh + jitter);
    ctx.closePath();
    ctx.fill();
  }

  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-14 + i * 9, -26);
    ctx.lineTo(-9 + i * 9, -12);
    ctx.lineTo(-13 + i * 9, 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- hero ----------

export function drawPlayer(now, player, opts) {
  const { hurt, shielded, surged, attackProgress } = opts;
  const t = now / 1000;
  const bobPhase = t * 6;
  const lift1 = Math.max(0, Math.sin(bobPhase)) * 3;
  const lift2 = Math.max(0, -Math.sin(bobPhase)) * 3;
  const bodyBob = Math.sin(bobPhase) * 1.3;
  const sway = Math.sin(t * 1.1) * 0.035;
  const breathe = 1 + Math.sin(t * 2.2) * 0.02;

  const swing = attackProgress > 0 ? Math.sin(attackProgress * Math.PI) : 0;
  const punch = 1 + swing * 0.16;
  const hurtShakeX = hurt ? Math.sin(now / 16) * 3.5 : 0;

  // ground shadow + magic circle
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#04010c';
  ctx.beginPath();
  ctx.ellipse(0, 2, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.5 + Math.sin(t * 3) * 0.15;
  ctx.strokeStyle = surged ? '#ffd83d' : '#7f5cff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 2, 26 + Math.sin(t * 2) * 3, 8, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(player.x + hurtShakeX, player.y - bodyBob);
  ctx.rotate(sway);
  ctx.scale(punch, punch * breathe);

  const armor = hurt ? '#ff4d5e' : '#12b8d6';
  const armorDark = hurt ? '#7a0f18' : '#075a70';
  const armorLight = hurt ? '#ff9aa5' : '#8ff0ff';
  const cloth = hurt ? '#4a0f18' : '#3a1f80';
  const clothDark = hurt ? '#2a0810' : '#22114f';

  // cape: three sway-offset panels behind the body
  for (let i = 0; i < 3; i++) {
    const s = Math.sin(t * 3 + i * 0.8) * (3 + i * 2.2);
    const yTop = -36 + i * 12;
    const yBot = yTop + 14;
    const wTop = 22 - i * 2;
    ctx.fillStyle = i % 2 === 0 ? cloth : clothDark;
    ctx.beginPath();
    ctx.moveTo(-wTop / 2, yTop);
    ctx.lineTo(wTop / 2, yTop);
    ctx.lineTo(wTop / 2 - 2 + s, yBot);
    ctx.lineTo(-wTop / 2 + 2 + s, yBot);
    ctx.closePath();
    ctx.fill();
  }

  // legs + boots
  px(-10, -17 - lift1, 8, 17, armorDark);
  px(2, -17 - lift2, 8, 17, armorDark);
  px(-11, -3 - lift1, 10, 4, '#04010c');
  px(1, -3 - lift2, 10, 4, '#04010c');

  // off arm counter-swings
  ctx.save();
  ctx.translate(-15, -35);
  ctx.rotate(Math.sin(bobPhase + Math.PI) * 0.28);
  px(-4, 0, 7, 15, armorDark);
  px(-4, 12, 7, 4, armor);
  ctx.restore();

  // torso
  px(-13, -40, 26, 24, '#04010c');
  px(-12, -39, 24, 22, armor);
  px(-12, -39, 24, 3, armorLight);
  px(-12, -21, 24, 3, armorDark);

  // pauldrons
  px(-17, -41, 10, 10, armorDark);
  px(6, -41, 10, 10, armorDark);
  px(-17, -41, 10, 3, armorLight);
  px(6, -41, 10, 3, armorLight);

  // chest gem
  const gemPulse = 0.55 + Math.sin(t * 3) * 0.35;
  ctx.save();
  ctx.globalAlpha = gemPulse;
  ctx.shadowColor = surged ? '#ffd83d' : '#c9a6ff';
  ctx.shadowBlur = 12;
  ctx.fillStyle = surged ? '#fff0b0' : '#c9a6ff';
  ctx.beginPath();
  ctx.moveTo(0, -33);
  ctx.lineTo(4, -29);
  ctx.lineTo(0, -25);
  ctx.lineTo(-4, -29);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // helmet
  px(-10, -58, 20, 19, '#04010c');
  px(-9, -57, 18, 17, armor);
  px(-9, -57, 18, 3, armorLight);
  px(-9, -46, 18, 2, armorDark);

  // crest plume, animated
  for (let i = 0; i < 4; i++) {
    const s = Math.sin(t * 4 + i * 0.7) * (1 + i * 0.8);
    px(-2 + s * 0.5, -66 + i * 3, 4, 4, i % 2 ? '#ff2ec4' : '#ff7ad9');
  }

  // visor with tracking pupils
  px(-8, -52, 16, 7, '#04010c');
  if (!player.blinking) {
    const look = Math.sin(t * 0.45) * 1.6;
    px(-7 + look, -51, 5, 4, '#ffd83d');
    px(2 + look, -51, 5, 4, '#ffd83d');
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.shadowColor = '#ffd83d';
    ctx.shadowBlur = 10;
    px(-7 + look, -51, 5, 4, '#fff6c0');
    px(2 + look, -51, 5, 4, '#fff6c0');
    ctx.restore();
  } else {
    px(-7, -50, 5, 1, armorDark);
    px(2, -50, 5, 1, armorDark);
  }

  // sword arm
  ctx.save();
  ctx.translate(13, -34);
  const restAngle = -18 * Math.PI / 180;
  const swingAngle = -155 * Math.PI / 180;
  ctx.rotate(restAngle + (swingAngle - restAngle) * swing);
  px(-2, -4, 8, 8, armorDark);
  px(6, -3, 8, 6, '#5c3a1a');
  px(13, -6, 3, 12, '#ffd83d');
  ctx.save();
  if (swing > 0.15) {
    ctx.shadowColor = '#00f6ff';
    ctx.shadowBlur = 18;
  }
  px(16, -3, 22, 6, '#eafcff');
  px(16, -3, 22, 2, '#ffffff');
  px(38, -2, 5, 4, '#9fe8ff');
  ctx.restore();
  ctx.restore();

  ctx.restore();

  // shield bubble
  if (shielded) {
    ctx.save();
    ctx.translate(player.x, player.y - 28);
    ctx.globalAlpha = 0.35 + Math.sin(t * 5) * 0.15;
    ctx.strokeStyle = '#9fe8ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#9fe8ff';
    ctx.fill();
    ctx.restore();
  }
}
