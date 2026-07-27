// Core game state, progression, effects, HUD, and the main loop.

import './style.css';
import {
  muted, musicMuted, shakeEnabled, masterVolume,
  setMuted, setMusicMuted, setShakeEnabled, setMasterVolume,
  sfxKeyTick, sfxKeyError, sfxWordComplete, sfxCombo, sfxMiss, sfxLevelUp,
  sfxGameOver, sfxUiClick, sfxUiHover, sfxPower, sfxPowerReady, sfxPowerDenied,
  sfxFreeze, sfxWarp, sfxShield, sfxSurge, sfxMonsterRoar, sfxMonsterDeath,
  startMusic, stopMusic, setMusicForLevel,
} from './audio.js';
import {
  canvas, ctx, HORIZON_RATIO, MONSTER_TYPES, MONSTER_PITCH,
  resizeCanvas, updateStars, drawSky, drawGrid, drawChip, drawText3D,
  drawMonster, drawPlayer,
} from './sprites.js';
import { generateText, generateBossPhrase } from './wordgen.js';
import { bossForLevel, isBossLevel, updateBoss, damageBoss, bossVolleySize, drawBoss, BOSS_INTERVAL } from './boss.js';
import {
  AI_PROFILES, createRumble, createTower, tickVersus, playerAttack, damagePlayer,
  damageTower, enemyTeamOf, teamOf, attackForCombo,
  TOWER_MAX_HP, TOWER_WORD_DAMAGE, RUMBLE_MAX_HP, TOWER_ROUNDS,
} from './versus.js';
import { OnlineRoom, generateRoomCode } from './online.js';
import {
  isConfigured as supabaseReady, signIn, signUp, signOut,
  getSession, getProfile, submitScore, onAuthChange,
} from './supabase.js';

const MODE_FONT_SIZE = { words: 18, programming: 15, sentences: 13 };
const CHIP_COLORS = ['#00f6ff', '#ff2ec4', '#ffd83d', '#37ff8b', '#ff8a3d', '#7f5cff'];

const LEADERBOARD_KEY = 'passageKeyLeaderboard';
const LEADERBOARD_MAX = 10;
const BASE_MAX_HEALTH = 100;
const DAMAGE_PER_MISS = 34;
const ATTACK_DURATION = 0.22;
const HURT_DURATION = 0.3;
const MANA_MAX = 100;
const MANA_PER_WORD = 10;

function xpNeededFor(lvl) {
  return Math.floor(110 * Math.pow(lvl, 1.45));
}

const ACTIVE_SKILLS = [
  { id: 'freeze', name: 'Frost Lock', icon: '❄', desc: 'Encase every enemy in ice for 3.5s', cooldown: 20 },
  { id: 'slow', name: 'Time Warp', icon: '⧗', desc: 'Slow all enemies by 50% for 5s', cooldown: 18 },
  { id: 'shield', name: 'Word Ward', icon: '⛨', desc: 'Block your next incoming hit', cooldown: 22 },
  { id: 'surge', name: 'Score Surge', icon: '★', desc: 'Double all score for 8s', cooldown: 20 },
  { id: 'manasurge', name: 'Mana Surge', icon: '✦', desc: 'Instantly restore 50 mana', cooldown: 16 },
];

const PASSIVE_SKILLS = [
  { id: 'lifesteal', name: 'Lifesteal', icon: '♥', desc: 'Heal 3 HP every 10 kills' },
  { id: 'ironskin', name: 'Iron Skin', icon: '⛊', desc: '+20 max HP, healed instantly' },
  { id: 'manaflow', name: 'Mana Flow', icon: '✧', desc: '+30% mana from every kill' },
  { id: 'scoreboost', name: 'Greed', icon: '◆', desc: '+15% score from every kill' },
  { id: 'comboguard', name: 'Combo Guard', icon: '⚡', desc: 'Hits halve your combo instead of resetting' },
  { id: 'scholar', name: 'Scholar', icon: '⚛', desc: '+20% XP from every kill' },
];

// ---------- DOM ----------

const $ = (id) => document.getElementById(id);

const app = $('app');
const fxLayer = $('fx-layer');
const comboFlashEl = $('combo-flash');
const levelUpBanner = $('levelup-banner');
const screenTint = $('screen-tint');
const muteBtn = $('mute-btn');
const volumeSlider = $('volume-slider');
const sfxToggleBtn = $('sfx-toggle-btn');
const musicToggleBtn = $('music-toggle-btn');
const shakeToggleBtn = $('shake-toggle-btn');
const clearLeaderboardBtn = $('clear-leaderboard-btn');

const hud = $('hud');
const actionBar = $('action-bar');
const vitals = $('vitals');
const hudScore = $('hud-score');
const hudCombo = $('hud-combo');
const hudMultiplier = $('hud-multiplier');
const comboChip = $('hud-combo-wrap');

const hudHealthBar = $('hud-health-bar');
const hudHealthText = $('hud-health-text');
const hudXpBar = $('hud-xp-bar');
const hudXpText = $('hud-xp-text');
const hudLevelTag = $('hud-level');
const hpRow = $('vital-hp-row');
const xpRow = $('vital-xp-row');

const bossBar = $('boss-bar');
const bossName = $('boss-name');
const bossTitle = $('boss-title');
const bossHpFill = $('boss-hp-fill');
const bossHpText = $('boss-hp-text');

const manaWrap = $('hud-mana-wrap');
const manaFill = $('hud-mana-fill');
const manaText = $('hud-mana-text');

const skillSlotEls = [0, 1, 2].map(i => $(`skill-slot-${i}`));
const skillSlotNameEls = [0, 1, 2].map(i => $(`skill-slot-name-${i}`));
const skillSlotIconEls = [0, 1, 2].map(i => $(`skill-slot-icon-${i}`));
const skillCdEls = [0, 1, 2].map(i => $(`skill-cd-${i}`));

const skillChoiceSubtitle = $('skill-choice-subtitle');
const skillOptionEls = [0, 1, 2].map(i => $(`skill-option-${i}`));

const loadingBar = $('loading-bar');
const loadingLabel = $('loading-label');

const screens = {
  loading: $('screen-loading'),
  menu: $('screen-menu'),
  mode: $('screen-mode'),
  text: $('screen-text'),
  versus: $('screen-versus'),
  online: $('screen-online'),
  lobby: $('screen-lobby'),
  auth: $('screen-auth'),
  profile: $('screen-profile'),
  settings: $('screen-settings'),
  skill: $('screen-skill'),
  result: $('screen-result'),
  leaderboard: $('screen-leaderboard'),
};

// versus + online DOM
const opponentRail = $('opponent-rail');
const towerHud = $('tower-hud');
const towerFill = { A: $('tower-fill-A'), B: $('tower-fill-B') };
const towerText = { A: $('tower-text-A'), B: $('tower-text-B') };
const towerRoundEl = $('tower-round');
const formatHint = $('format-hint');
const difficultyHint = $('difficulty-hint');
const onlineStatus = $('online-status');
const onlineError = $('online-error');
const roomCodeInput = $('room-code-input');
const lobbyCode = $('lobby-code');
const lobbyPlayers = $('lobby-players');
const lobbyHint = $('lobby-hint');
const lobbyStartBtn = $('lobby-start-btn');
const accountBtn = $('account-btn');
const authTitle = $('auth-title');
const authSubtitle = $('auth-subtitle');
const authUsername = $('auth-username');
const authEmail = $('auth-email');
const authPassword = $('auth-password');
const authError = $('auth-error');
const authSubmit = $('auth-submit');
const authToggle = $('auth-toggle');
const profileName = $('profile-name');
const profileBest = $('profile-best');
const profileRuns = $('profile-runs');
const profileWpm = $('profile-wpm');
const profileBosses = $('profile-bosses');

const resultTitle = $('result-title');
const resultScore = $('result-score');
const resultCombo = $('result-combo');
const resultWords = $('result-words');
const resultBosses = $('result-bosses');
const resultLevel = $('result-level');
const resultAccuracy = $('result-accuracy');
const resultWpm = $('result-wpm');
const leaderboardList = $('leaderboard-list');

// ---------- state ----------

let state = 'loading';
let previousScreen = 'menu';
let settingsReturn = 'menu';
let paused = false;
let gameplayMode = 'adventure';   // 'adventure' | 'classic'
let textMode = 'words';           // 'words' | 'programming' | 'sentences'

let words = [];
let score = 0;
let maxHealth = BASE_MAX_HEALTH;
let health = BASE_MAX_HEALTH;
let level = 1;
let xp = 0;
let xpNeeded = xpNeededFor(1);
let activeWord = null;

let combo = 0;
let maxCombo = 0;
let mana = 0;

let activeSkills = [];
let ownedActiveIds = new Set();
let passiveCounts = {};
let slowTimer = 0;
let freezeTimer = 0;
let scoreSurgeTimer = 0;
let shieldCharges = 0;

let boss = null;
let lastBossLevel = 0;
let bossesDefeated = 0;
let pendingBossLevel = 0;

// versus / online
let vs = null;
let versusFormat = 'rumble';
let versusDifficulty = 'normal';
let onlineFormat = 'rumble';
let onlineRoom = null;
let isOnlineMatch = false;
let towerRoundActive = false;
let nextWordId = 1;
let playerPlacement = 0;

// auth
let authMode = 'signin';
let currentSession = null;
let currentProfile = null;

const isVersus = () => vs !== null;
const isTower = () => vs && vs.format === 'tower';
const isRumble = () => vs && vs.format === 'rumble';

let spawnIntervalMs = 2000;
let baseSpeed = 50;
let lastSpawn = 0;
let lastFrameTime = 0;

let totalKeystrokes = 0;
let correctKeystrokes = 0;
let wordsTypedTotal = 0;
let gameStartTime = 0;

let particles = [];
let explosions = [];
let shockwaves = [];
let shakeTimer = 0;
let shakeMag = 0;

let displayedScore = 0;
let scoreAnimId = null;

const player = { x: 0, y: 0, attackTimer: 0, hurtTimer: 0, blinking: false, blinkTimer: 3 };

// ---------- settings UI ----------

function updateMuteButton() {
  muteBtn.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
  muteBtn.classList.toggle('is-muted', muted);
}

function updateSettingsUI() {
  sfxToggleBtn.textContent = muted ? 'OFF' : 'ON';
  musicToggleBtn.textContent = musicMuted ? 'OFF' : 'ON';
  shakeToggleBtn.textContent = shakeEnabled ? 'ON' : 'OFF';
  volumeSlider.value = Math.round(masterVolume * 100);
}

function applyMuted(v) { setMuted(v); updateMuteButton(); updateSettingsUI(); }
function applyMusicMuted(v) { setMusicMuted(v); updateSettingsUI(); }
function applyShake(v) { setShakeEnabled(v); updateSettingsUI(); }

updateMuteButton();
volumeSlider.addEventListener('input', (e) => setMasterVolume(Number(e.target.value) / 100));

// ---------- screens ----------

function showScreen(name) {
  Object.values(screens).forEach(el => el.classList.add('hidden'));
  if (name) {
    const el = screens[name];
    el.classList.remove('hidden');
    el.classList.remove('screen-enter');
    void el.offsetWidth;
    el.classList.add('screen-enter');
  }
}

function openSettings() {
  settingsReturn = (state === 'playing') ? 'game' : 'menu';
  if (settingsReturn === 'game') paused = true;
  updateSettingsUI();
  showScreen('settings');
}

function closeSettings() {
  if (settingsReturn === 'game') {
    paused = false;
    showScreen(null);
  } else {
    showScreen('menu');
  }
}

let clearArmed = false;
let clearArmTimeout = null;

function handleClearLeaderboard() {
  if (!clearArmed) {
    clearArmed = true;
    clearLeaderboardBtn.textContent = 'CONFIRM?';
    clearArmTimeout = setTimeout(() => {
      clearArmed = false;
      clearLeaderboardBtn.textContent = 'CLEAR';
    }, 3000);
  } else {
    clearTimeout(clearArmTimeout);
    clearArmed = false;
    localStorage.removeItem(LEADERBOARD_KEY);
    clearLeaderboardBtn.textContent = 'CLEARED';
    setTimeout(() => { clearLeaderboardBtn.textContent = 'CLEAR'; }, 1200);
  }
}

// ---------- effects ----------

function comboMultiplier(c) { return 1 + Math.floor(c / 5) * 0.5; }

function spawnFx(text, x, y, variant) {
  const el = document.createElement('div');
  el.className = `fx-pop fx-${variant}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  fxLayer.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

function pulseChip(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function triggerScreenFlash() {
  comboFlashEl.classList.remove('flash-active');
  void comboFlashEl.offsetWidth;
  comboFlashEl.classList.add('flash-active');
}

function showBanner(text) {
  levelUpBanner.textContent = text;
  levelUpBanner.classList.remove('show');
  void levelUpBanner.offsetWidth;
  levelUpBanner.classList.add('show');
}

function addShake(mag, duration) {
  if (!shakeEnabled) return;
  shakeMag = Math.max(shakeMag, mag);
  shakeTimer = Math.max(shakeTimer, duration);
}

function bigShake() {
  if (!shakeEnabled) return;
  app.classList.remove('app-shake');
  void app.offsetWidth;
  app.classList.add('app-shake');
}

function setTint(cls) { screenTint.className = cls || ''; }

function triggerAttack() { player.attackTimer = ATTACK_DURATION; }
function triggerHurt() { player.hurtTimer = HURT_DURATION; }

function animateScore(target) {
  const start = displayedScore;
  const startTime = performance.now();
  const duration = 350;
  if (scoreAnimId) cancelAnimationFrame(scoreAnimId);
  function step(now) {
    const p = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    displayedScore = Math.round(start + (target - start) * eased);
    hudScore.textContent = displayedScore;
    if (p < 1) scoreAnimId = requestAnimationFrame(step);
  }
  scoreAnimId = requestAnimationFrame(step);
}

// ---------- particles ----------

function spawnParticles(x, y, count, colors, opts = {}) {
  const { speed = 120, life = 0.6, size = 3, gravity = 0, shape = 'square' } = opts;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = speed * (0.4 + Math.random() * 0.6);
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life, maxLife: life,
      size: size * (0.6 + Math.random() * 0.8),
      color: colors[Math.floor(Math.random() * colors.length)],
      gravity, shape,
      spin: (Math.random() - 0.5) * 8,
      rot: Math.random() * Math.PI,
    });
  }
}

function updateParticles(dt) {
  for (const p of [...particles]) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    p.rot += p.spin * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(particles.indexOf(p), 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(p.life / p.maxLife, 0);
    ctx.fillStyle = p.color;
    if (p.shape === 'shard') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.moveTo(0, -p.size * 1.8);
      ctx.lineTo(p.size, p.size);
      ctx.lineTo(-p.size, p.size);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

function spawnExplosion(x, y, color) {
  explosions.push({ x, y, color, age: 0, maxAge: 0.4 });
}

function spawnShockwave(x, y, color, maxR) {
  shockwaves.push({ x, y, color, maxR, age: 0, maxAge: 0.7 });
}

function updateExplosions(dt) {
  for (const e of [...explosions]) {
    e.age += dt;
    if (e.age >= e.maxAge) explosions.splice(explosions.indexOf(e), 1);
  }
  for (const s of [...shockwaves]) {
    s.age += dt;
    if (s.age >= s.maxAge) shockwaves.splice(shockwaves.indexOf(s), 1);
  }
}

function drawExplosions() {
  for (const e of explosions) {
    const t = e.age / e.maxAge;
    const ringR = 8 + t * 48;
    ctx.globalAlpha = Math.max(1 - t, 0);
    ctx.strokeStyle = e.color;
    ctx.lineWidth = Math.max(4 * (1 - t), 1);
    ctx.beginPath();
    ctx.arc(e.x, e.y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + t * 2;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(ang) * ringR * 0.5, e.y + Math.sin(ang) * ringR * 0.5);
      ctx.lineTo(e.x + Math.cos(ang) * ringR * 1.15, e.y + Math.sin(ang) * ringR * 1.15);
      ctx.stroke();
    }
    ctx.globalAlpha = Math.max(1 - t * 2.5, 0);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(e.x, e.y, Math.max(16 * (1 - t), 0), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawShockwaves() {
  for (const s of shockwaves) {
    const t = s.age / s.maxAge;
    ctx.globalAlpha = Math.max(1 - t, 0) * 0.85;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 6 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.maxR * t, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------- loading ----------

function runLoadingSequence() {
  let pct = 0;
  const timer = new Promise((resolve) => {
    const id = setInterval(() => {
      pct = Math.min(100, pct + 8 + Math.random() * 14);
      loadingBar.style.width = `${pct}%`;
      loadingLabel.textContent = `LOADING... ${Math.floor(pct)}%`;
      if (pct >= 100) { clearInterval(id); resolve(); }
    }, 130);
  });
  const fonts = (document.fonts && document.fonts.load)
    ? document.fonts.load('18px "Press Start 2P"').catch(() => {})
    : Promise.resolve();
  Promise.all([timer, fonts]).then(() => {
    state = 'menu';
    showScreen('menu');
  });
}

// ---------- words / enemies ----------

function currentFontSize() { return MODE_FONT_SIZE[textMode] || 18; }
function pixelFont() { return `${currentFontSize()}px "Press Start 2P", monospace`; }

function getTimeAcceleration() {
  const elapsedMin = (performance.now() - gameStartTime) / 60000;
  return 1 + Math.min(elapsedMin * 0.25, 1.5);
}

// Feeds the generator a 0..1 difficulty so content lengthens as you progress.
function contentDifficulty() {
  return Math.min(1, (level - 1) / 12);
}

function pickPattern() {
  if (level < 2) return 'straight';
  const chaosChance = Math.min(0.15 + level * 0.07, 0.65);
  const r = Math.random();
  if (r > chaosChance) return 'straight';
  return r < chaosChance * 0.55 ? 'sine' : 'diagonal';
}

function depthScale(y) {
  const horizon = canvas.height * HORIZON_RATIO;
  const k = Math.max(0, Math.min(1, (y - horizon * 0.2) / (canvas.height - horizon * 0.2)));
  return 0.62 + k * 0.58;
}

// Guarantees generated text physically fits the viewport. Regenerates a few
// times, then trims at a word boundary as a last resort.
function generateFitting(kind, difficulty) {
  ctx.font = pixelFont();
  const maxW = Math.max(120, canvas.width - 120);
  const make = () => (kind === 'boss'
    ? generateBossPhrase(boss ? boss.tier : 1)
    : generateText(textMode, difficulty));

  let text = make();
  for (let i = 0; i < 6 && ctx.measureText(text).width > maxW; i++) {
    text = make();
  }
  if (ctx.measureText(text).width > maxW) {
    const parts = text.split(' ');
    while (parts.length > 1 && ctx.measureText(parts.join(' ')).width > maxW) parts.pop();
    text = parts.join(' ');
  }
  return text;
}

function makeWord(text, opts = {}) {
  const margin = 50;
  ctx.font = pixelFont();
  const textWidth = ctx.measureText(text).width;
  const maxRange = Math.max(0, canvas.width - margin * 2 - textWidth);
  const x = margin + Math.random() * maxRange;
  const color = opts.color || CHIP_COLORS[Math.floor(Math.random() * CHIP_COLORS.length)];
  const pattern = opts.pattern || pickPattern();
  const speed = (baseSpeed + level * 10) * getTimeAcceleration() * (opts.speedMult || 1);
  const word = {
    id: nextWordId++,
    text, x, baseX: x, y: opts.y ?? -40, typed: 0, speed, color, width: textWidth,
    seed: Math.random() * 10, pattern,
    type: MONSTER_TYPES[Math.floor(Math.random() * MONSTER_TYPES.length)],
    hitFlash: 0,
    fromBoss: !!opts.fromBoss,
    claimedBy: null,
    isGarbage: false,
  };
  if (pattern === 'sine') {
    word.sineAmp = 20 + Math.random() * 40;
    word.sineFreq = 0.004 + Math.random() * 0.006;
  } else if (pattern === 'diagonal') {
    word.vx = (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 50);
  }
  return word;
}

function spawnWord() {
  words.push(makeWord(generateFitting('normal', contentDifficulty())));
  if (level >= 4 && Math.random() < 0.25) {
    words.push(makeWord(generateFitting('normal', contentDifficulty()), { y: -80, pattern: 'straight' }));
  }
}

// Boss volleys are always phrase-shaped and visually distinct.
function spawnBossVolley() {
  const n = bossVolleySize(boss);
  for (let i = 0; i < n; i++) {
    const phrase = generateFitting('boss');
    words.push(makeWord(phrase, {
      y: boss.y + 60 - i * 46,
      fromBoss: true,
      color: boss.palette.glow,
      pattern: 'straight',
      speedMult: 0.72,
    }));
  }
  sfxMonsterRoar(Math.min(1, 0.4 + boss.tier * 0.15));
  addShake(5, 0.3);
}

// ---------- boss flow ----------

function startBossFight(lvl) {
  boss = bossForLevel(lvl);
  lastBossLevel = lvl;
  words = [];
  activeWord = null;
  bossBar.classList.remove('hidden');
  bossName.textContent = boss.name;
  bossTitle.textContent = boss.title;
  updateBossBar();
  showBanner(`${boss.name} APPROACHES`);
  sfxMonsterRoar(1);
  bigShake();
  addShake(10, 0.6);
  spawnShockwave(canvas.width / 2, canvas.height * 0.2, boss.palette.glow, canvas.width);
}

function updateBossBar() {
  if (!boss) return;
  const pct = (boss.hp / boss.maxHp) * 100;
  bossHpFill.style.width = `${pct}%`;
  bossHpText.textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
}

function endBossFight() {
  bossesDefeated += 1;
  const reward = 500 * boss.tier;
  score += reward;
  showBanner('BOSS SLAIN!');
  spawnFx(`+${reward}`, canvas.width / 2, canvas.height * 0.3, 'combo mega');
  triggerScreenFlash();
  bigShake();
  addShake(14, 0.7);
  spawnShockwave(boss.x, boss.y, boss.palette.glow, canvas.width * 1.2);
  spawnParticles(boss.x, boss.y, 90, [boss.palette.glow, boss.palette.main, '#ffffff'],
    { speed: 300, life: 1.6, gravity: 120 });
  grantXp(120 * boss.tier);
  // clear the boss's outstanding phrases so you aren't punished post-kill
  words = words.filter(w => !w.fromBoss);
  activeWord = null;
  setTimeout(() => { bossBar.classList.add('hidden'); }, 1400);
  setTimeout(() => { boss = null; }, 1500);
  updateHud();
}

// ---------- game flow ----------

function resetGame() {
  words = [];
  particles = [];
  explosions = [];
  shockwaves = [];
  score = 0;
  displayedScore = 0;
  maxHealth = BASE_MAX_HEALTH;
  health = BASE_MAX_HEALTH;
  level = 1;
  xp = 0;
  xpNeeded = xpNeededFor(1);
  activeWord = null;
  combo = 0;
  maxCombo = 0;
  mana = 0;
  activeSkills = [];
  ownedActiveIds = new Set();
  passiveCounts = {};
  slowTimer = 0;
  freezeTimer = 0;
  scoreSurgeTimer = 0;
  shieldCharges = 0;
  boss = null;
  lastBossLevel = 0;
  pendingBossLevel = 0;
  bossesDefeated = 0;
  towerRoundActive = false;
  spawnIntervalMs = 2000;
  baseSpeed = 50;
  lastSpawn = 0;
  totalKeystrokes = 0;
  correctKeystrokes = 0;
  wordsTypedTotal = 0;
  gameStartTime = performance.now();
  paused = false;
  player.attackTimer = 0;
  player.hurtTimer = 0;
  hudScore.textContent = '0';
  bossBar.classList.add('hidden');
  setTint(null);
  updateSkillBarUI();
  updateHud();
}

function updateHud() {
  animateScore(score);
  hudCombo.textContent = combo;
  hudMultiplier.textContent = `x${comboMultiplier(combo).toFixed(1)}`;

  const healthPct = Math.max(0, health / maxHealth) * 100;
  hudHealthBar.style.width = `${healthPct}%`;
  hudHealthBar.classList.toggle('low', healthPct <= 30);
  hudHealthText.textContent = `${Math.max(0, Math.round(health))} / ${maxHealth}`;

  hudXpBar.style.width = `${Math.min(100, (xp / xpNeeded) * 100)}%`;
  hudXpText.textContent = `${Math.floor(xp)} / ${xpNeeded} XP`;
  hudLevelTag.textContent = `LV ${level}`;

  manaFill.style.height = `${(mana / MANA_MAX) * 100}%`;
  manaText.textContent = Math.round(mana);
  manaWrap.classList.toggle('ready', mana >= MANA_MAX);
}

function startGame() {
  resetGame();
  state = 'playing';
  hud.classList.remove('hidden');
  actionBar.classList.remove('hidden');
  vitals.classList.remove('hidden');
  showScreen(null);
  startMusic(level);
}

function leaveToMenu() {
  stopMusic();
  paused = false;
  state = 'menu';
  setTint(null);
  hud.classList.add('hidden');
  actionBar.classList.add('hidden');
  vitals.classList.add('hidden');
  bossBar.classList.add('hidden');
  opponentRail.classList.add('hidden');
  towerHud.classList.add('hidden');
  vs = null;
  if (onlineRoom) { onlineRoom.leave().catch(() => {}); onlineRoom = null; }
  showScreen('menu');
}

function endGame() {
  state = 'result';
  hud.classList.add('hidden');
  actionBar.classList.add('hidden');
  vitals.classList.add('hidden');
  bossBar.classList.add('hidden');
  setTint(null);
  stopMusic();
  sfxGameOver();
  bigShake();

  const elapsedMinutes = Math.max((performance.now() - gameStartTime) / 60000, 1 / 60);
  const accuracy = totalKeystrokes > 0 ? Math.round((correctKeystrokes / totalKeystrokes) * 100) : 100;
  const wpm = Math.round((correctKeystrokes / 5) / elapsedMinutes);

  resultTitle.textContent = gameplayMode === 'adventure' ? 'RUN OVER' : 'RESULT';
  resultScore.textContent = score;
  resultCombo.textContent = maxCombo;
  resultWords.textContent = wordsTypedTotal;
  resultBosses.textContent = bossesDefeated;
  resultLevel.textContent = level;
  resultAccuracy.textContent = `${accuracy}%`;
  resultWpm.textContent = wpm;

  saveScore({
    score, level, accuracy, wpm, bestCombo: maxCombo,
    mode: `${gameplayMode}/${textMode}`, bosses: bossesDefeated,
    date: new Date().toISOString(),
  });
  showScreen('result');
}

function saveScore(entry) {
  const list = loadLeaderboard();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list.slice(0, LEADERBOARD_MAX)));
}

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function renderLeaderboard() {
  const list = loadLeaderboard();
  leaderboardList.innerHTML = '';
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'leaderboard-empty';
    empty.textContent = 'No scores yet. Play a game!';
    leaderboardList.appendChild(empty);
    return;
  }
  list.forEach((entry, i) => {
    const li = document.createElement('li');
    if (i === 0) li.className = 'rank-1';
    const modeLabel = (entry.mode || 'words').toUpperCase();
    const bossLabel = entry.bosses ? ` &middot; ${entry.bosses}B` : '';
    li.innerHTML = `<span>#${i + 1} &middot; Lv${entry.level}${bossLabel} &middot; ${modeLabel}</span><span>${entry.score}</span>`;
    leaderboardList.appendChild(li);
  });
}

// ---------- kills / XP ----------

function grantXp(amount) {
  const scholarMult = 1 + (passiveCounts.scholar || 0) * 0.2;
  xp += amount * scholarMult;
  while (xp >= xpNeeded) {
    xp -= xpNeeded;
    level += 1;
    xpNeeded = xpNeededFor(level);
    onLevelUp();
  }
}

function onLevelUp() {
  spawnIntervalMs = Math.max(500, spawnIntervalMs - 190);
  pulseChip(xpRow, 'pulse-good');
  showBanner(`LEVEL ${level}!`);
  sfxLevelUp();
  setMusicForLevel(level);
  addShake(7, 0.4);
  bigShake();
  spawnShockwave(canvas.width / 2, canvas.height * 0.5, '#ffd83d', canvas.width * 0.7);
  spawnParticles(canvas.width / 2, canvas.height * 0.35, 40, CHIP_COLORS, { speed: 220, life: 1.2 });

  // Adventure: a boss guards every Nth level. Queue it after the skill pick.
  if (gameplayMode === 'adventure' && isBossLevel(level) && level > lastBossLevel) {
    pendingBossLevel = level;
  }
  setTimeout(() => openSkillChoice(), 620);
}

function registerKill(word, { silent = false } = {}) {
  const cx = word.x + word.width / 2;

  combo += 1;
  maxCombo = Math.max(maxCombo, combo);
  const multiplier = comboMultiplier(combo);
  const scoreBoostMult = 1 + (passiveCounts.scoreboost || 0) * 0.15;
  const surgeMult = scoreSurgeTimer > 0 ? 2 : 1;
  const gained = Math.round(word.text.length * 10 * multiplier * scoreBoostMult * surgeMult);
  score += gained;
  wordsTypedTotal += 1;

  if (passiveCounts.lifesteal > 0 && wordsTypedTotal % 10 === 0) {
    const healed = 3 * passiveCounts.lifesteal;
    health = Math.min(maxHealth, health + healed);
    spawnFx(`+${healed} HP`, cx, word.y - 30, 'score');
  }

  spawnExplosion(cx, word.y, word.color);
  spawnParticles(cx, word.y, 16, [word.color, '#ffffff', '#7f5cff']);
  if (freezeTimer > 0) {
    spawnParticles(cx, word.y, 12, ['#9fe8ff', '#ffffff', '#5fd0ff'],
      { shape: 'shard', speed: 150, life: 0.8, gravity: 260 });
  }
  spawnFx(`+${gained}`, cx, word.y, 'score');
  addShake(2.5, 0.12);

  if (!silent) {
    sfxWordComplete(Math.min(combo, 20));
    sfxMonsterDeath(MONSTER_PITCH[word.type] || 1);
  }

  // Boss phrases carve into the boss's health bar.
  if (word.fromBoss && boss && !boss.defeated) {
    const dmg = word.text.length;
    const killed = damageBoss(boss, dmg);
    updateBossBar();
    spawnFx(`-${dmg}`, boss.x, boss.y + 40, 'skill');
    spawnParticles(boss.x, boss.y + 20, 18, [boss.palette.glow, '#ffffff'], { speed: 180, life: 0.7 });
    addShake(5, 0.25);
    if (killed) endBossFight();
  }

  // Versus: clearing words is how you hurt the other side.
  if (isTower()) {
    damageTower(vs, enemyTeamOf(vs.player.team), TOWER_WORD_DAMAGE);
    updateTowerHud();
    spawnFx(`-${TOWER_WORD_DAMAGE} TOWER`, cx, word.y - 26, 'skill');
    if (onlineRoom) onlineRoom.completeWord(word.id, vs.player.team);
  } else if (isRumble()) {
    vs.player.combo = combo;
    const target = playerAttack(vs, combo);
    if (target) {
      spawnFx(`→ ${target.name}`, canvas.width / 2, canvas.height * 0.26, 'skill');
      if (onlineRoom) onlineRoom.attack(target.id, attackForCombo(combo));
    }
    renderOpponentRail();
  }

  const xpGain = word.text.length * 2 + Math.floor(combo / 5) * 2;
  spawnFx(`+${Math.round(xpGain)} XP`, cx, word.y + 26, 'xp');

  if (combo > 0 && combo % 5 === 0) {
    const mega = combo % 10 === 0;
    spawnFx(mega ? `MEGA COMBO x${combo}!` : `COMBO x${combo}!`,
      canvas.width / 2, canvas.height / 2 - 60, mega ? 'combo mega' : 'combo');
    pulseChip(comboChip, 'pulse');
    sfxCombo(mega);
    sfxMonsterRoar(Math.min(1, combo / 30));
    addShake(mega ? 6 : 3.5, 0.3);
    if (mega) {
      triggerScreenFlash();
      bigShake();
      spawnShockwave(canvas.width / 2, canvas.height / 2, '#ffd83d', canvas.width * 0.55);
      spawnParticles(canvas.width / 2, canvas.height / 2, 45, CHIP_COLORS, { speed: 240, life: 1.1 });
    }
  }

  const prevMana = mana;
  const manaFlowMult = 1 + (passiveCounts.manaflow || 0) * 0.3;
  mana = Math.min(MANA_MAX, mana + Math.round(MANA_PER_WORD * manaFlowMult));
  if (prevMana < MANA_MAX && mana >= MANA_MAX) {
    spawnFx('POWER READY! [CTRL+1]', canvas.width / 2, canvas.height * 0.18, 'combo mega');
    sfxPowerReady();
  }

  grantXp(xpGain);
}

function onWordCompleted(word) {
  words.splice(words.indexOf(word), 1);
  activeWord = null;
  triggerAttack();
  registerKill(word);
  updateHud();
}

function activatePower() {
  if (state !== 'playing' || paused) return;
  // Tower deliberately has no ultimate — skills only.
  if (isTower()) { sfxPowerDenied(); return; }
  if (mana < MANA_MAX) { sfxPowerDenied(); return; }
  if (words.length === 0) return;

  const targets = [...words];
  words = [];
  activeWord = null;
  mana = 0;

  sfxPower();
  triggerScreenFlash();
  addShake(12, 0.5);
  bigShake();
  triggerAttack();
  spawnShockwave(player.x, player.y - 30, '#c9a6ff', canvas.width);
  updateHud();

  targets.forEach((w, i) => {
    setTimeout(() => { registerKill(w, { silent: true }); updateHud(); }, i * 60);
  });
}

function onWordMissed(word) {
  words.splice(words.indexOf(word), 1);
  if (activeWord === word) activeWord = null;

  // Tower is a race, not a survival test: a dropped word is a lost opportunity
  // rather than damage, since all damage is dealt to the enemy tower.
  if (isTower()) return;

  if (shieldCharges > 0) {
    shieldCharges -= 1;
    spawnFx('BLOCKED!', word.x + word.width / 2, canvas.height - 90, 'skill');
    spawnParticles(word.x + word.width / 2, canvas.height - 70, 24, ['#9fe8ff', '#ffffff'],
      { speed: 180, life: 0.7 });
    sfxShield();
    addShake(4, 0.2);
    return;
  }

  combo = passiveCounts.comboguard > 0 ? Math.floor(combo / 2) : 0;
  // boss phrases hit harder than regular monsters
  health -= word.fromBoss ? Math.round(DAMAGE_PER_MISS * 0.6) : DAMAGE_PER_MISS;

  triggerHurt();
  addShake(11, 0.35);
  bigShake();
  spawnParticles(word.x + word.width / 2, canvas.height - 40, 18, ['#ff4d5e', '#7a0f18', '#ffffff'],
    { speed: 140, life: 0.6, gravity: 260 });
  sfxMiss();
  sfxMonsterRoar(0.5);
  pulseChip(hpRow, 'pulse-bad');

  updateHud();

  if (isRumble()) {
    vs.player.hp = health;
    vs.player.combo = combo;
    renderOpponentRail();
    if (health <= 0) { damagePlayer(vs, 999); return; }
    return;
  }

  if (health <= 0) { health = 0; endGame(); }
}

// ---------- skills ----------

function shuffledCopy(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function openSkillChoice() {
  const offerActive = activeSkills.length < 3;
  const pool = offerActive ? ACTIVE_SKILLS.filter(s => !ownedActiveIds.has(s.id)) : PASSIVE_SKILLS;
  const options = shuffledCopy(pool).slice(0, 3);

  skillChoiceSubtitle.textContent = offerActive
    ? 'pick an active skill to equip'
    : 'slots full — pick a permanent passive';

  options.forEach((skill, i) => {
    const el = skillOptionEls[i];
    el.querySelector('.skill-card-icon').textContent = skill.icon;
    el.querySelector('.skill-card-name').textContent = skill.name;
    el.querySelector('.skill-card-desc').textContent = skill.desc;
    el.dataset.skillId = skill.id;
    el.dataset.isActive = offerActive ? '1' : '0';
    el.classList.remove('hidden');
  });
  for (let i = options.length; i < 3; i++) skillOptionEls[i].classList.add('hidden');

  paused = true;
  showScreen('skill');
}

function chooseSkill(index) {
  const el = skillOptionEls[index];
  if (!el || el.classList.contains('hidden')) return;
  const id = el.dataset.skillId;
  const isActive = el.dataset.isActive === '1';

  if (isActive) {
    const def = ACTIVE_SKILLS.find(s => s.id === id);
    activeSkills.push({ id: def.id, name: def.name, icon: def.icon, cooldownMax: def.cooldown, cooldownLeft: 0 });
    ownedActiveIds.add(def.id);
    pulseChip(skillSlotEls[activeSkills.length - 1], 'ready-flash');
  } else {
    passiveCounts[id] = (passiveCounts[id] || 0) + 1;
    if (id === 'ironskin') {
      maxHealth += 20;
      health = Math.min(maxHealth, health + 20);
    }
  }

  updateSkillBarUI();
  updateHud();
  paused = false;
  showScreen(null);

  // Tower drafts a skill before each round, then the round begins.
  if (isTower() && !towerRoundActive) {
    towerRoundActive = true;
    lastSpawn = performance.now();
    showBanner('FIGHT!');
    return;
  }

  // A queued boss enters once the reward is chosen.
  if (pendingBossLevel) {
    const lvl = pendingBossLevel;
    pendingBossLevel = 0;
    setTimeout(() => { if (state === 'playing') startBossFight(lvl); }, 250);
  }
}

function activateSkillSlot(index) {
  if (state !== 'playing' || paused) return;
  const slot = activeSkills[index];
  if (!slot) return;
  if (slot.cooldownLeft > 0) { sfxPowerDenied(); return; }
  slot.cooldownLeft = slot.cooldownMax;
  runActiveSkillEffect(slot.id);
  updateSkillBarUI();
}

function runActiveSkillEffect(id) {
  switch (id) {
    case 'freeze':
      freezeTimer = 3.5;
      setTint('frost');
      spawnFx('FROST LOCK!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxFreeze();
      spawnShockwave(canvas.width / 2, canvas.height / 2, '#9fe8ff', canvas.width);
      for (const w of words) {
        spawnParticles(w.x + w.width / 2, w.y, 14, ['#9fe8ff', '#ffffff', '#5fd0ff'],
          { shape: 'shard', speed: 130, life: 0.9, gravity: 120 });
      }
      addShake(9, 0.4);
      bigShake();
      break;
    case 'slow':
      slowTimer = 5;
      setTint('warp');
      spawnFx('TIME WARP!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxWarp();
      spawnShockwave(canvas.width / 2, canvas.height / 2, '#a77bff', canvas.width * 0.85);
      addShake(6, 0.35);
      break;
    case 'shield':
      shieldCharges += 1;
      spawnFx('WARD UP!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxShield();
      spawnParticles(player.x, player.y - 30, 30, ['#9fe8ff', '#ffffff'], { speed: 180, life: 0.9 });
      addShake(4, 0.25);
      break;
    case 'surge':
      scoreSurgeTimer = 8;
      setTint('surge');
      spawnFx('SCORE SURGE!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxSurge();
      spawnShockwave(canvas.width / 2, canvas.height / 2, '#ffd83d', canvas.width * 0.85);
      addShake(6, 0.35);
      break;
    case 'manasurge':
      mana = Math.min(MANA_MAX, mana + 50);
      spawnFx('MANA SURGE!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxSurge();
      spawnParticles(player.x, player.y - 30, 30, ['#c9a6ff', '#7f5cff'], { speed: 200, life: 0.9 });
      addShake(4, 0.25);
      updateHud();
      break;
  }
  triggerScreenFlash();
}

function updateSkillBarUI() {
  for (let i = 0; i < 3; i++) {
    const slot = activeSkills[i];
    const el = skillSlotEls[i];
    if (!slot) {
      el.classList.add('empty');
      skillSlotNameEls[i].textContent = '—';
      skillSlotIconEls[i].textContent = '●';
      skillCdEls[i].style.height = '0%';
      continue;
    }
    el.classList.remove('empty');
    skillSlotNameEls[i].textContent = slot.name;
    skillSlotIconEls[i].textContent = slot.icon;
    const pct = slot.cooldownMax > 0 ? (slot.cooldownLeft / slot.cooldownMax) * 100 : 0;
    skillCdEls[i].style.height = `${Math.max(0, pct)}%`;
  }
}

// ---------- versus ----------

function renderOpponentRail() {
  if (!vs) return;
  const list = isTower()
    ? [...teamOf(vs, 'A'), ...teamOf(vs, 'B')]
    : vs.opponents;

  opponentRail.innerHTML = '';
  for (const op of list) {
    const card = document.createElement('div');
    card.className = 'opp-card';
    if (!op.alive) card.classList.add('dead');
    if (op.flash > 0) card.classList.add('clear');

    const maxHp = RUMBLE_MAX_HP;
    const pct = isTower() ? 100 : Math.max(0, (op.hp / maxHp) * 100);
    const teamCls = op.team ? (op.team === 'A' ? 'team-a' : 'team-b') : '';

    card.innerHTML = `
      <div class="opp-head">
        <span class="opp-name ${op.isHuman ? 'is-you' : ''}">${op.isHuman ? 'YOU' : op.name}</span>
        <span class="opp-combo">${op.combo > 0 ? 'x' + op.combo : ''}</span>
      </div>
      <div class="opp-bar-outer">
        <div class="opp-bar-fill ${teamCls}" style="width:${isTower() ? 100 : pct}%"></div>
      </div>
      ${op.pressure > 0 ? `<div class="opp-pressure">! ${op.pressure} incoming</div>` : ''}
    `;
    opponentRail.appendChild(card);
  }
}

function updateTowerHud() {
  if (!isTower()) return;
  for (const team of ['A', 'B']) {
    const hp = vs.towers[team];
    towerFill[team].style.width = `${(hp / TOWER_MAX_HP) * 100}%`;
    towerText[team].textContent = `${hp} / ${TOWER_MAX_HP}`;
  }
  towerRoundEl.textContent = `ROUND ${vs.round}`;
}

// Tower bots pull from the same on-screen pool the player types from.
const towerApi = {
  claimWord(op) {
    const free = words.filter(w => !w.claimedBy && w.y > 40);
    if (free.length === 0) return null;
    // prefer the lowest word — the most urgent one
    free.sort((a, b) => b.y - a.y);
    const word = free[Math.floor(Math.random() * Math.min(3, free.length))];
    word.claimedBy = op;
    return word;
  },
  isWordValid(word) {
    return words.includes(word) && word.claimedBy && !word.claimedBy.isHuman;
  },
  releaseWord(word) {
    if (words.includes(word)) word.claimedBy = null;
  },
  completeWord(word, op) {
    const idx = words.indexOf(word);
    if (idx === -1) return;
    words.splice(idx, 1);
    const cx = word.x + word.width / 2;
    spawnExplosion(cx, word.y, op.team === 'A' ? '#7fe8ff' : '#ff8ad0');
    spawnParticles(cx, word.y, 10, [op.team === 'A' ? '#7fe8ff' : '#ff8ad0', '#ffffff']);
    damageTower(vs, enemyTeamOf(op.team), TOWER_WORD_DAMAGE);
    updateTowerHud();
  },
};

function startVersus(format, difficulty, online = false) {
  gameplayMode = format;
  versusFormat = format;
  versusDifficulty = difficulty;
  isOnlineMatch = online;
  playerPlacement = 0;

  vs = format === 'tower'
    ? createTower({ difficulty, playerName: currentProfile?.username || 'You' })
    : createRumble({ botCount: 5, difficulty, playerName: currentProfile?.username || 'You' });

  startGame();

  opponentRail.classList.remove('hidden');
  towerHud.classList.toggle('hidden', format !== 'tower');
  if (format === 'tower') {
    // Tower has no mana ultimate by design — the race is the pressure.
    actionBar.querySelector('.mana-orb-wrap').classList.add('hidden');
    vitals.classList.add('hidden');
    updateTowerHud();
    beginTowerRound();
  } else {
    actionBar.querySelector('.mana-orb-wrap').classList.remove('hidden');
    health = RUMBLE_MAX_HP;
    maxHealth = RUMBLE_MAX_HP;
    updateHud();
  }
  renderOpponentRail();
}

// Every tower round opens with a skill draft, per the format's rules.
function beginTowerRound() {
  towerRoundActive = false;
  paused = true;
  showBanner(`ROUND ${vs.round}`);
  setTimeout(() => openSkillChoice(), 500);
}

function processVersusEvents(events) {
  for (const ev of events) {
    switch (ev.type) {
      case 'incoming': {
        // Garbage words rain onto the player's board.
        for (let i = 0; i < ev.count; i++) {
          const w = makeWord(generateFitting('normal', contentDifficulty()), {
            y: -40 - i * 44, color: '#ff4d5e', pattern: 'straight', speedMult: 1.15,
          });
          w.isGarbage = true;
          words.push(w);
        }
        spawnFx(`${ev.from?.name || 'Rival'} sent ${ev.count}!`, canvas.width / 2, canvas.height * 0.3, 'combo');
        addShake(6, 0.3);
        sfxMonsterRoar(0.4);
        break;
      }
      case 'eliminated':
        spawnFx(`${ev.target.isHuman ? 'YOU' : ev.target.name} OUT!`, canvas.width / 2, canvas.height * 0.36, 'combo mega');
        bigShake();
        // Once you're knocked out the run is over for you, even though the
        // remaining bots would otherwise keep fighting.
        if (ev.target.isHuman && !vs.finished) {
          playerPlacement = vs.opponents.filter(o => o.alive).length + 1;
          paused = true;
          setTimeout(() => { if (vs) endVersus(null); }, 1400);
        }
        break;
      case 'round-end':
        showBanner(`TEAM ${ev.winner} TAKES ROUND ${ev.round}`);
        triggerScreenFlash();
        bigShake();
        break;
      case 'round-start':
        words = [];
        activeWord = null;
        updateTowerHud();
        beginTowerRound();
        break;
      case 'finished':
        endVersus(ev.winner);
        break;
    }
  }
}

function endVersus(winner) {
  const playerWon = isTower()
    ? winner === 'A'
    : (winner && winner.isHuman);

  state = 'result';
  hud.classList.add('hidden');
  actionBar.classList.add('hidden');
  vitals.classList.add('hidden');
  opponentRail.classList.add('hidden');
  towerHud.classList.add('hidden');
  stopMusic();
  playerWon ? sfxLevelUp() : sfxGameOver();
  bigShake();

  const elapsedMinutes = Math.max((performance.now() - gameStartTime) / 60000, 1 / 60);
  const accuracy = totalKeystrokes > 0 ? Math.round((correctKeystrokes / totalKeystrokes) * 100) : 100;
  const wpm = Math.round((correctKeystrokes / 5) / elapsedMinutes);

  if (playerWon) {
    resultTitle.textContent = 'VICTORY!';
  } else if (isRumble() && playerPlacement) {
    resultTitle.textContent = `KNOCKED OUT — #${playerPlacement}`;
  } else {
    resultTitle.textContent = 'DEFEAT';
  }
  resultScore.textContent = score;
  resultCombo.textContent = maxCombo;
  resultWords.textContent = wordsTypedTotal;
  resultBosses.textContent = 0;
  resultLevel.textContent = level;
  resultAccuracy.textContent = `${accuracy}%`;
  resultWpm.textContent = wpm;

  const entry = {
    score, level, accuracy, wpm, bestCombo: maxCombo,
    mode: `${versusFormat}/${textMode}`, bosses: 0,
    date: new Date().toISOString(),
  };
  saveScore(entry);
  submitScore(entry).catch(() => {});

  vs = null;
  if (onlineRoom) { onlineRoom.leave().catch(() => {}); onlineRoom = null; }
  showScreen('result');
}

// ---------- typing ----------

function handleTypedChar(char) {
  if (state !== 'playing' || paused) return;

  if (!activeWord) {
    // In Tower the pool is shared, so a word another player has claimed is
    // off-limits until they finish or fumble it.
    const candidates = words
      .filter(w => w.text[0] === char && (!w.claimedBy || w.claimedBy.isHuman))
      .sort((a, b) => b.y - a.y);
    if (candidates.length === 0) return;
    activeWord = candidates[0];
    if (isTower()) {
      activeWord.claimedBy = vs.player;
      if (onlineRoom) onlineRoom.claimWord(activeWord.id);
    }
  }

  const expected = activeWord.text[activeWord.typed];
  totalKeystrokes += 1;

  if (expected === char) {
    correctKeystrokes += 1;
    activeWord.typed += 1;
    activeWord.hitFlash = 0.09;
    sfxKeyTick();
    if (activeWord.typed >= activeWord.text.length) onWordCompleted(activeWord);
  } else {
    combo = passiveCounts.comboguard > 0 ? Math.floor(combo / 2) : 0;
    sfxKeyError();
    addShake(2, 0.1);
    // Release the claim so a teammate can rescue the word.
    if (isTower() && activeWord) {
      activeWord.claimedBy = null;
      activeWord.typed = 0;
      if (onlineRoom) onlineRoom.releaseWord(activeWord.id);
      activeWord = null;
    }
    updateHud();
  }
}

window.addEventListener('keydown', (e) => {
  if (state !== 'playing' || paused) return;
  if (e.ctrlKey && ['1', '2', '3', '4'].includes(e.key)) {
    e.preventDefault();
    if (e.key === '1') activatePower();
    else activateSkillSlot(Number(e.key) - 2);
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key.length === 1) handleTypedChar(e.key.toLowerCase());
});

// ---------- player ----------

function updatePlayer(dt) {
  player.x = canvas.width / 2;
  player.y = canvas.height - 40;
  if (player.attackTimer > 0) player.attackTimer = Math.max(0, player.attackTimer - dt);
  if (player.hurtTimer > 0) player.hurtTimer = Math.max(0, player.hurtTimer - dt);
  player.blinkTimer -= dt;
  if (!player.blinking && player.blinkTimer <= 0) {
    player.blinking = true;
    player.blinkTimer = 0.12;
  } else if (player.blinking && player.blinkTimer <= 0) {
    player.blinking = false;
    player.blinkTimer = 2 + Math.random() * 3;
  }
}

// ---------- render ----------

function render(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  if (shakeTimer > 0) {
    ctx.translate((Math.random() * 2 - 1) * shakeMag, (Math.random() * 2 - 1) * shakeMag);
  }

  drawSky(now);
  drawGrid(now);

  if (state === 'playing') {
    if (boss) drawBoss(ctx, boss, now);

    const t = now / 1000;
    const fontSize = currentFontSize();
    const padX = 10;
    const padY = 8;
    const frozen = freezeTimer > 0;
    const sorted = [...words].sort((a, b) => a.y - b.y);

    for (const w of sorted) {
      const isActive = w === activeWord;
      const s = depthScale(w.y);
      const cx = w.x + w.width / 2;

      ctx.save();
      ctx.translate(cx, w.y);
      ctx.scale(s, s);
      drawMonster(w.type, t, w.color, w.seed, (player.x - cx) / canvas.width * 2, frozen, w.hitFlash);
      ctx.restore();

      ctx.save();
      ctx.translate(cx, w.y);
      ctx.scale(s, s);
      ctx.font = pixelFont();
      ctx.textBaseline = 'middle';

      const halfW = w.width / 2;
      const chipW = w.width + padX * 2;
      const chipH = fontSize + padY * 2;

      // A word claimed by someone else is visibly locked out.
      const takenByOther = w.claimedBy && !w.claimedBy.isHuman;
      let chipColor = '#1a0d3d';
      if (w.fromBoss) chipColor = '#5a1030';
      else if (w.isGarbage) chipColor = '#5a1020';
      else if (takenByOther) chipColor = '#2b2b3d';
      else if (isActive) chipColor = '#3a1f80';

      const glowColor = frozen ? '#9fe8ff'
        : takenByOther ? (w.claimedBy.team === 'A' ? '#7fe8ff' : '#ff8ad0')
        : w.color;
      drawChip(-halfW - padX, 6, chipW, chipH, chipColor,
        isActive || frozen || w.fromBoss || takenByOther, glowColor);

      if (takenByOther) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = w.claimedBy.team === 'A' ? '#7fe8ff' : '#ff8ad0';
        ctx.fillText(w.claimedBy.name, 0, -2);
        ctx.textAlign = 'left';
        ctx.restore();
      }

      const typedPart = w.text.slice(0, w.typed);
      const remainingPart = w.text.slice(w.typed);
      const typedWidth = ctx.measureText(typedPart).width;
      const textY = 6 + chipH / 2;

      drawText3D(typedPart, -halfW, textY, '#37ff8b', '#0a3d1e');
      const bodyColor = takenByOther ? '#6f6f8a' : (isActive ? '#ffffff' : '#c7c2ff');
      drawText3D(remainingPart, -halfW + typedWidth, textY, bodyColor, '#04010c');

      if (isActive) {
        ctx.fillStyle = '#ffd83d';
        ctx.fillRect(-halfW + typedWidth, textY + fontSize * 0.55, Math.max(fontSize * 0.6, 6), 2);
      }
      ctx.restore();
    }

    drawPlayer(now, player, {
      hurt: player.hurtTimer > 0,
      shielded: shieldCharges > 0,
      surged: scoreSurgeTimer > 0,
      attackProgress: player.attackTimer > 0 ? 1 - player.attackTimer / ATTACK_DURATION : 0,
    });

    const dangerY = canvas.height - 30;
    const pulse = 0.25 + Math.abs(Math.sin(now / 400)) * 0.35;
    ctx.strokeStyle = `rgba(255,77,94,${pulse})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(0, dangerY);
    ctx.lineTo(canvas.width, dangerY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawShockwaves();
  drawExplosions();
  drawParticles();
  ctx.restore();
}

// ---------- main loop ----------

let frostSpawnAccum = 0;
let railTimer = 0;

function tick(now) {
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  updateStars(dt);
  updateParticles(dt);
  updateExplosions(dt);
  if (shakeTimer > 0) {
    shakeTimer = Math.max(0, shakeTimer - dt);
    if (shakeTimer === 0) shakeMag = 0;
  }

  if (state === 'playing' && !paused) {
    updatePlayer(dt);

    const wasFrozen = freezeTimer > 0;
    const wasSlow = slowTimer > 0;
    const wasSurge = scoreSurgeTimer > 0;
    if (slowTimer > 0) slowTimer = Math.max(0, slowTimer - dt);
    if (freezeTimer > 0) freezeTimer = Math.max(0, freezeTimer - dt);
    if (scoreSurgeTimer > 0) scoreSurgeTimer = Math.max(0, scoreSurgeTimer - dt);
    if ((wasFrozen && freezeTimer === 0) || (wasSlow && slowTimer === 0) || (wasSurge && scoreSurgeTimer === 0)) {
      if (freezeTimer > 0) setTint('frost');
      else if (slowTimer > 0) setTint('warp');
      else if (scoreSurgeTimer > 0) setTint('surge');
      else setTint(null);
    }

    if (freezeTimer > 0) {
      frostSpawnAccum += dt;
      if (frostSpawnAccum > 0.05) {
        frostSpawnAccum = 0;
        spawnParticles(Math.random() * canvas.width, -10, 2, ['#9fe8ff', '#ffffff'],
          { shape: 'shard', speed: 20, life: 2.2, gravity: 40, size: 2 });
      }
    }

    let cooldownChanged = false;
    for (const slot of activeSkills) {
      if (slot.cooldownLeft > 0) {
        const before = slot.cooldownLeft;
        slot.cooldownLeft = Math.max(0, slot.cooldownLeft - dt);
        cooldownChanged = true;
        if (before > 0 && slot.cooldownLeft === 0) {
          pulseChip(skillSlotEls[activeSkills.indexOf(slot)], 'ready-flash');
          sfxPowerReady();
        }
      }
    }
    if (cooldownChanged) updateSkillBarUI();

    const speedMult = freezeTimer > 0 ? 0 : (slowTimer > 0 ? 0.5 : 1);

    // Versus: advance bots, then apply whatever they did to us.
    if (vs) {
      const events = tickVersus(vs, dt, towerApi);
      if (events.length) processVersusEvents(events);

      railTimer -= dt;
      if (railTimer <= 0) {
        railTimer = 0.2;
        renderOpponentRail();
      }
    }

    // Boss fights replace the normal spawner with scripted volleys.
    if (boss) {
      if (updateBoss(boss, dt, canvas.width, canvas.height)) spawnBossVolley();
    } else {
      // Tower feeds eight typists from one pool, so it needs a denser stream.
      const interval = isTower() ? 620 : spawnIntervalMs;
      const cap = isTower() ? 14 : 999;
      if (now - lastSpawn > interval && words.length < cap) {
        spawnWord();
        lastSpawn = now;
      }
    }

    for (const w of [...words]) {
      if (w.hitFlash > 0) w.hitFlash = Math.max(0, w.hitFlash - dt);
      const minX = 10, maxX = canvas.width - 10 - w.width;

      if (w.pattern === 'sine') {
        w.y += w.speed * speedMult * dt;
        w.x = Math.min(Math.max(w.baseX + Math.sin(w.y * w.sineFreq + w.seed) * w.sineAmp, minX), maxX);
      } else if (w.pattern === 'diagonal') {
        w.y += w.speed * speedMult * dt;
        w.x += w.vx * speedMult * dt;
        if (w.x < minX) { w.x = minX; w.vx = Math.abs(w.vx); }
        if (w.x > maxX) { w.x = maxX; w.vx = -Math.abs(w.vx); }
      } else {
        w.y += w.speed * speedMult * dt;
      }

      if (w.y > canvas.height - 30) onWordMissed(w);
    }
  }

  render(now);
  requestAnimationFrame(tick);
}

// ---------- versus setup UI ----------

function selectChip(el) {
  const row = el.parentElement;
  row.querySelectorAll('.pick-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function updateVersusHints() {
  formatHint.textContent = versusFormat === 'tower'
    ? '4v4. Shared word pool — each word deals 5 damage to the enemy tower.'
    : 'Up to 6 fighters. Last one standing wins.';
  const p = AI_PROFILES[versusDifficulty];
  difficultyHint.textContent = `${p.label} — ${p.wpm} WPM, ${Math.round(p.accuracy * 100)}% accuracy.`;
}

// ---------- auth ----------

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  authTitle.textContent = signup ? 'CREATE ACCOUNT' : 'SIGN IN';
  authSubtitle.textContent = signup
    ? 'claim a name for the global board'
    : 'save your scores to the global board';
  authUsername.classList.toggle('hidden', !signup);
  authSubmit.textContent = signup ? 'Create Account' : 'Sign In';
  authToggle.textContent = signup ? 'I already have an account' : 'Create an account';
  authError.textContent = '';
}

async function handleAuthSubmit() {
  authError.textContent = '';
  const email = authEmail.value.trim();
  const password = authPassword.value;
  const username = authUsername.value.trim();

  if (!email || !password) {
    authError.textContent = 'Email and password are required.';
    return;
  }
  if (authMode === 'signup' && username.length < 3) {
    authError.textContent = 'Username must be at least 3 characters.';
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = 'Please wait...';
  try {
    if (authMode === 'signup') {
      await signUp({ email, password, username });
      authError.textContent = 'Account created. Check your email if confirmation is required.';
    } else {
      await signIn({ email, password });
    }
    await refreshSession();
    if (currentSession) showScreen('menu');
  } catch (err) {
    authError.textContent = err.message || 'Something went wrong.';
  } finally {
    authSubmit.disabled = false;
    setAuthMode(authMode);
  }
}

async function refreshSession() {
  currentSession = await getSession();
  currentProfile = currentSession ? await getProfile(currentSession.user.id) : null;
  const name = currentProfile?.username;
  accountBtn.textContent = currentSession ? (name ? name.toUpperCase() : 'PROFILE') : 'Sign In';
}

function showAccount() {
  if (!supabaseReady) {
    showScreen('auth');
    authError.textContent = 'Online features are not configured on this build.';
    return;
  }
  if (currentSession) {
    renderProfile();
    showScreen('profile');
  } else {
    setAuthMode('signin');
    showScreen('auth');
  }
}

function renderProfile() {
  const local = loadLeaderboard();
  profileName.textContent = currentProfile?.username || 'Player';
  profileBest.textContent = local.length ? Math.max(...local.map(e => e.score)) : 0;
  profileRuns.textContent = local.length;
  profileWpm.textContent = local.length ? Math.max(...local.map(e => e.wpm || 0)) : 0;
  profileBosses.textContent = local.reduce((s, e) => s + (e.bosses || 0), 0);
}

// ---------- online ----------

function setOnlineError(msg) { onlineError.textContent = msg || ''; }

function renderLobby() {
  if (!onlineRoom) return;
  const players = onlineRoom.playerList;
  lobbyPlayers.innerHTML = '';
  for (const p of players) {
    const li = document.createElement('li');
    if (p.id === onlineRoom.selfId) li.classList.add('is-self');
    li.innerHTML = `<span>${p.name || 'Player'}</span>
      <span class="lobby-badge">${p.host ? 'HOST' : ''}</span>`;
    lobbyPlayers.appendChild(li);
  }
  const min = onlineFormat === 'tower' ? 2 : 2;
  lobbyHint.textContent = players.length < min
    ? 'waiting for players...'
    : `${players.length} in room — host can start`;
  lobbyStartBtn.classList.toggle('hidden', !onlineRoom.isHost || players.length < min);
}

function handleOnlineEvent(ev) {
  switch (ev.type) {
    case 'roster':
      renderLobby();
      break;
    case 'start':
      showScreen(null);
      startVersus(onlineFormat, versusDifficulty, true);
      break;
    case 'incoming':
      processVersusEvents([{ type: 'incoming', from: { name: ev.from }, count: ev.count }]);
      break;
    case 'claim': {
      const w = words.find(x => x.id === ev.wordId);
      if (w && ev.byId !== onlineRoom.selfId) {
        w.claimedBy = { name: ev.byName, isHuman: false, team: 'B' };
      }
      break;
    }
    case 'release': {
      const w = words.find(x => x.id === ev.wordId);
      if (w) w.claimedBy = null;
      break;
    }
    case 'complete': {
      const idx = words.findIndex(x => x.id === ev.wordId);
      if (idx !== -1) {
        const w = words[idx];
        words.splice(idx, 1);
        spawnExplosion(w.x + w.width / 2, w.y, '#ff8ad0');
      }
      if (vs && ev.team) { damageTower(vs, enemyTeamOf(ev.team), TOWER_WORD_DAMAGE); updateTowerHud(); }
      break;
    }
    case 'finished':
      if (vs) endVersus(ev.winner);
      break;
  }
}

async function createRoom() {
  setOnlineError('');
  if (!supabaseReady) { setOnlineError('Multiplayer requires Supabase to be configured.'); return; }
  const code = generateRoomCode();
  onlineRoom = new OnlineRoom({
    code,
    name: currentProfile?.username || `Guest${Math.floor(Math.random() * 900 + 100)}`,
    format: onlineFormat,
    onEvent: handleOnlineEvent,
  });
  try {
    onlineStatus.textContent = 'creating room...';
    await onlineRoom.connect({ asHost: true });
    lobbyCode.textContent = code;
    renderLobby();
    showScreen('lobby');
  } catch (err) {
    onlineRoom = null;
    setOnlineError(err.message);
  } finally {
    onlineStatus.textContent = 'connect to play with friends';
  }
}

async function joinRoom() {
  setOnlineError('');
  if (!supabaseReady) { setOnlineError('Multiplayer requires Supabase to be configured.'); return; }
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length < 4) { setOnlineError('Enter the 5-character room code.'); return; }

  onlineRoom = new OnlineRoom({
    code,
    name: currentProfile?.username || `Guest${Math.floor(Math.random() * 900 + 100)}`,
    format: onlineFormat,
    onEvent: handleOnlineEvent,
  });
  try {
    onlineStatus.textContent = 'joining...';
    await onlineRoom.connect({ asHost: false });
    lobbyCode.textContent = code;
    renderLobby();
    showScreen('lobby');
  } catch (err) {
    onlineRoom = null;
    setOnlineError(err.message);
  } finally {
    onlineStatus.textContent = 'connect to play with friends';
  }
}

async function leaveRoom() {
  if (onlineRoom) { await onlineRoom.leave().catch(() => {}); onlineRoom = null; }
  showScreen('online');
}

// ---------- input wiring ----------

let lastHoverEl = null;

document.addEventListener('mouseover', (e) => {
  const btn = e.target.closest('.btn-3d, .skill-card');
  if (btn && btn !== lastHoverEl) { sfxUiHover(); lastHoverEl = btn; }
});

document.addEventListener('mouseout', (e) => {
  const btn = e.target.closest('.btn-3d, .skill-card');
  if (btn && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.btn-3d, .skill-card') === btn)) {
    lastHoverEl = null;
  }
});

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'toggle-mute') {
    applyMuted(!muted);
    if (!muted) sfxUiClick();
    return;
  }

  sfxUiClick();

  switch (action) {
    case 'show-modes': showScreen('mode'); break;
    case 'select-gameplay':
      gameplayMode = target.dataset.gameplay || 'adventure';
      showScreen('text');
      break;
    case 'select-text':
      textMode = target.dataset.text || 'words';
      startGame();
      break;
    case 'back-to-menu': showScreen('menu'); break;
    case 'back-to-modes': showScreen('mode'); break;
    // Versus matches must rebuild their opponents, not just reset the board.
    case 'play-again':
    case 'restart-run':
      if (gameplayMode === 'rumble' || gameplayMode === 'tower') {
        startVersus(gameplayMode, versusDifficulty, false);
      } else {
        startGame();
      }
      break;
    case 'go-home': leaveToMenu(); break;
    case 'exit': state = 'menu'; showScreen('menu'); break;
    case 'open-settings': openSettings(); break;
    case 'close-settings': closeSettings(); break;
    case 'toggle-sfx': applyMuted(!muted); break;
    case 'toggle-music': applyMusicMuted(!musicMuted); break;
    case 'toggle-shake': applyShake(!shakeEnabled); break;
    case 'clear-leaderboard': handleClearLeaderboard(); break;
    case 'show-leaderboard':
      previousScreen = state === 'result' ? 'result' : 'menu';
      renderLeaderboard();
      showScreen('leaderboard');
      break;
    case 'close-leaderboard': showScreen(previousScreen); break;
    case 'activate-power': activatePower(); break;
    case 'activate-skill': activateSkillSlot(Number(target.dataset.slot)); break;
    case 'choose-skill': chooseSkill(Number(target.dataset.index)); break;

    // versus setup
    case 'show-versus-setup': updateVersusHints(); showScreen('versus'); break;
    case 'pick-format':
      versusFormat = target.dataset.format;
      selectChip(target);
      updateVersusHints();
      break;
    case 'pick-difficulty':
      versusDifficulty = target.dataset.difficulty;
      selectChip(target);
      updateVersusHints();
      break;
    case 'pick-content':
      textMode = target.dataset.text;
      selectChip(target);
      break;
    case 'start-versus':
      startVersus(versusFormat, versusDifficulty, false);
      break;

    // online
    case 'show-online':
      setOnlineError(supabaseReady ? '' : 'Multiplayer requires Supabase to be configured.');
      showScreen('online');
      break;
    case 'pick-online-format':
      onlineFormat = target.dataset.format;
      selectChip(target);
      break;
    case 'create-room': createRoom(); break;
    case 'join-room': joinRoom(); break;
    case 'leave-room': leaveRoom(); break;
    case 'start-online': if (onlineRoom) onlineRoom.startMatch(); break;
    case 'copy-code':
      navigator.clipboard?.writeText(lobbyCode.textContent).catch(() => {});
      target.textContent = 'Copied';
      setTimeout(() => { target.textContent = 'Copy'; }, 1200);
      break;

    // account
    case 'show-account': showAccount(); break;
    case 'auth-submit': handleAuthSubmit(); break;
    case 'auth-toggle': setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); break;
    case 'sign-out':
      signOut().then(refreshSession).then(() => showScreen('menu'));
      break;
  }
});

// Let Enter submit the auth form and the room-code field.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (!screens.auth.classList.contains('hidden')) handleAuthSubmit();
  else if (!screens.online.classList.contains('hidden') && document.activeElement === roomCodeInput) joinRoom();
});

// ---------- boot ----------

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
updateSettingsUI();
updateVersusHints();
setAuthMode('signin');
refreshSession().catch(() => {});
onAuthChange(() => { refreshSession().catch(() => {}); });
showScreen('loading');
runLoadingSequence();
lastFrameTime = performance.now();
requestAnimationFrame(tick);

// Exposed for debugging/verification in the browser console.
window.PK = {
  get state() { return state; },
  get level() { return level; },
  get boss() { return boss; },
  get words() { return words; },
  get health() { return health; },
  get xp() { return xp; },
  get xpNeeded() { return xpNeeded; },
  get vs() { return vs; },
  get combo() { return combo; },
  get paused() { return paused; },
  startGame,
  grantXp,
  startBossFight,
  spawnBossVolley,
  startVersus,
  setMode(g, t) { gameplayMode = g; textMode = t; },
  setCombo(c) { combo = c; },
  registerKill,
  makeWord,
  generateFitting,
  towerApi,
  xpNeededFor,
  BOSS_INTERVAL,
};
