// Versus engine: AI opponents and the attack/garbage economy for Royal Rumble.
//
// The same engine backs both offline bot matches and online play — an online
// opponent is simply one whose progress is driven by network events instead of
// the local AI simulation.

export const AI_PROFILES = {
  easy:   { key: 'easy',   label: 'Rookie', wpm: 22, accuracy: 0.86, reaction: [0.7, 1.6], mistakeRecovery: 1.4 },
  normal: { key: 'normal', label: 'Adept',  wpm: 40, accuracy: 0.93, reaction: [0.45, 1.0], mistakeRecovery: 1.0 },
  hard:   { key: 'hard',   label: 'Expert', wpm: 66, accuracy: 0.965, reaction: [0.28, 0.6], mistakeRecovery: 0.7 },
  typist: { key: 'typist', label: 'Typist', wpm: 98, accuracy: 0.99, reaction: [0.15, 0.35], mistakeRecovery: 0.45 },
};

const BOT_NAMES = [
  'Nyx', 'Volt', 'Quill', 'Rune', 'Echo', 'Sable', 'Onyx', 'Vex',
  'Cinder', 'Wraith', 'Lark', 'Mote', 'Fen', 'Rook', 'Ash', 'Kite',
];

// Damage scales with word length — one point per correctly typed letter —
// then multiplies with combo and any active buffs. Long words are worth
// committing to.
export function damageForWord(text, { comboMult = 1, buffMult = 1, crit = false } = {}) {
  const base = text.replace(/\s/g, '').length;
  return Math.max(1, Math.round(base * comboMult * buffMult * (crit ? 2 : 1)));
}
export const RUMBLE_MAX_HP = 100;

// Tetris-style: bigger combos send bigger volleys.
export function attackForCombo(combo) {
  if (combo >= 20) return 4;
  if (combo >= 15) return 3;
  if (combo >= 10) return 2;
  if (combo >= 5) return 1;
  return 0;
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shuffled(arr) {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

let nextId = 1;

export function createOpponent({ name, difficulty = 'normal', isAI = true, team = null, isHuman = false }) {
  const profile = AI_PROFILES[difficulty] || AI_PROFILES.normal;
  return {
    id: `p${nextId++}`,
    name: name || pick(BOT_NAMES),
    isAI,
    isHuman,
    team,
    difficulty,
    profile,
    hp: RUMBLE_MAX_HP,
    alive: true,
    combo: 0,
    wordsCleared: 0,
    // Rumble: queued garbage the bot must chew through before it is safe again.
    pressure: 0,
      target: null,
    progress: 0,
    thinkTimer: 0,
    lastAction: '',
    flash: 0,
  };
}

// Characters this bot clears per second, derived from its WPM.
function charsPerSecond(op) {
  return (op.profile.wpm * 5) / 60;
}

// ---------------------------------------------------------------- Royal Rumble

export function createRumble({ botCount = 5, difficulty = 'normal', playerName = 'You' }) {
  const player = createOpponent({ name: playerName, difficulty, isAI: false, isHuman: true });
  const names = shuffled(BOT_NAMES).slice(0, botCount);
  const bots = names.map(n => createOpponent({ name: n, difficulty }));
  return {
    format: 'rumble',
    difficulty,
    player,
    opponents: [player, ...bots],
    finished: false,
    winner: null,
    placement: [],
    events: [],
  };
}

// Bots don't render a board; their danger is modelled as accumulated pressure
// that they type away at their own rate.
function tickRumbleBot(vs, op, dt) {
  if (!op.alive) return;

  const cps = charsPerSecond(op);
  op.thinkTimer -= dt;

  // Clear roughly one average word every (wordLen / cps) seconds.
  const avgWordChars = 6;
  const wordsPerSecond = cps / avgWordChars;
  op.progress += wordsPerSecond * dt;

  while (op.progress >= 1) {
    op.progress -= 1;

    // Accuracy roll decides whether this word lands or is fumbled.
    if (Math.random() > op.profile.accuracy) {
      op.combo = 0;
      op.lastAction = 'miss';
      op.pressure = Math.min(op.pressure + 1, 12);
    } else {
      op.combo += 1;
      op.wordsCleared += 1;
      op.lastAction = 'clear';
      op.flash = 0.2;
      if (op.pressure > 0) op.pressure -= 1;

      const atk = attackForCombo(op.combo);
      if (atk > 0 && op.combo % 5 === 0) {
        sendAttack(vs, op, atk);
      }
    }
  }

  // Unresolved pressure grinds a bot's health down.
  if (op.pressure > 0) {
    op.hp -= op.pressure * 3.2 * dt;
    if (op.hp <= 0) eliminate(vs, op);
  }
}

function eliminate(vs, op) {
  if (!op.alive) return;
  op.hp = 0;
  op.alive = false;
  vs.placement.unshift(op);
  vs.events.push({ type: 'eliminated', target: op });
  checkRumbleEnd(vs);
}

function checkRumbleEnd(vs) {
  const alive = vs.opponents.filter(o => o.alive);
  if (alive.length <= 1) {
    vs.finished = true;
    vs.winner = alive[0] || null;
    if (vs.winner) vs.placement.unshift(vs.winner);
    vs.events.push({ type: 'finished', winner: vs.winner });
  }
}

// Route an attack from `from` to a random living opponent.
export function sendAttack(vs, from, count) {
  const targets = vs.opponents.filter(o => o.alive && o.id !== from.id);
  if (targets.length === 0) return null;
  const target = pick(targets);

  if (target.isHuman) {
    // The human's punishment is real words appearing on their board.
    vs.events.push({ type: 'incoming', from, target, count });
  } else {
    target.pressure = Math.min(target.pressure + count, 12);
    vs.events.push({ type: 'attack', from, target, count });
  }
  return target;
}

// Called when the human lands a combo milestone.
export function playerAttack(vs, combo) {
  const count = attackForCombo(combo);
  if (count <= 0 || combo % 5 !== 0) return null;
  return sendAttack(vs, vs.player, count);
}

export function damagePlayer(vs, amount) {
  const p = vs.player;
  p.hp -= amount;
  if (p.hp <= 0) {
    p.hp = 0;
    eliminate(vs, p);
  }
}

// ------------------------------------------------------------------- shared tick

export function tickVersus(vs, dt, api = {}) {
  if (vs.finished) return drainEvents(vs);

  for (const op of vs.opponents) {
    if (op.flash > 0) op.flash = Math.max(0, op.flash - dt);
    if (!op.isAI) continue;

    tickRumbleBot(vs, op, dt);
  }

  return drainEvents(vs);
}

function drainEvents(vs) {
  const out = vs.events;
  vs.events = [];
  return out;
}


export function aliveCount(vs) {
  return vs.opponents.filter(o => o.alive).length;
}
