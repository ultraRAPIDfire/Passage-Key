// Boss encounters for Adventure mode: definitions, phase logic, and sprites.

import { px, shade } from './sprites.js';

export const BOSS_INTERVAL = 5; // a boss guards every 5th level

export const BOSS_TYPES = [
  {
    id: 'warden',
    name: 'THE WARDEN',
    sprite: 'warden',
    palette: { main: '#3ba7c9', dark: '#0d4d63', light: '#9fe8ff', glow: '#ffd83d' },
    title: 'Gatekeeper of the First Seal',
  },
  {
    id: 'hydra',
    name: 'VERSE HYDRA',
    sprite: 'hydra',
    palette: { main: '#37c96a', dark: '#0d5a2c', light: '#9fffc0', glow: '#ff2ec4' },
    title: 'Three Tongues, One Hunger',
  },
  {
    id: 'lich',
    name: 'THE LEXICON',
    sprite: 'lich',
    palette: { main: '#a77bff', dark: '#40217a', light: '#e0d0ff', glow: '#00f6ff' },
    title: 'Keeper of Forbidden Words',
  },
];

export function bossForLevel(level) {
  const tier = Math.max(1, Math.floor(level / BOSS_INTERVAL));
  const def = BOSS_TYPES[(tier - 1) % BOSS_TYPES.length];
  const maxHp = 120 + tier * 70;
  return {
    ...def,
    tier,
    maxHp,
    hp: maxHp,
    x: 0,
    y: 0,
    hurtFlash: 0,
    attackTimer: 0,
    attackInterval: Math.max(1.5, 3.2 - tier * 0.25),
    entering: 1,          // 1 → 0 as the boss slides in
    defeated: false,
    deathTimer: 0,
    enraged: false,
  };
}

export function isBossLevel(level) {
  return level > 0 && level % BOSS_INTERVAL === 0;
}

// Returns true on the frame the boss should launch a new phrase.
export function updateBoss(boss, dt, canvasWidth, canvasHeight) {
  boss.x = canvasWidth / 2;
  boss.y = canvasHeight * 0.2;

  if (boss.entering > 0) {
    boss.entering = Math.max(0, boss.entering - dt * 1.2);
    return false;
  }
  if (boss.defeated) {
    boss.deathTimer += dt;
    return false;
  }
  if (boss.hurtFlash > 0) boss.hurtFlash = Math.max(0, boss.hurtFlash - dt);

  // below a third health the boss enrages and attacks noticeably faster
  if (!boss.enraged && boss.hp / boss.maxHp <= 0.34) {
    boss.enraged = true;
    boss.attackInterval *= 0.6;
  }

  boss.attackTimer -= dt;
  if (boss.attackTimer <= 0) {
    boss.attackTimer = boss.attackInterval;
    return true;
  }
  return false;
}

export function damageBoss(boss, amount) {
  boss.hp = Math.max(0, boss.hp - amount);
  boss.hurtFlash = 0.18;
  if (boss.hp === 0 && !boss.defeated) {
    boss.defeated = true;
    boss.deathTimer = 0;
    return true;
  }
  return false;
}

// How many phrases the boss throws per volley.
export function bossVolleySize(boss) {
  const base = 1 + Math.floor(boss.tier / 2);
  return boss.enraged ? base + 1 : base;
}

// ---------- sprites ----------

function drawWarden(ctx, t, p, hurt) {
  const bob = Math.sin(t * 1.8) * 4;
  const body = hurt ? '#ff4d5e' : p.main;
  const dark = hurt ? '#7a0f18' : p.dark;

  ctx.save();
  ctx.translate(0, bob);

  // shoulder plates
  px(-52, -18, 22, 34, dark);
  px(30, -18, 22, 34, dark);
  px(-52, -18, 22, 5, p.light);
  px(30, -18, 22, 5, p.light);

  // core body
  px(-32, -34, 64, 62, '#04010c');
  px(-29, -31, 58, 56, body);
  px(-29, -31, 58, 6, p.light);
  px(-29, 19, 58, 6, dark);

  // rib slats
  for (let i = 0; i < 4; i++) px(-22, -14 + i * 10, 44, 3, dark);

  // central eye
  const pulse = 0.6 + Math.sin(t * 4) * 0.4;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.shadowColor = p.glow;
  ctx.shadowBlur = 24;
  px(-13, -18, 26, 20, p.glow);
  ctx.restore();
  px(-9, -14, 18, 12, '#04010c');
  const look = Math.sin(t * 0.8) * 4;
  px(-4 + look, -12, 9, 8, p.glow);

  // crown horns
  px(-24, -44, 8, 14, dark);
  px(16, -44, 8, 14, dark);
  px(-6, -50, 12, 20, dark);

  ctx.restore();
}

function drawHydra(ctx, t, p, hurt) {
  const body = hurt ? '#ff4d5e' : p.main;
  const dark = hurt ? '#7a0f18' : p.dark;

  // body mound
  px(-40, 4, 80, 26, '#04010c');
  px(-37, 7, 74, 20, body);
  px(-37, 7, 74, 5, p.light);

  // three sinuous necks with heads
  const necks = [-26, 0, 26];
  necks.forEach((baseX, i) => {
    const sway = Math.sin(t * 2.2 + i * 1.9) * 10;
    const rise = Math.sin(t * 1.6 + i) * 4;

    ctx.save();
    ctx.translate(baseX, 6);
    for (let seg = 0; seg < 5; seg++) {
      const k = seg / 5;
      px(-5 + sway * k, -seg * 9 - rise * k, 11, 10, seg % 2 ? dark : body);
    }
    // head
    const hx = sway - 2;
    const hy = -50 - rise;
    px(hx - 10, hy - 2, 22, 16, '#04010c');
    px(hx - 8, hy, 18, 12, body);
    px(hx - 8, hy, 18, 3, p.light);
    // eyes
    const blink = Math.sin(t * 3 + i * 2) > 0.9;
    px(hx - 5, hy + 4, 4, blink ? 1 : 4, blink ? dark : p.glow);
    px(hx + 2, hy + 4, 4, blink ? 1 : 4, blink ? dark : p.glow);
    // jaw snapping
    const open = Math.max(0, Math.sin(t * 4 + i * 2)) * 4;
    px(hx - 7, hy + 12 + open, 16, 4, dark);
    ctx.restore();
  });
}

function drawLich(ctx, t, p, hurt) {
  const body = hurt ? '#ff4d5e' : p.main;
  const dark = hurt ? '#7a0f18' : p.dark;
  const float = Math.sin(t * 1.5) * 6;

  ctx.save();
  ctx.translate(0, float);

  // tattered robe
  for (let i = 0; i < 4; i++) {
    const sway = Math.sin(t * 2.4 + i * 0.9) * (4 + i * 3);
    const yTop = 4 + i * 12;
    const w = 56 - i * 8;
    ctx.fillStyle = i % 2 ? dark : body;
    ctx.beginPath();
    ctx.moveTo(-w / 2, yTop);
    ctx.lineTo(w / 2, yTop);
    ctx.lineTo(w / 2 - 4 + sway, yTop + 14);
    ctx.lineTo(-w / 2 + 4 + sway, yTop + 14);
    ctx.closePath();
    ctx.fill();
  }

  // shoulders + arms
  px(-40, -6, 16, 14, dark);
  px(24, -6, 16, 14, dark);

  // conjuring orbs in each hand
  [-40, 32].forEach((hx, i) => {
    const orbPulse = 0.5 + Math.sin(t * 5 + i * 2) * 0.5;
    ctx.save();
    ctx.globalAlpha = orbPulse;
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 18;
    px(hx, 10 + Math.sin(t * 3 + i) * 3, 10, 10, p.glow);
    ctx.restore();
  });

  // skull
  px(-22, -46, 44, 40, '#04010c');
  px(-19, -43, 38, 34, '#e8e0d0');
  px(-19, -43, 38, 5, '#fffaf0');

  // glowing sockets
  ctx.save();
  ctx.shadowColor = p.glow;
  ctx.shadowBlur = 16;
  px(-13, -33, 11, 12, p.glow);
  px(3, -33, 11, 12, p.glow);
  ctx.restore();
  px(-11, -30, 6, 7, '#04010c');
  px(5, -30, 6, 7, '#04010c');

  // nasal cavity + teeth
  px(-3, -19, 6, 6, '#04010c');
  const chatter = Math.max(0, Math.sin(t * 6)) * 2;
  px(-13, -12 + chatter, 26, 5, '#04010c');
  for (let i = 0; i < 6; i++) px(-12 + i * 4, -12 + chatter, 2, 5, '#e8e0d0');

  // crown
  px(-24, -54, 48, 8, dark);
  [-20, -6, 8, 18].forEach((cx) => px(cx, -64, 6, 12, dark));

  ctx.restore();
}

export function drawBoss(ctx, boss, now) {
  const t = now / 1000;
  const hurt = boss.hurtFlash > 0;

  ctx.save();
  ctx.translate(boss.x, boss.y);

  // slide-in from above, then settle
  if (boss.entering > 0) {
    ctx.translate(0, -boss.entering * 260);
    ctx.globalAlpha = 1 - boss.entering * 0.5;
  }

  // dissolve on death
  if (boss.defeated) {
    const d = Math.min(1, boss.deathTimer / 1.4);
    ctx.globalAlpha = 1 - d;
    ctx.translate(Math.sin(now / 30) * 6 * d, d * 40);
    ctx.scale(1 + d * 0.2, 1 - d * 0.3);
  }

  const scale = 1.6 + boss.tier * 0.08;
  ctx.scale(scale, scale);

  // menacing aura: soft radial bloom rather than a flat disc
  ctx.save();
  const pulse = 0.5 + Math.sin(t * 2) * 0.18;
  const aura = ctx.createRadialGradient(0, -10, 10, 0, -10, 110);
  aura.addColorStop(0, `${boss.palette.glow}55`);
  aura.addColorStop(0.45, `${boss.palette.main}33`);
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = pulse;
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, -10, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  switch (boss.sprite) {
    case 'hydra': drawHydra(ctx, t, boss.palette, hurt); break;
    case 'lich': drawLich(ctx, t, boss.palette, hurt); break;
    default: drawWarden(ctx, t, boss.palette, hurt); break;
  }

  ctx.restore();
}
