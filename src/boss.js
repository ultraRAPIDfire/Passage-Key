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
  {
    id: 'colossus',
    name: 'THE COLOSSUS',
    sprite: 'colossus',
    palette: { main: '#8a8f9e', dark: '#3d424f', light: '#d6dbe6', glow: '#ff8a3d' },
    title: 'Mountain That Walks',
  },
  {
    id: 'wyrm',
    name: 'EMBER WYRM',
    sprite: 'wyrm',
    palette: { main: '#ff6b2c', dark: '#8a2a08', light: '#ffc07a', glow: '#ffd83d' },
    title: 'Tongue of Cinders',
  },
  {
    id: 'kraken',
    name: 'THE DEEPSPEAK',
    sprite: 'kraken',
    palette: { main: '#1f8fa8', dark: '#0a3d4d', light: '#8fe6ff', glow: '#37ff8b' },
    title: 'Voice Beneath the Tide',
  },
  {
    id: 'reaper',
    name: 'THE REDACTOR',
    sprite: 'reaper',
    palette: { main: '#2b2b3d', dark: '#111119', light: '#8f8fb0', glow: '#ff2ec4' },
    title: 'It Deletes What You Forget',
  },
  {
    id: 'titan',
    name: 'OMNISCRIBE',
    sprite: 'titan',
    palette: { main: '#ffd83d', dark: '#7a5c00', light: '#fff6c0', glow: '#ffffff' },
    title: 'The Eye That Reads All',
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

function drawColossus(ctx, t, p, hurt) {
  const step = Math.sin(t * 1.4);
  const body = hurt ? '#ff4d5e' : p.main;
  const dark = hurt ? '#7a0f18' : p.dark;

  // heavy arms swing counter to each other
  [[-46, 1], [30, -1]].forEach(([ax, dir]) => {
    ctx.save();
    ctx.translate(ax + 8, -6);
    ctx.rotate(step * 0.12 * dir);
    px(-8, 0, 18, 40, dark);
    px(-8, 0, 18, 5, p.light);
    px(-11, 36, 24, 14, body);
    ctx.restore();
  });

  px(-34, -36, 68, 60, '#04010c');
  px(-31, -33, 62, 54, body);
  px(-31, -33, 62, 6, p.light);

  // cracks leaking molten light
  ctx.save();
  ctx.globalAlpha = 0.55 + Math.sin(t * 3) * 0.3;
  ctx.strokeStyle = p.glow;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-20, -30); ctx.lineTo(-8, -10); ctx.lineTo(-16, 8);
  ctx.moveTo(14, -28); ctx.lineTo(6, -6); ctx.lineTo(18, 12);
  ctx.stroke();
  ctx.restore();

  // core furnace
  ctx.save();
  ctx.shadowColor = p.glow;
  ctx.shadowBlur = 26;
  px(-12, -14, 24, 22, p.glow);
  ctx.restore();
  px(-8, -10, 16, 14, '#04010c');

  // blunt head sunk into the shoulders
  px(-16, -56, 32, 22, dark);
  px(-16, -56, 32, 4, p.light);
  ctx.save();
  ctx.shadowColor = p.glow;
  ctx.shadowBlur = 14;
  px(-10, -48, 8, 7, p.glow);
  px(2, -48, 8, 7, p.glow);
  ctx.restore();
}

function drawWyrm(ctx, t, p, hurt) {
  const body = hurt ? '#ff4d5e' : p.main;
  const dark = hurt ? '#7a0f18' : p.dark;
  const sway = Math.sin(t * 1.9);

  // membranous wings
  [[-1], [1]].forEach(([dir]) => {
    ctx.save();
    ctx.scale(dir, 1);
    ctx.translate(20, -14);
    ctx.rotate(Math.sin(t * 3) * 0.22 - 0.2);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(52, -26);
    ctx.lineTo(48, 6);
    ctx.lineTo(40, -4);
    ctx.lineTo(30, 14);
    ctx.lineTo(20, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  px(-22, -6, 44, 32, '#04010c');
  px(-19, -3, 38, 26, body);
  px(-19, -3, 38, 5, p.light);

  // serpentine neck
  ctx.save();
  ctx.translate(0, -4);
  for (let i = 0; i < 5; i++) {
    const k = i / 5;
    px(-9 + sway * 10 * k, -10 - i * 11, 18 - i, 12, i % 2 ? dark : body);
  }
  const hx = sway * 10;
  const hy = -66;
  // horned head
  px(hx - 16, hy, 32, 18, '#04010c');
  px(hx - 14, hy + 2, 28, 14, body);
  px(hx - 14, hy + 2, 28, 3, p.light);
  px(hx - 18, hy - 8, 7, 12, dark);
  px(hx + 11, hy - 8, 7, 12, dark);
  ctx.save();
  ctx.shadowColor = p.glow;
  ctx.shadowBlur = 14;
  px(hx - 9, hy + 6, 6, 5, p.glow);
  px(hx + 3, hy + 6, 6, 5, p.glow);
  ctx.restore();
  // breath glow builds and fades
  const breath = Math.max(0, Math.sin(t * 1.6));
  if (breath > 0.4) {
    ctx.globalAlpha = (breath - 0.4) * 1.4;
    ctx.fillStyle = p.glow;
    ctx.beginPath();
    ctx.arc(hx, hy + 20, 10 * breath, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawKraken(ctx, t, p, hurt) {
  const body = hurt ? '#ff4d5e' : p.main;
  const dark = hurt ? '#7a0f18' : p.dark;

  // writhing tentacles behind the mantle
  for (let i = 0; i < 7; i++) {
    const baseX = -42 + i * 14;
    ctx.save();
    ctx.translate(baseX, 12);
    for (let s = 0; s < 5; s++) {
      const wig = Math.sin(t * 3 + i * 0.9 + s * 0.6) * (3 + s * 2.2);
      px(-4 + wig, s * 9, 9 - s, 10, s % 2 ? dark : body);
    }
    ctx.restore();
  }

  // bulbous mantle
  px(-32, -40, 64, 52, '#04010c');
  px(-29, -37, 58, 46, body);
  px(-29, -37, 58, 6, p.light);
  px(-24, -46, 48, 10, body);

  // huge eyes
  [[-16], [8]].forEach(([ex]) => {
    px(ex, -26, 20, 16, '#04010c');
    px(ex + 2, -24, 16, 12, '#ffffff');
    const look = Math.sin(t * 0.9) * 3;
    px(ex + 6 + look, -21, 7, 7, dark);
  });

  // beak
  ctx.fillStyle = '#04010c';
  ctx.beginPath();
  ctx.moveTo(-8, -4); ctx.lineTo(8, -4); ctx.lineTo(0, 10);
  ctx.closePath();
  ctx.fill();
}

function drawReaper(ctx, t, p, hurt) {
  const body = hurt ? '#ff4d5e' : p.main;
  const dark = hurt ? '#7a0f18' : p.dark;
  const float = Math.sin(t * 1.3) * 7;

  ctx.save();
  ctx.translate(0, float);

  // ragged cloak
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-30, -34);
  ctx.lineTo(30, -34);
  ctx.lineTo(36, 30);
  for (let i = 5; i >= 0; i--) {
    const x = -36 + i * 14.4;
    const y = 30 + Math.sin(t * 3 + i) * 7;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  px(-30, -34, 60, 6, dark);

  // hood
  px(-22, -58, 44, 30, dark);
  px(-16, -52, 32, 22, '#04010c');

  // two burning points where a face should be
  ctx.save();
  ctx.shadowColor = p.glow;
  ctx.shadowBlur = 20;
  const pulse = 0.6 + Math.sin(t * 4) * 0.4;
  ctx.globalAlpha = pulse;
  px(-10, -44, 7, 7, p.glow);
  px(4, -44, 7, 7, p.glow);
  ctx.restore();

  ctx.restore();

  // scythe sweeps slowly
  ctx.save();
  ctx.translate(34, -20 + float);
  ctx.rotate(Math.sin(t * 1.1) * 0.18);
  px(0, -34, 5, 74, '#4a3520');
  ctx.fillStyle = p.light;
  ctx.beginPath();
  ctx.moveTo(3, -34);
  ctx.lineTo(-40, -46);
  ctx.lineTo(-24, -26);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTitan(ctx, t, p, hurt) {
  const body = hurt ? '#ff4d5e' : p.main;
  const dark = hurt ? '#7a0f18' : p.dark;

  // counter-rotating orbital rings
  [1, -1].forEach((dir, i) => {
    ctx.save();
    ctx.rotate(t * 0.5 * dir);
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = i ? dark : body;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -6, 74 - i * 12, 22 + i * 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  // floating rune shards
  for (let i = 0; i < 6; i++) {
    const a = t * 0.8 + (i / 6) * Math.PI * 2;
    const rx = Math.cos(a) * 62;
    const ry = Math.sin(a) * 26 - 6;
    ctx.globalAlpha = 0.5 + Math.sin(t * 3 + i) * 0.4;
    px(rx - 3, ry - 3, 7, 7, p.glow);
  }
  ctx.globalAlpha = 1;

  // the eye itself
  ctx.save();
  ctx.shadowColor = p.glow;
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#04010c';
  ctx.beginPath();
  ctx.ellipse(0, -6, 46, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -6, 42, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  const blink = Math.sin(t * 0.7) > 0.94;
  if (blink) {
    px(-42, -10, 84, 8, dark);
  } else {
    const look = Math.sin(t * 0.6) * 12;
    ctx.fillStyle = '#04010c';
    ctx.beginPath();
    ctx.ellipse(look, -6, 17, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = p.glow;
    ctx.beginPath();
    ctx.arc(look, -6, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
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
    case 'colossus': drawColossus(ctx, t, boss.palette, hurt); break;
    case 'wyrm': drawWyrm(ctx, t, boss.palette, hurt); break;
    case 'kraken': drawKraken(ctx, t, boss.palette, hurt); break;
    case 'reaper': drawReaper(ctx, t, boss.palette, hurt); break;
    case 'titan': drawTitan(ctx, t, boss.palette, hurt); break;
    default: drawWarden(ctx, t, boss.palette, hurt); break;
  }

  ctx.restore();
}
