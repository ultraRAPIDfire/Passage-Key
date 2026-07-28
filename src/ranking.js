// Competitive ranking: tiers, Rank Point maths, and progress helpers.
//
// RP is deliberately hard to climb at the top: placement sets the baseline,
// then raw typing performance (WPM, accuracy, survival) nudges it. Losing
// costs RP, so rank reflects sustained skill rather than time played.

export const RANKS = [
  { id: 'bronze1',   name: 'Bronze I',        short: 'B1',  min: 0,    color: '#a97142' },
  { id: 'bronze2',   name: 'Bronze II',       short: 'B2',  min: 300,  color: '#b87e4c' },
  { id: 'bronze3',   name: 'Bronze III',      short: 'B3',  min: 600,  color: '#c78b56' },
  { id: 'silver1',   name: 'Silver I',        short: 'S1',  min: 900,  color: '#9aa4b0' },
  { id: 'silver2',   name: 'Silver II',       short: 'S2',  min: 1200, color: '#aab4c0' },
  { id: 'silver3',   name: 'Silver III',      short: 'S3',  min: 1500, color: '#bac4d0' },
  { id: 'gold1',     name: 'Gold I',          short: 'G1',  min: 1800, color: '#e0b23c' },
  { id: 'gold2',     name: 'Gold II',         short: 'G2',  min: 2100, color: '#eec14a' },
  { id: 'gold3',     name: 'Gold III',        short: 'G3',  min: 2400, color: '#ffd83d' },
  { id: 'plat1',     name: 'Platinum I',      short: 'P1',  min: 2700, color: '#3fd6c8' },
  { id: 'plat2',     name: 'Platinum II',     short: 'P2',  min: 3000, color: '#54e2d4' },
  { id: 'plat3',     name: 'Platinum III',    short: 'P3',  min: 3300, color: '#6bf0e2' },
  { id: 'dia1',      name: 'Diamond I',       short: 'D1',  min: 3600, color: '#5aa8ff' },
  { id: 'dia2',      name: 'Diamond II',      short: 'D2',  min: 3900, color: '#7cbcff' },
  { id: 'dia3',      name: 'Diamond III',     short: 'D3',  min: 4200, color: '#9ed0ff' },
  { id: 'master',    name: 'Master',          short: 'M',   min: 4500, color: '#c07bff' },
  { id: 'grand',     name: 'Grandmaster',     short: 'GM',  min: 5100, color: '#ff5ad0' },
  { id: 'elite',     name: 'Elite Typist',    short: 'ET',  min: 5800, color: '#ff7a3d' },
  { id: 'legend',    name: 'Legendary Typist', short: 'LT', min: 6600, color: '#ffe14a' },
];

export const STARTING_RP = 0;

export function rankFor(rp) {
  let out = RANKS[0];
  for (const r of RANKS) if (rp >= r.min) out = r;
  return out;
}

export function nextRank(rp) {
  return RANKS.find(r => r.min > rp) || null;
}

// 0..1 progress toward the next tier; the apex rank always reads full.
export function rankProgress(rp) {
  const cur = rankFor(rp);
  const nxt = nextRank(rp);
  if (!nxt) return 1;
  return Math.max(0, Math.min(1, (rp - cur.min) / (nxt.min - cur.min)));
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Placement is the dominant term: winning should always beat a strong loss.
function placementRp(placement, fieldSize) {
  if (!placement || !fieldSize || fieldSize < 2) return 0;
  const top = fieldSize / 2;
  if (placement === 1) return 28;
  if (placement === 2) return 16;
  if (placement <= top) return 6;
  // Bottom half loses progressively more the worse you finish.
  const depth = (placement - top) / Math.max(1, fieldSize - top);
  return Math.round(-8 - depth * 14);
}

// Typing quality can swing the result by roughly +/- 18 RP.
function performanceRp({ wpm = 0, accuracy = 100, survivedSec = 0 }) {
  const wpmTerm = clamp((wpm - 45) / 55, -1, 1) * 10;        // 45 WPM is par
  const accTerm = clamp((accuracy - 90) / 10, -1, 1) * 6;    // 90% is par
  const surviveTerm = clamp(survivedSec / 180, 0, 1) * 2;
  return wpmTerm + accTerm + surviveTerm;
}

// Climbing slows down near the top so high tiers stay meaningful.
function tierResistance(rp, delta) {
  if (delta <= 0) return delta;
  if (rp >= 5800) return delta * 0.5;
  if (rp >= 4500) return delta * 0.65;
  if (rp >= 3600) return delta * 0.8;
  return delta;
}

export function computeRpChange({ placement, fieldSize, wpm, accuracy, survivedSec, currentRp = 0 }) {
  const base = placementRp(placement, fieldSize);
  const perf = performanceRp({ wpm, accuracy, survivedSec });

  // Performance can soften a loss but never fully turn it into a gain.
  let delta = base >= 0 ? base + perf : base + clamp(perf, -6, 6);
  delta = tierResistance(currentRp, delta);

  const rounded = Math.round(delta);
  // Never drop below the floor of the current tier's *base* division set.
  const floored = Math.max(0, currentRp + rounded);
  return { delta: floored - currentRp, newRp: floored };
}

export function winRate(wins, games) {
  if (!games) return 0;
  return Math.round((wins / games) * 100);
}
