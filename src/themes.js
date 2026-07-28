// Per-level biomes for Adventure mode: palette, weather, and ambient hazards.
// Every level pulls a different theme so a long run keeps changing character.

export const THEMES = [
  {
    id: 'void', name: 'THE VOID',
    sky: ['#07021a', '#150637', '#2d0a52'],
    ground: ['#1b0640', '#050112'],
    grid: '150,80,255',
    horizon: 'rgba(160,90,255,0.35)',
    weather: null,
  },
  {
    id: 'rain', name: 'DROWNED FIELDS',
    sky: ['#03121c', '#062434', '#0a3a4a'],
    ground: ['#062a34', '#010c12'],
    grid: '60,180,220',
    horizon: 'rgba(90,200,240,0.4)',
    weather: 'rain', weatherColor: '#7fd6ff',
  },
  {
    id: 'storm', name: 'THUNDERHEAD',
    sky: ['#0a0a1e', '#161634', '#26264f'],
    ground: ['#1a1a38', '#04040e'],
    grid: '130,140,255',
    horizon: 'rgba(180,190,255,0.45)',
    weather: 'rain', weatherColor: '#c9d4ff',
    lightning: true,
  },
  {
    id: 'war', name: 'THE WARFRONT',
    sky: ['#1a0603', '#3a0f06', '#66200a'],
    ground: ['#3a1206', '#120400'],
    grid: '255,120,40',
    horizon: 'rgba(255,150,60,0.5)',
    weather: 'ember', weatherColor: '#ff8a3d',
    smoke: true,
  },
  {
    id: 'frost', name: 'FROZEN WASTES',
    sky: ['#04141e', '#0a2c3c', '#155066'],
    ground: ['#123a4a', '#020c12'],
    grid: '150,230,255',
    horizon: 'rgba(180,240,255,0.5)',
    weather: 'snow', weatherColor: '#dff6ff',
  },
  {
    id: 'chaos', name: 'CHAOS RIFT',
    sky: ['#12021a', '#33063a', '#5c0a52'],
    ground: ['#33064a', '#0a0110'],
    grid: '255,60,200',
    horizon: 'rgba(255,80,220,0.5)',
    weather: 'glitch', weatherColor: '#ff2ec4',
    glitch: true,
  },
  {
    id: 'blood', name: 'BLOOD MOON',
    sky: ['#160204', '#3a040c', '#5e0a16'],
    ground: ['#3a0810', '#0e0102'],
    grid: '255,70,90',
    horizon: 'rgba(255,90,110,0.5)',
    weather: 'ash', weatherColor: '#ff6b7a',
    moon: '#ff3344',
  },
  {
    id: 'toxic', name: 'TOXIC MIRE',
    sky: ['#04160a', '#0a3315', '#155c22'],
    ground: ['#0d3a18', '#020e05'],
    grid: '90,255,130',
    horizon: 'rgba(120,255,150,0.5)',
    weather: 'ash', weatherColor: '#7fff9f',
  },
  {
    id: 'desert', name: 'SCORCHED DUNES',
    sky: ['#2b1a06', '#6b3f0d', '#c9862c'],
    ground: ['#8a5c1e', '#2b1a06'],
    grid: '255,200,120',
    horizon: 'rgba(255,210,140,0.55)',
    weather: 'ash', weatherColor: '#e8c88a',
  },
  {
    id: 'volcano', name: 'THE CALDERA',
    sky: ['#1a0402', '#4a0a03', '#8a1a04'],
    ground: ['#5c1204', '#140200'],
    grid: '255,90,30',
    horizon: 'rgba(255,120,40,0.6)',
    weather: 'ember', weatherColor: '#ff6b2c',
    smoke: true,
  },
  {
    id: 'haunted', name: 'HAUNTED KEEP',
    sky: ['#0a0714', '#1a1030', '#2e1a4a'],
    ground: ['#1f1338', '#06040e'],
    grid: '160,140,255',
    horizon: 'rgba(180,160,255,0.4)',
    weather: 'ash', weatherColor: '#c9b8ff',
    moon: '#d8d0ff',
  },
  {
    id: 'forest', name: 'DARK FOREST',
    sky: ['#04120c', '#0a2a1a', '#12452c'],
    ground: ['#0d3320', '#02100a'],
    grid: '110,220,150',
    horizon: 'rgba(140,240,180,0.4)',
    weather: 'ash', weatherColor: '#8fd6a8',
  },
  {
    id: 'crystal', name: 'CRYSTAL CAVERNS',
    sky: ['#0a0620', '#1a0f4a', '#2e1a7a'],
    ground: ['#241466', '#080418'],
    grid: '200,150,255',
    horizon: 'rgba(220,180,255,0.55)',
    weather: 'snow', weatherColor: '#e0c8ff',
  },
  {
    id: 'cyber', name: 'NEON SPRAWL',
    sky: ['#050014', '#12003a', '#2a0060'],
    ground: ['#1a0044', '#030010'],
    grid: '0,255,220',
    horizon: 'rgba(0,255,220,0.6)',
    weather: 'rain', weatherColor: '#00ffdc',
    glitch: true,
  },
  {
    id: 'abyss', name: 'SUNKEN RUINS',
    sky: ['#01121e', '#02304a', '#04506e'],
    ground: ['#053a52', '#000c14'],
    grid: '80,200,255',
    horizon: 'rgba(120,220,255,0.5)',
    weather: 'snow', weatherColor: '#9fdcff',
  },
  {
    id: 'station', name: 'ORBITAL STATION',
    sky: ['#000006', '#04040f', '#0a0a1e'],
    ground: ['#101020', '#020206'],
    grid: '180,190,220',
    horizon: 'rgba(200,210,255,0.45)',
    weather: null,
  },
  {
    id: 'temple', name: 'ANCIENT TEMPLE',
    sky: ['#1a1204', '#3a2a08', '#6b4a12'],
    ground: ['#4a3410', '#120c02'],
    grid: '255,215,120',
    horizon: 'rgba(255,225,150,0.5)',
    weather: 'ash', weatherColor: '#e8d08a',
  },
  {
    id: 'corrupt', name: 'CORRUPTED DIMENSION',
    sky: ['#0a0012', '#2a0030', '#4a0050'],
    ground: ['#30003a', '#08000c'],
    grid: '255,0,180',
    horizon: 'rgba(255,60,200,0.6)',
    weather: 'glitch', weatherColor: '#ff00b4',
    glitch: true,
  },
  {
    id: 'heaven', name: 'THE ASCENT',
    sky: ['#1a2a4a', '#4a6a9a', '#a8c8e8'],
    ground: ['#8aa8cc', '#243a5c'],
    grid: '255,255,220',
    horizon: 'rgba(255,255,230,0.7)',
    weather: 'snow', weatherColor: '#ffffff',
  },
  {
    id: 'hell', name: 'THE INFERNO',
    sky: ['#1a0000', '#4a0000', '#8a0a00'],
    ground: ['#5c0400', '#120000'],
    grid: '255,50,20',
    horizon: 'rgba(255,80,40,0.65)',
    weather: 'ember', weatherColor: '#ff3c14',
    smoke: true,
  },
  {
    id: 'final', name: 'FINAL BATTLEFIELD',
    sky: ['#0a0008', '#2a0018', '#5a0030'],
    ground: ['#3a0020', '#0a0006'],
    grid: '255,215,61',
    horizon: 'rgba(255,215,61,0.7)',
    weather: 'ember', weatherColor: '#ffd83d',
    lightning: true, smoke: true,
  },
];

export function themeForLevel(level) {
  return THEMES[(Math.max(1, level) - 1) % THEMES.length];
}

// ---------- weather ----------

let drops = [];
let lightningTimer = 0;
let lightningFlash = 0;
let glitchTimer = 0;

export function resetWeather() {
  drops = [];
  lightningTimer = rand(2, 6);
  lightningFlash = 0;
  glitchTimer = 0;
}

const rand = (a, b) => a + Math.random() * (b - a);

function seedDrops(theme, w, h) {
  const target = theme.weather === 'rain' ? 150
    : theme.weather === 'snow' ? 90
    : theme.weather === 'ember' ? 60
    : theme.weather === 'ash' ? 70
    : theme.weather === 'glitch' ? 40 : 0;

  while (drops.length < target) {
    drops.push(makeDrop(theme, w, h, true));
  }
  if (drops.length > target) drops.length = target;
}

function makeDrop(theme, w, h, anywhere) {
  const kind = theme.weather;
  const base = {
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : -20,
    life: 1,
  };
  if (kind === 'rain') return { ...base, vy: rand(700, 1100), vx: rand(-90, -40), len: rand(10, 22) };
  if (kind === 'snow') return { ...base, vy: rand(30, 80), vx: rand(-20, 20), size: rand(2, 4), phase: Math.random() * 6 };
  if (kind === 'ember') return { ...base, y: anywhere ? Math.random() * h : h + 10, vy: rand(-120, -50), vx: rand(-30, 30), size: rand(2, 4), phase: Math.random() * 6 };
  if (kind === 'ash') return { ...base, vy: rand(25, 60), vx: rand(-15, 15), size: rand(2, 3), phase: Math.random() * 6 };
  if (kind === 'glitch') return { ...base, vy: rand(-40, 40), w: rand(20, 90), h: rand(2, 6), life: rand(0.1, 0.5), maxLife: 0.5 };
  return base;
}

export function updateWeather(theme, dt, w, h) {
  if (!theme) return;

  if (theme.lightning) {
    lightningTimer -= dt;
    if (lightningTimer <= 0) {
      lightningTimer = rand(3, 9);
      lightningFlash = 0.55;
    }
    if (lightningFlash > 0) lightningFlash = Math.max(0, lightningFlash - dt * 2.2);
  }

  if (theme.glitch) {
    glitchTimer -= dt;
    if (glitchTimer <= 0) glitchTimer = rand(0.1, 0.6);
  }

  if (!theme.weather) { drops = []; return; }
  seedDrops(theme, w, h);

  for (const d of drops) {
    d.x += (d.vx || 0) * dt;
    d.y += (d.vy || 0) * dt;
    if (d.phase !== undefined) {
      d.phase += dt * 2;
      d.x += Math.sin(d.phase) * 12 * dt;
    }
    if (d.maxLife) {
      d.life -= dt;
      if (d.life <= 0) Object.assign(d, makeDrop(theme, w, h, false), { life: rand(0.1, 0.5), maxLife: 0.5 });
    }
    const gone = theme.weather === 'ember' ? d.y < -20 : d.y > h + 20;
    if (gone || d.x < -60 || d.x > w + 60) {
      Object.assign(d, makeDrop(theme, w, h, false));
    }
  }
}

export function drawWeather(ctx, theme, w, h) {
  if (!theme) return;
  const color = theme.weatherColor || '#ffffff';

  if (theme.weather === 'rain') {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of drops) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.vx * 0.012, d.y + d.len);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (theme.weather === 'snow' || theme.weather === 'ash') {
    ctx.fillStyle = color;
    ctx.globalAlpha = theme.weather === 'ash' ? 0.5 : 0.75;
    for (const d of drops) ctx.fillRect(d.x, d.y, d.size, d.size);
    ctx.globalAlpha = 1;
  } else if (theme.weather === 'ember') {
    for (const d of drops) {
      ctx.globalAlpha = 0.5 + Math.sin(d.phase) * 0.3;
      ctx.fillStyle = color;
      ctx.fillRect(d.x, d.y, d.size, d.size);
    }
    ctx.globalAlpha = 1;
  } else if (theme.weather === 'glitch') {
    for (const d of drops) {
      ctx.globalAlpha = Math.max(0, d.life / (d.maxLife || 0.5)) * 0.5;
      ctx.fillStyle = color;
      ctx.fillRect(d.x, d.y, d.w, d.h);
    }
    ctx.globalAlpha = 1;
  }
}

// Full-screen lightning wash, drawn above the world but below the HUD.
export function drawLightning(ctx, w, h) {
  if (lightningFlash <= 0) return;
  ctx.globalAlpha = lightningFlash * 0.55;
  ctx.fillStyle = '#dfe6ff';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}

export function lightningLevel() { return lightningFlash; }
