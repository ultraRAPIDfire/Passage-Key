// Core game state, progression, effects, HUD, and the main loop.

import './style.css';
import {
  muted, musicMuted, shakeEnabled, masterVolume,
  setMuted, setMusicMuted, setShakeEnabled, setMasterVolume,
  sfxKeyTick, sfxKeyError, sfxWordComplete, sfxCombo, sfxMiss, sfxLevelUp,
  sfxGameOver, sfxUiClick, sfxUiHover, sfxPower, sfxPowerReady, sfxPowerDenied,
  sfxFreeze, sfxWarp, sfxShield, sfxSurge, sfxMonsterRoar, sfxMonsterDeath,
  startMusic, stopMusic, setMusicForLevel, tone,
  getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume,
} from './audio.js';
import {
  canvas, ctx, HORIZON_RATIO, MONSTER_TYPES, MONSTER_PITCH,
  resizeCanvas, updateStars, drawSky, drawGrid, drawChip, drawText3D,
  drawMonster, drawPlayer, setTheme,
} from './sprites.js';
import { createSnake, updateSnake, drawSnake, severSegment, aliveSegments, SNAKE_INTERVAL } from './snake.js';
import { themeForLevel, updateWeather, drawWeather, drawLightning, resetWeather } from './themes.js';
import { generateText, generateBossPhrase } from './wordgen.js';
import { bossForLevel, isBossLevel, updateBoss, damageBoss, bossVolleySize, drawBoss, BOSS_INTERVAL } from './boss.js';
import {
  AI_PROFILES, createRumble, tickVersus, playerAttack, damagePlayer,
  attackForCombo, damageForWord, RUMBLE_MAX_HP,
} from './versus.js';
import { OnlineRoom, generateRoomCode, findOpenRoom, listOpenRooms } from './online.js';
import {
  isConfigured as supabaseReady, signIn, signUp, signOut,
  getSession, getProfile, updateProfile, submitScore, onAuthChange,
  requestPasswordReset, changePassword, changeUsername,
  recordMatch, fetchMatchHistory,
} from './supabase.js';
import { rankFor, nextRank, rankProgress, computeRpChange, winRate } from './ranking.js';

const MODE_FONT_SIZE = { words: 18, programming: 15, sentences: 13 };
// Sidebar reserves this much of the right gutter during versus matches.
const SIDEBAR_WIDTH = 150;

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
  { id: 'meteor', name: 'Meteor', icon: '☄', desc: 'Destroy the 3 lowest enemies instantly', cooldown: 24 },
  { id: 'purge', name: 'Purge', icon: '☠', desc: 'Wipe every enemy below the halfway line', cooldown: 26 },
  { id: 'heal', name: 'Mend', icon: '✚', desc: 'Restore 35 HP immediately', cooldown: 28 },
  { id: 'gale', name: 'Gale', icon: '≋', desc: 'Push every enemy back to the top', cooldown: 22 },
  { id: 'blink', name: 'Blink Strike', icon: '⟡', desc: 'Instantly clear the most dangerous enemy', cooldown: 12 },
  { id: 'timestop', name: 'Time Stop', icon: '⏻', desc: 'Freeze everything solid for 4s', cooldown: 30 },
  { id: 'doubledmg', name: 'Double Damage', icon: '⚔', desc: 'Double all damage for 10s', cooldown: 26 },
  { id: 'frenzy', name: 'Combo Frenzy', icon: '✹', desc: 'Combo multiplier doubled for 10s', cooldown: 28 },
  { id: 'poison', name: 'Poison Cloud', icon: '☣', desc: 'Poison every enemy — they rot away', cooldown: 24 },
  { id: 'rapid', name: 'Rapid Typing', icon: '⚡', desc: 'All skill cooldowns recover 3x for 8s', cooldown: 32 },
];

const PASSIVE_SKILLS = [
  { id: 'lifesteal', name: 'Lifesteal', icon: '♥', desc: 'Heal 3 HP every 10 kills' },
  { id: 'ironskin', name: 'Iron Skin', icon: '⛊', desc: '+20 max HP, healed instantly' },
  { id: 'manaflow', name: 'Mana Flow', icon: '✧', desc: '+30% mana from every kill' },
  { id: 'scoreboost', name: 'Greed', icon: '◆', desc: '+15% score from every kill' },
  { id: 'comboguard', name: 'Combo Guard', icon: '⚡', desc: 'Hits halve your combo instead of resetting' },
  { id: 'scholar', name: 'Scholar', icon: '⚛', desc: '+20% XP from every kill' },
  { id: 'chain', name: 'Chain Lightning', icon: '🗲', desc: 'Each kill arcs to a nearby enemy and destroys it' },
  { id: 'thorns', name: 'Thorns', icon: '✦', desc: 'Taking a hit destroys 2 random enemies' },
  { id: 'momentum', name: 'Momentum', icon: '➤', desc: 'Enemies fall 10% slower per stack' },
  { id: 'fortune', name: 'Fortune', icon: '❈', desc: '15% chance a kill spawns no replacement' },
  { id: 'crit', name: 'Critical Typing', icon: '✸', desc: '15% chance per stack to deal double damage' },
  { id: 'fireblast', name: 'Fire Explosion', icon: '✷', desc: 'Kills explode, destroying enemies nearby' },
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
  pause: $('screen-pause'),
  roll: $('screen-roll'),
  countdown: $('screen-countdown'),
  instructions: $('screen-instructions'),
  versus: $('screen-versus'),
  online: $('screen-online'),
  searching: $('screen-searching'),
  lobby: $('screen-lobby'),
  auth: $('screen-auth'),
  profile: $('screen-profile'),
  settings: $('screen-settings'),
  skill: $('screen-skill'),
  result: $('screen-result'),
  leaderboard: $('screen-leaderboard'),
};

// loadout roll + countdown DOM
const rollReels = [0, 1, 2].map(i => $(`roll-reel-${i}`));
const rollPassiveName = $('roll-passive-name');
const rollContinue = $('roll-continue');
const countdownLabel = $('countdown-label');
const countdownNumber = $('countdown-number');

// versus + online DOM
const opponentRail = $('opponent-rail');
const opponentCards = $('opponent-cards');
const railToggle = $('rail-toggle');
const formatHint = $('format-hint');
const difficultyHint = $('difficulty-hint');
const onlineStatus = $('online-status');
const searchStatus = $('search-status');
const volumeValue = $('volume-value');
const musicVolumeSlider = $('music-volume-slider');
const musicVolumeValue = $('music-volume-value');
const sfxVolumeSlider = $('sfx-volume-slider');
const sfxVolumeValue = $('sfx-volume-value');
const qualityBtn = $('quality-btn');
const fullscreenBtn = $('fullscreen-btn');
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
const profileRank = $('profile-rank');
const profileRankBar = $('profile-rank-bar');
const profileRp = $('profile-rp');
const profileNextRank = $('profile-next-rank');
const profileGames = $('profile-games');
const profileWinrate = $('profile-winrate');
const profileCombo = $('profile-combo');
const profileAvatar = $('profile-avatar');
const profileMsg = $('profile-msg');
const matchList = $('match-list');
const authRemember = $('auth-remember');
const authRememberRow = $('auth-remember-row');
const authForgot = $('auth-forgot');
const queueHint = $('queue-hint');
const roomList = $('room-list');
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
let doubleDamageTimer = 0;
let comboFrenzyTimer = 0;
let timeStopTimer = 0;
let rapidTimer = 0;
let poisoned = [];

let snake = null;
let boss = null;
let lastBossLevel = 0;
let bossesDefeated = 0;
let pendingBossLevel = 0;
let pendingSnake = false;

// versus / online
let vs = null;
let versusFormat = 'rumble';
let versusDifficulty = 'normal';
let onlineFormat = 'rumble';
let onlineRoom = null;
let isOnlineMatch = false;
let nextWordId = 1;
let playerPlacement = 0;
let currentTheme = themeForLevel(1);
let pausedByMenu = false;
let boardsMinimized = false;
let instructionsReturn = 'menu';
let fillWithBots = true;
let queueMode = 'normal';
let roomFilter = 'all';
let browserRooms = [];
let avatarIndex = 0;
let searchCancelled = false;
let pendingLoadout = null;
let rollTimers = [];
let countdownTimer = null;
let countdownAborted = false;
const QUALITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];
let quality = localStorage.getItem('passageKeyQuality') || 'HIGH';

// auth
let authMode = 'signin';
let currentSession = null;
let currentProfile = null;

const isVersus = () => vs !== null;
const isRumble = () => vs && vs.format === 'rumble';

let spawnIntervalMs = 2000;
let baseSpeed = 50;
let lastSpawn = 0;
let lastFrameTime = 0;

let totalKeystrokes = 0;
let correctKeystrokes = 0;
let wordsTypedTotal = 0;
let gameStartTime = 0;

// WPM inputs. Only characters from *completed* words count, and the clock only
// advances while actually playing — so key-mashing, abandoning a half-typed
// word, or sitting in a pause menu can't inflate the score. Using chars/5 as
// the "word" unit keeps short and long words worth the same per character.
let completedChars = 0;
let typingMs = 0;
let smoothedWpm = 0;

let particles = [];
let explosions = [];
let shockwaves = [];
let boltPaths = [];
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
  volumeValue.textContent = `${Math.round(masterVolume * 100)}%`;
  musicVolumeSlider.value = Math.round(getMusicVolume() * 100);
  musicVolumeValue.textContent = `${Math.round(getMusicVolume() * 100)}%`;
  sfxVolumeSlider.value = Math.round(getSfxVolume() * 100);
  sfxVolumeValue.textContent = `${Math.round(getSfxVolume() * 100)}%`;
  qualityBtn.textContent = quality;
  fullscreenBtn.textContent = document.fullscreenElement ? 'ON' : 'OFF';
}

function cycleQuality() {
  const i = QUALITY_LEVELS.indexOf(quality);
  quality = QUALITY_LEVELS[(i + 1) % QUALITY_LEVELS.length];
  localStorage.setItem('passageKeyQuality', quality);
  applyQuality();
  updateSettingsUI();
}

// Lower settings thin out the expensive decorative layers.
function applyQuality() {
  document.body.dataset.quality = quality;
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  setTimeout(updateSettingsUI, 150);
}

function applyMuted(v) { setMuted(v); updateMuteButton(); updateSettingsUI(); }
function applyMusicMuted(v) { setMusicMuted(v); updateSettingsUI(); }
function applyShake(v) { setShakeEnabled(v); updateSettingsUI(); }

updateMuteButton();
volumeSlider.addEventListener('input', (e) => {
  setMasterVolume(Number(e.target.value) / 100);
  volumeValue.textContent = `${e.target.value}%`;
});
musicVolumeSlider.addEventListener('input', (e) => {
  setMusicVolume(Number(e.target.value) / 100);
  musicVolumeValue.textContent = `${e.target.value}%`;
});
sfxVolumeSlider.addEventListener('input', (e) => {
  setSfxVolume(Number(e.target.value) / 100);
  sfxVolumeValue.textContent = `${e.target.value}%`;
});

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
  if (pausedByMenu) settingsReturn = 'pause';
  else if (state === 'playing') settingsReturn = 'game';
  else settingsReturn = 'menu';
  if (settingsReturn === 'game') paused = true;
  updateSettingsUI();
  showScreen('settings');
}

function closeSettings() {
  if (settingsReturn === 'pause') {
    showScreen('pause');
  } else if (settingsReturn === 'game') {
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


// Standard WPM: (characters / 5) per minute of actual play.
function currentWpm() {
  const mins = Math.max(typingMs / 60000, 1 / 600);
  return Math.round((completedChars / 5) / mins);
}

function currentAccuracy() {
  return totalKeystrokes > 0 ? Math.round((correctKeystrokes / totalKeystrokes) * 100) : 100;
}

function comboMultiplier(c) {
  const base = 1 + Math.floor(c / 5) * 0.5;
  return comboFrenzyTimer > 0 ? base * 2 : base;
}

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
  for (const b of [...boltPaths]) {
    b.life -= dt;
    if (b.life <= 0) boltPaths.splice(boltPaths.indexOf(b), 1);
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

// Jagged arc between two points, used by Chain Lightning.
function drawBolts() {
  for (const b of boltPaths) {
    const a = Math.max(0, b.life / b.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#dff6ff';
    ctx.shadowColor = '#9fe8ff';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const segs = 6;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      const jitter = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * 22;
      const x = b.from.x + (b.to.x - b.from.x) * k + jitter;
      const y = b.from.y + (b.to.y - b.from.y) * k + jitter * 0.4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
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

// Right edge of the usable play field. In versus the sidebar occupies the
// right gutter, so enemies must never spawn or drift underneath it.
function playfieldRight() {
  return canvas.width - (isVersus() ? SIDEBAR_WIDTH + 12 : 0);
}

function makeWord(text, opts = {}) {
  const margin = 50;
  ctx.font = pixelFont();
  const textWidth = ctx.measureText(text).width;
  const maxRange = Math.max(0, playfieldRight() - margin * 2 - textWidth);
  const x = margin + Math.random() * maxRange;
  const color = opts.color || CHIP_COLORS[Math.floor(Math.random() * CHIP_COLORS.length)];
  const pattern = opts.pattern || pickPattern();
  const momentum = Math.max(0.4, 1 - (passiveCounts.momentum || 0) * 0.1);
  const speed = (baseSpeed + level * 10) * getTimeAcceleration() * (opts.speedMult || 1) * momentum;
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
  // Fortune occasionally skips a spawn outright, thinning the pressure.
  const fortune = (passiveCounts.fortune || 0) * 0.15;
  if (fortune > 0 && Math.random() < fortune) return;

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
  snake = null;
  boss = null;
  lastBossLevel = 0;
  pendingBossLevel = 0;
  pendingSnake = false;
  bossesDefeated = 0;
  spawnIntervalMs = 2000;
  baseSpeed = 50;
  lastSpawn = 0;
  totalKeystrokes = 0;
  correctKeystrokes = 0;
  completedChars = 0;
  typingMs = 0;
  smoothedWpm = 0;
  wordsTypedTotal = 0;
  gameStartTime = performance.now();
  paused = false;
  pausedByMenu = false;
  boltPaths = [];
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
  applyTheme(1);
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

  const accuracy = currentAccuracy();
  const wpm = currentWpm();

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

function applyTheme(lvl) {
  // Versus modes stay on the neutral arena so both sides read the same.
  currentTheme = isVersus() ? themeForLevel(1) : themeForLevel(lvl);
  setTheme(currentTheme);
  resetWeather();
}

function onLevelUp() {
  spawnIntervalMs = Math.max(500, spawnIntervalMs - 190);
  applyTheme(level);
  if (gameplayMode === 'adventure' || gameplayMode === 'classic') {
    spawnFx(currentTheme.name, canvas.width / 2, canvas.height * 0.44, 'skill');
  }
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
  } else if (gameplayMode === 'adventure' && !snake && level % SNAKE_INTERVAL === 0) {
    pendingSnake = true;
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
  completedChars += word.text.replace(/\s/g, '').length;

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

  triggerChainLightning({ x: cx, y: word.y });
  triggerFireExplosion(cx, word.y);

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
  if (isRumble()) {
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

  // Thorns retaliates when you take a hit.
  if (passiveCounts.thorns > 0) {
    const victims = [...words].sort(() => Math.random() - 0.5).slice(0, 2 * passiveCounts.thorns);
    victims.forEach((w, i) => setTimeout(() => destroyWord(w, '#ff8a3d'), i * 80));
  }

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

  if (pendingSnake) {
    pendingSnake = false;
    setTimeout(() => { if (state === 'playing') startSnake(); }, 250);
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
    case 'meteor': {
      spawnFx('METEOR!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxPower();
      const targets = [...words].sort((a, b) => b.y - a.y).slice(0, 3);
      targets.forEach((w, i) => setTimeout(() => destroyWord(w, '#ff8a3d'), i * 110));
      addShake(10, 0.45);
      bigShake();
      break;
    }
    case 'purge': {
      spawnFx('PURGE!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxPower();
      const half = canvas.height * 0.5;
      [...words].filter(w => w.y > half).forEach((w, i) => setTimeout(() => destroyWord(w, '#37ff8b'), i * 60));
      spawnShockwave(canvas.width / 2, half, '#37ff8b', canvas.width);
      addShake(9, 0.4);
      break;
    }
    case 'heal':
      health = Math.min(maxHealth, health + 35);
      spawnFx('+35 HP', canvas.width / 2, canvas.height * 0.24, 'skill');
      spawnParticles(player.x, player.y - 30, 34, ['#37ff8b', '#ffffff'], { speed: 190, life: 0.9 });
      sfxShield();
      pulseChip(hpRow, 'pulse-good');
      updateHud();
      break;
    case 'gale':
      spawnFx('GALE!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxWarp();
      for (const w of words) {
        w.y = Math.min(w.y, -20 - Math.random() * 60);
        w.typed = 0;
      }
      activeWord = null;
      spawnShockwave(canvas.width / 2, canvas.height * 0.7, '#9fe8ff', canvas.width);
      addShake(8, 0.4);
      break;
    case 'blink': {
      const lowest = [...words].sort((a, b) => b.y - a.y)[0];
      if (lowest) {
        spawnFx('BLINK STRIKE!', canvas.width / 2, canvas.height * 0.24, 'skill');
        triggerAttack();
        destroyWord(lowest, '#00f6ff');
        addShake(6, 0.3);
      }
      break;
    }
    case 'timestop':
      timeStopTimer = 4;
      setTint('frost');
      spawnFx('TIME STOP!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxFreeze();
      spawnShockwave(canvas.width / 2, canvas.height / 2, '#ffffff', canvas.width * 1.1);
      addShake(10, 0.5);
      bigShake();
      break;
    case 'doubledmg':
      doubleDamageTimer = 10;
      setTint('surge');
      spawnFx('DOUBLE DAMAGE!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxSurge();
      addShake(6, 0.35);
      break;
    case 'frenzy':
      comboFrenzyTimer = 10;
      setTint('surge');
      spawnFx('COMBO FRENZY!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxCombo(true);
      addShake(6, 0.35);
      break;
    case 'poison':
      spawnFx('POISON CLOUD!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxWarp();
      for (const w of words) {
        if (!poisoned.includes(w)) poisoned.push(w);
        w.poisonTimer = 3.5;
      }
      spawnShockwave(canvas.width / 2, canvas.height / 2, '#37ff8b', canvas.width);
      addShake(5, 0.3);
      break;
    case 'rapid':
      rapidTimer = 8;
      spawnFx('RAPID TYPING!', canvas.width / 2, canvas.height * 0.24, 'skill');
      sfxSurge();
      spawnParticles(player.x, player.y - 30, 30, ['#ffd83d', '#ffffff'], { speed: 220, life: 0.8 });
      addShake(5, 0.3);
      break;
  }
  triggerScreenFlash();
}

// Removes a word with full kill feedback but without combo/score credit,
// used by skills that delete enemies outright.
function destroyWord(word, color) {
  const idx = words.indexOf(word);
  if (idx === -1) return;
  words.splice(idx, 1);
  if (activeWord === word) activeWord = null;
  const cx = word.x + word.width / 2;
  spawnExplosion(cx, word.y, color || word.color);
  spawnParticles(cx, word.y, 18, [color || word.color, '#ffffff'], { speed: 200, life: 0.8 });
  sfxMonsterDeath(MONSTER_PITCH[word.type] || 1);
}

// Fire Explosion: a kill detonates, taking out anything caught in the blast.
function triggerFireExplosion(x, y) {
  const stacks = passiveCounts.fireblast || 0;
  if (stacks <= 0) return;
  const radius = 90 + stacks * 30;

  spawnExplosion(x, y, '#ff8a3d');
  spawnParticles(x, y, 22, ['#ff8a3d', '#ffd83d', '#ffffff'], { speed: 240, life: 0.7 });

  const caught = words.filter(w => Math.hypot((w.x + w.width / 2) - x, w.y - y) <= radius);
  caught.forEach((w, i) => setTimeout(() => destroyWord(w, '#ff8a3d'), i * 60));
  if (caught.length) addShake(5, 0.25);
}

// Chain Lightning: on each kill, arc to the nearest enemy and destroy it.
function triggerChainLightning(origin) {
  const stacks = passiveCounts.chain || 0;
  if (stacks <= 0 || words.length === 0) return;

  let from = origin;
  for (let i = 0; i < stacks; i++) {
    const nearest = words
      .map(w => ({ w, d: Math.hypot((w.x + w.width / 2) - from.x, w.y - from.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!nearest) break;

    const to = { x: nearest.w.x + nearest.w.width / 2, y: nearest.w.y };
    boltPaths.push({ from: { ...from }, to: { ...to }, life: 0.25, maxLife: 0.25 });
    destroyWord(nearest.w, '#9fe8ff');
    from = to;
  }
  tone({ freq: 1800, duration: 0.12, type: 'square', volume: 0.06, slideTo: 600 });
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function liveStats() {
  return { wpm: smoothedWpm, acc: currentAccuracy() };
}

// Bots report the profile they're actually simulating, so the numbers are honest.
function botStats(op) {
  return { wpm: op.profile.wpm, acc: Math.round(op.profile.accuracy * 100) };
}

function renderOpponentRail() {
  if (!vs) return;
  const list = vs.opponents;

  opponentCards.innerHTML = '';
  for (const op of list) {
    const card = document.createElement('div');
    card.className = 'opp-card';
    if (!op.alive) card.classList.add('dead');
    if (op.flash > 0) card.classList.add('clear');

    const pct = Math.max(0, (op.hp / RUMBLE_MAX_HP) * 100);
    const teamCls = op.team ? (op.team === 'A' ? 'team-a' : 'team-b') : '';

    // A miniature of what that opponent is facing: bars stand in for words,
    // dropping toward their danger line as pressure builds.
    let mini = '';
    if (!boardsMinimized) {
      const rows = [];
      const count = op.isHuman ? Math.min(words.length, 6) : Math.min(op.pressure + (op.target ? 1 : 0) + 1, 6);
      for (let i = 0; i < count; i++) {
        const prog = op.isHuman
          ? Math.min(0.95, (words[i]?.y || 0) / canvas.height)
          : Math.min(0.95, 0.15 + (i / 6) + (op.pressure * 0.07));
        const left = 6 + ((i * 37) % 62);
        const w = 18 + (i % 3) * 8;
        const danger = prog > 0.72 ? ' danger' : '';
        rows.push(`<div class="opp-board-word${danger} ${teamCls}" style="left:${left}%;top:${prog * 88}%;width:${w}%"></div>`);
      }
      mini = `<div class="opp-board">${rows.join('')}<div class="opp-board-line"></div></div>`;
    }

    // Live typing stats so players can compare performance mid-match.
    const stats = op.isHuman ? liveStats() : botStats(op);
    const typing = op.isHuman
      ? (activeWord ? activeWord.text : '')
      : (op.target ? op.target.text : '');
    const typedFrac = op.isHuman
      ? (activeWord ? activeWord.typed / activeWord.text.length : 0)
      : (op.target ? Math.min(1, op.progress / op.target.text.length) : 0);

    card.innerHTML = `
      <div class="opp-head">
        <span class="opp-name ${op.isHuman ? 'is-you' : ''}">${op.isHuman ? 'YOU' : op.name}</span>
        <span class="opp-combo">${op.combo > 0 ? 'x' + op.combo : ''}</span>
      </div>
      <div class="opp-bar-outer">
        <div class="opp-bar-fill ${teamCls}" style="width:${pct}%"></div>
      </div>
      <div class="opp-stats">
        <span>${stats.wpm} WPM</span><span>${stats.acc}%</span>
      </div>
      ${typing ? `<div class="opp-typing"><span class="opp-typing-done">${escapeHtml(typing.slice(0, Math.round(typing.length * typedFrac)))}</span>${escapeHtml(typing.slice(Math.round(typing.length * typedFrac)))}</div>` : ''}
      ${op.pressure > 0 ? `<div class="opp-pressure">! ${op.pressure} incoming</div>` : ''}
      ${mini}
    `;
    opponentCards.appendChild(card);
  }
}

function toggleBoards() {
  boardsMinimized = !boardsMinimized;
  opponentRail.classList.toggle('minimized', boardsMinimized);
  railToggle.innerHTML = boardsMinimized ? '&#9650; SHOW' : '&#9660; HIDE';
  renderOpponentRail();
}

function startVersus(format, difficulty, online = false, roster = null) {
  gameplayMode = format;
  versusFormat = format;
  versusDifficulty = difficulty;
  isOnlineMatch = online;
  playerPlacement = 0;

  const capacity = 6;
  const humans = roster ? roster.filter(p => p.id !== onlineRoom?.selfId).length : 0;
  // Seats not taken by real players are filled by bots unless disabled.
  const botCount = fillWithBots ? Math.max(0, capacity - 1 - humans) : 0;

  vs = createRumble({ botCount, difficulty, playerName: currentProfile?.username || 'You' });

  // Give the bots that stand in for real players their actual names, and stop
  // simulating them locally so network events drive them instead.
  if (roster) {
    const others = roster.filter(p => p.id !== onlineRoom?.selfId);
    const slots = vs.opponents.filter(o => !o.isHuman);
    others.forEach((p, i) => {
      if (!slots[i]) return;
      slots[i].name = p.name || 'Player';
      slots[i].isAI = false;
      slots[i].netId = p.id;
    });
  }

  startGame();

  opponentRail.classList.remove('hidden');
  // Restart is meaningless (and unfair) in a live PvP match.
  hud.querySelector('[data-action="restart-run"]').classList.toggle('hidden', online);
  actionBar.querySelector('.mana-orb-wrap').classList.remove('hidden');
  health = RUMBLE_MAX_HP;
  maxHealth = RUMBLE_MAX_HP;
  updateHud();
  renderOpponentRail();

  // Versus never lets you pick: roll a kit, then count everyone in together.
  rollLoadout(() => runCountdown(() => { lastSpawn = performance.now(); }));
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
      case 'finished':
        endVersus(ev.winner);
        break;
    }
  }
}

function endVersus(winner) {
  const playerWon = Boolean(winner && winner.isHuman);

  state = 'result';
  hud.classList.add('hidden');
  actionBar.classList.add('hidden');
  vitals.classList.add('hidden');
  opponentRail.classList.add('hidden');
  stopMusic();
  playerWon ? sfxLevelUp() : sfxGameOver();
  bigShake();

  const accuracy = currentAccuracy();
  const wpm = currentWpm();

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
    mode: versusFormat, bosses: 0,
    date: new Date().toISOString(),
  };
  saveScore(entry);
  submitScore(entry).catch(() => {});

  // Ranked matches move RP; casual ones only add to history.
  const fieldSize = vs ? vs.opponents.length : 1;
  const placement = playerWon ? 1 : (playerPlacement || fieldSize);
  const survivedSec = Math.round(typingMs / 1000);
  const ranked = isOnlineMatch && queueMode === 'ranked';
  const currentRp = currentProfile?.rank_points || 0;
  const { delta } = ranked
    ? computeRpChange({ placement, fieldSize, wpm, accuracy, survivedSec, currentRp })
    : { delta: 0 };

  if (ranked) {
    resultTitle.textContent += `  ${delta >= 0 ? '+' : ''}${delta} RP`;
  }

  recordMatch({
    mode: versusFormat, ranked, placement, fieldSize,
    score, wpm, accuracy, bestCombo: maxCombo, level, bosses: 0,
    rpChange: delta, durationSec: survivedSec,
  }).then(res => {
    if (res && currentProfile) currentProfile.rank_points = res.rp_after;
  }).catch(() => {});

  vs = null;
  if (onlineRoom) { onlineRoom.leave().catch(() => {}); onlineRoom = null; }
  showScreen('result');
}

// ---------- typing ----------

function handleTypedChar(char) {
  if (state !== 'playing' || paused) return;

  // The snake owns input while it's on screen.
  if (typeAtSnake(char)) return;

  if (!activeWord) {
    const candidates = words
      .filter(w => w.text[0] === char)
      .sort((a, b) => b.y - a.y);
    if (candidates.length === 0) return;
    activeWord = candidates[0];
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
    updateHud();
  }
}

window.addEventListener('keydown', (e) => {
  // Escape toggles the pause menu from anywhere in a run.
  if (e.key === 'Escape') {
    e.preventDefault();
    if (state === 'playing') togglePause();
    return;
  }

  if (state !== 'playing' || paused) return;

  // Enter fires the ultimate; Ctrl+1/2/3 fire the three skill slots.
  if (e.key === 'Enter') {
    e.preventDefault();
    activatePower();
    return;
  }
  if (e.ctrlKey && ['1', '2', '3'].includes(e.key)) {
    e.preventDefault();
    activateSkillSlot(Number(e.key) - 1);
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
    if (snake) {
      drawSnake(ctx, snake, now,
        (size) => `${size}px "Press Start 2P", monospace`,
        drawChip, drawText3D);
    }

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
  drawBolts();
  drawExplosions();
  drawParticles();
  drawWeather(ctx, currentTheme, canvas.width, canvas.height);
  ctx.restore();

  // Lightning washes the whole frame, so it sits outside the shake transform.
  drawLightning(ctx, canvas.width, canvas.height);
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
  updateWeather(currentTheme, dt, canvas.width, canvas.height);
  if (shakeTimer > 0) {
    shakeTimer = Math.max(0, shakeTimer - dt);
    if (shakeTimer === 0) shakeMag = 0;
  }

  if (state === 'playing' && !paused) {
    updatePlayer(dt);

    // Clock only runs during live play, and the displayed WPM eases toward the
    // true value so the readout doesn't jitter every keystroke.
    typingMs += dt * 1000;
    smoothedWpm += (currentWpm() - smoothedWpm) * Math.min(1, dt * 3);

    const wasFrozen = freezeTimer > 0;
    const wasSlow = slowTimer > 0;
    const wasSurge = scoreSurgeTimer > 0;
    if (slowTimer > 0) slowTimer = Math.max(0, slowTimer - dt);
    if (freezeTimer > 0) freezeTimer = Math.max(0, freezeTimer - dt);
    if (scoreSurgeTimer > 0) scoreSurgeTimer = Math.max(0, scoreSurgeTimer - dt);
    if (doubleDamageTimer > 0) doubleDamageTimer = Math.max(0, doubleDamageTimer - dt);
    if (comboFrenzyTimer > 0) comboFrenzyTimer = Math.max(0, comboFrenzyTimer - dt);
    if (timeStopTimer > 0) timeStopTimer = Math.max(0, timeStopTimer - dt);
    if (rapidTimer > 0) rapidTimer = Math.max(0, rapidTimer - dt);

    // Poison ticks enemies down until they dissolve.
    for (const w of [...poisoned]) {
      if (!words.includes(w)) { poisoned.splice(poisoned.indexOf(w), 1); continue; }
      w.poisonTimer -= dt;
      if (Math.random() < dt * 6) {
        spawnParticles(w.x + w.width / 2, w.y, 1, ['#37ff8b'], { speed: 30, life: 0.5, size: 2 });
      }
      if (w.poisonTimer <= 0) {
        poisoned.splice(poisoned.indexOf(w), 1);
        destroyWord(w, '#37ff8b');
      }
    }
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
        // Rapid Typing accelerates every cooldown while it lasts.
        slot.cooldownLeft = Math.max(0, slot.cooldownLeft - dt * (rapidTimer > 0 ? 3 : 1));
        cooldownChanged = true;
        if (before > 0 && slot.cooldownLeft === 0) {
          pulseChip(skillSlotEls[activeSkills.indexOf(slot)], 'ready-flash');
          sfxPowerReady();
        }
      }
    }
    if (cooldownChanged) updateSkillBarUI();

    const speedMult = (freezeTimer > 0 || timeStopTimer > 0) ? 0 : (slowTimer > 0 ? 0.5 : 1);

    // Versus: advance bots, then apply whatever they did to us.
    if (vs) {
      const events = tickVersus(vs, dt);
      if (events.length) processVersusEvents(events);

      railTimer -= dt;
      if (railTimer <= 0) {
        railTimer = 0.2;
        renderOpponentRail();
      }
    }

    if (snake) updateSnake(snake, dt, playfieldRight(), canvas.height);

    // Boss fights replace the normal spawner with scripted volleys.
    if (boss) {
      if (updateBoss(boss, dt, canvas.width, canvas.height)) spawnBossVolley();
    } else {
      // Thin the horde while the snake is the main threat.
      const interval = snake ? spawnIntervalMs * 2.2 : spawnIntervalMs;
      const cap = snake ? 4 : 999;
      if (now - lastSpawn > interval && words.length < cap) {
        spawnWord();
        lastSpawn = now;
      }
    }

    for (const w of [...words]) {
      if (w.hitFlash > 0) w.hitFlash = Math.max(0, w.hitFlash - dt);
      const minX = 10, maxX = playfieldRight() - 10 - w.width;

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

// ---------- snake mini-boss ----------

function startSnake() {
  const count = Math.min(4 + Math.floor(level / 2), 9);
  const segWords = Array.from({ length: count }, () => generateFitting('normal', contentDifficulty()));
  snake = createSnake({ level, words: segWords, canvasW: playfieldRight(), canvasH: canvas.height });
  showBanner('THE WORDWYRM');
  sfxMonsterRoar(0.8);
  addShake(8, 0.5);
  bigShake();
  spawnShockwave(canvas.width / 2, canvas.height * 0.28, '#37ff8b', canvas.width);
}

// Typing routes to the snake first while it lives, since its segments sit
// outside the normal falling-word list.
function typeAtSnake(char) {
  if (!snake || snake.defeated) return false;
  const living = aliveSegments(snake);
  if (!living.length) return false;

  // Stay locked on a partially-typed segment before starting a new one.
  let seg = living.find(s => s.typed > 0) || living.find(s => s.word[0] === char);
  if (!seg) return false;

  totalKeystrokes += 1;
  if (seg.word[seg.typed] !== char) {
    seg.typed = 0;
    combo = passiveCounts.comboguard > 0 ? Math.floor(combo / 2) : 0;
    sfxKeyError();
    addShake(2, 0.1);
    updateHud();
    return true;
  }

  correctKeystrokes += 1;
  seg.typed += 1;
  seg.hitFlash = 0.1;
  sfxKeyTick();

  if (seg.typed >= seg.word.length) {
    completedChars += seg.word.replace(/\s/g, '').length;
    combo += 1;
    maxCombo = Math.max(maxCombo, combo);
    wordsTypedTotal += 1;
    const gained = Math.round(seg.word.length * 14 * comboMultiplier(combo));
    score += gained;

    spawnExplosion(seg.x, seg.y, '#37ff8b');
    spawnParticles(seg.x, seg.y, 20, ['#37ff8b', '#ffffff', '#9fffc0'], { speed: 220, life: 0.8 });
    spawnFx(`+${gained}`, seg.x, seg.y - 20, 'score');
    sfxMonsterDeath(1.2);
    triggerAttack();
    addShake(5, 0.25);

    const done = severSegment(snake, seg);
    grantXp(seg.word.length * 3);

    if (done) {
      const reward = 400 + level * 60;
      score += reward;
      showBanner('WORDWYRM SEVERED!');
      spawnFx(`+${reward}`, canvas.width / 2, canvas.height * 0.32, 'combo mega');
      triggerScreenFlash();
      bigShake();
      addShake(12, 0.6);
      spawnShockwave(snake.headX, snake.headY, '#37ff8b', canvas.width);
      spawnParticles(snake.headX, snake.headY, 70, ['#37ff8b', '#ffffff'],
        { speed: 300, life: 1.4, gravity: 120 });
      grantXp(90 * Math.max(1, Math.floor(level / 2)));
      setTimeout(() => { snake = null; }, 1400);
    }
    updateHud();
  }
  return true;
}

// ---------- loadout roll ----------

// Versus modes don't let you draft; the arena rolls a kit so every match
// starts from a different footing.
function rollLoadout(onDone) {
  const actives = shuffledCopy(ACTIVE_SKILLS).slice(0, 3);
  const passive = shuffledCopy(PASSIVE_SKILLS)[0];
  // Long-cooldown skills are the rare pulls worth celebrating.
  const isRare = (s) => s.cooldown >= 26;

  // Hold the match until the kit is locked and the countdown ends, otherwise
  // enemies keep falling behind the roll screen and can kill you mid-animation.
  paused = true;
  rollContinue.classList.add('hidden');
  rollPassiveName.textContent = '—';
  rollReels.forEach(r => {
    r.classList.add('spinning');
    r.classList.remove('locked', 'rare');
  });
  showScreen('roll');

  const cycler = setInterval(() => {
    for (const r of rollReels) {
      if (r.classList.contains('locked')) continue;
      const s = ACTIVE_SKILLS[Math.floor(Math.random() * ACTIVE_SKILLS.length)];
      r.querySelector('.roll-icon').textContent = s.icon;
      r.querySelector('.roll-name').textContent = s.name;
    }
    tone({ freq: 900 + Math.random() * 500, duration: 0.02, type: 'square', volume: 0.03 });
  }, 70);

  const lockReel = (i) => {
    const r = rollReels[i];
    const s = actives[i];
    r.classList.remove('spinning');
    r.classList.add('locked');
    r.querySelector('.roll-icon').textContent = s.icon;
    r.querySelector('.roll-name').textContent = s.name;
    if (isRare(s)) {
      r.classList.add('rare');
      sfxCombo(true);
      triggerScreenFlash();
      bigShake();
    } else {
      sfxPowerReady();
    }
    addShake(5, 0.25);
  };

  rollTimers.push(setTimeout(() => lockReel(0), 900));
  rollTimers.push(setTimeout(() => lockReel(1), 1500));
  rollTimers.push(setTimeout(() => {
    lockReel(2);
    clearInterval(cycler);
    rollPassiveName.textContent = `${passive.icon}  ${passive.name} — ${passive.desc}`;
    sfxLevelUp();
    rollContinue.classList.remove('hidden');
  }, 2100));

  pendingLoadout = { actives, passive, onDone };
}

function applyRolledLoadout() {
  if (!pendingLoadout) return;
  const { actives, passive, onDone } = pendingLoadout;
  pendingLoadout = null;
  rollTimers.forEach(clearTimeout);
  rollTimers = [];

  activeSkills = actives.map(d => ({
    id: d.id, name: d.name, icon: d.icon, cooldownMax: d.cooldown, cooldownLeft: 0,
  }));
  ownedActiveIds = new Set(actives.map(d => d.id));
  passiveCounts[passive.id] = (passiveCounts[passive.id] || 0) + 1;
  if (passive.id === 'ironskin') { maxHealth += 20; health = Math.min(maxHealth, health + 20); }

  updateSkillBarUI();
  updateHud();
  showScreen(null);
  // Stay paused — the countdown owns resuming play.
  if (onDone) onDone();
  else paused = false;
}

// ---------- match countdown ----------

function runCountdown(onGo) {
  paused = true;
  countdownAborted = false;
  countdownLabel.textContent = 'MATCH STARTING';
  showScreen('countdown');

  let n = 5;
  const step = () => {
    if (countdownAborted) return;

    if (n > 0) {
      countdownNumber.textContent = n;
      countdownNumber.className = 'countdown-number';
      void countdownNumber.offsetWidth;
      countdownNumber.classList.add('tick');
      tone({ freq: 620, duration: 0.12, type: 'square', volume: 0.09 });
      n -= 1;
      countdownTimer = setTimeout(step, 900);
    } else {
      countdownNumber.textContent = 'GO!';
      countdownNumber.className = 'countdown-number';
      void countdownNumber.offsetWidth;
      countdownNumber.classList.add('go');
      countdownLabel.textContent = '';
      sfxLevelUp();
      bigShake();
      addShake(9, 0.4);
      countdownTimer = setTimeout(() => {
        showScreen(null);
        paused = false;
        if (onGo) onGo();
      }, 850);
    }
  };
  step();
}

// If a player drops mid-countdown the match can't start, so unwind it.
function abortCountdown() {
  countdownAborted = true;
  if (countdownTimer) { clearTimeout(countdownTimer); countdownTimer = null; }
}

// ---------- pause ----------

function togglePause() {
  if (pausedByMenu) resumeGame();
  else openPauseMenu();
}

function openPauseMenu() {
  if (state !== 'playing') return;
  pausedByMenu = true;
  paused = true;
  showScreen('pause');
}

function resumeGame() {
  pausedByMenu = false;
  paused = false;
  showScreen(null);
}

// ---------- versus setup UI ----------

function selectChip(el) {
  const row = el.parentElement;
  row.querySelectorAll('.pick-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function updateVersusHints() {
  formatHint.textContent = 'Up to 6 fighters. Last one standing wins.';
  const p = AI_PROFILES[versusDifficulty];
  difficultyHint.textContent = `${p.label} — ${p.wpm} WPM, ${Math.round(p.accuracy * 100)}% accuracy.`;
}

// ---------- auth ----------

async function handleForgotPassword() {
  const email = authEmail.value.trim();
  if (!email) { authError.textContent = 'Enter your email first, then tap again.'; return; }
  try {
    await requestPasswordReset(email);
    authError.textContent = 'Reset link sent — check your inbox.';
  } catch (err) {
    authError.textContent = err.message;
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  authTitle.textContent = signup ? 'CREATE ACCOUNT' : 'SIGN IN';
  authSubtitle.textContent = signup
    ? 'claim a name for the global board'
    : 'save your scores to the global board';
  authUsername.classList.toggle('hidden', !signup);
  authRememberRow.classList.toggle('hidden', signup);
  authForgot.classList.toggle('hidden', signup);
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

  // "Remember me" off means the session should not outlive the tab.
  try { localStorage.setItem('passageKeyRemember', authRemember.checked ? '1' : '0'); } catch {}

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

// Online play needs an identity to attach rank and history to. Solo modes stay
// open so the game remains playable without an account.
function requireAccount() {
  if (currentSession) return true;
  setAuthMode('signin');
  authError.textContent = 'Sign in to play online — rank and history need an account.';
  showScreen('auth');
  return false;
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

const AVATARS = ['👾', '🤖', '🐉', '💀', '👻', '🦊', '🐺', '🦅', '⚔️', '🔮'];

function renderProfile() {
  const local = loadLeaderboard();
  const p = currentProfile || {};
  const rp = p.rank_points || 0;
  const rank = rankFor(rp);
  const next = nextRank(rp);

  profileName.textContent = p.username || 'Player';
  profileRank.textContent = rank.name;
  profileRank.style.color = rank.color;
  profileRankBar.style.width = `${rankProgress(rp) * 100}%`;
  profileRp.textContent = `${rp} RP`;
  profileNextRank.textContent = next ? `${next.min - rp} RP to ${next.name}` : 'Peak rank reached';

  const games = p.games_played || 0;
  profileGames.textContent = games;
  profileWinrate.textContent = `${winRate(p.wins || 0, games)}%`;
  profileWpm.textContent = p.best_wpm || 0;
  profileCombo.textContent = p.best_combo || 0;
  profileBosses.textContent = p.bosses_slain || 0;
  profileBest.textContent = local.length ? Math.max(...local.map(e => e.score)) : 0;

  avatarIndex = p.avatar_id || 0;
  profileAvatar.textContent = AVATARS[avatarIndex % AVATARS.length];
  profileMsg.textContent = '';

  renderMatchHistory();
}

async function renderMatchHistory() {
  if (!currentSession) { matchList.innerHTML = '<li class="match-empty">sign in to track matches</li>'; return; }
  matchList.innerHTML = '<li class="match-empty">loading...</li>';

  const rows = await fetchMatchHistory(currentSession.user.id, 15);
  matchList.innerHTML = '';
  if (!rows.length) {
    matchList.innerHTML = '<li class="match-empty">no matches yet — go play one</li>';
    return;
  }

  for (const m of rows) {
    const li = document.createElement('li');
    if (m.placement != null) li.className = m.placement === 1 ? 'win' : 'loss';
    const place = m.placement != null ? `#${m.placement}` : `Lv${m.level_reached}`;
    const rpTxt = m.ranked
      ? `<span class="match-rp ${m.rp_change >= 0 ? 'up' : 'down'}">${m.rp_change >= 0 ? '+' : ''}${m.rp_change} RP</span>`
      : '<span class="match-meta">casual</span>';
    li.innerHTML = `
      <span class="room-name">${escapeHtml(String(m.mode).toUpperCase())} ${place}</span>
      <span class="match-meta">${m.wpm} wpm &middot; ${m.accuracy}%</span>
      ${rpTxt}`;
    matchList.appendChild(li);
  }
}

function cycleAvatar() {
  avatarIndex = (avatarIndex + 1) % AVATARS.length;
  profileAvatar.textContent = AVATARS[avatarIndex];
  if (!currentSession) return;
  updateProfile(currentSession.user.id, { avatar_id: avatarIndex })
    .then(p => { currentProfile = p; })
    .catch(() => { profileMsg.textContent = 'Could not save avatar.'; });
}

async function editUsername() {
  const name = prompt('New username (3-16 characters):', currentProfile?.username || '');
  if (name === null) return;
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 16) {
    profileMsg.textContent = 'Username must be 3-16 characters.';
    return;
  }
  try {
    currentProfile = await changeUsername(currentSession.user.id, trimmed);
    profileMsg.textContent = 'Username updated.';
    renderProfile();
    refreshSession();
  } catch (err) {
    profileMsg.textContent = err.message;
  }
}

async function editPassword() {
  const pw = prompt('New password (at least 6 characters):');
  if (pw === null) return;
  if (pw.length < 6) { profileMsg.textContent = 'Password must be at least 6 characters.'; return; }
  try {
    await changePassword(pw);
    profileMsg.textContent = 'Password updated.';
  } catch (err) {
    profileMsg.textContent = err.message;
  }
}

// ---------- online ----------

function setOnlineError(msg) { onlineError.textContent = msg || ''; }

function updateQueueHint() {
  queueHint.textContent = queueMode === 'ranked'
    ? 'Ranked. Placement and typing performance move your RP.'
    : 'Casual. Nothing at stake — rank is untouched.';
}

function pingClass(ms) {
  if (ms < 80) return '';
  return ms < 160 ? 'mid' : 'high';
}

async function refreshRoomBrowser() {
  if (!supabaseReady) {
    roomList.innerHTML = '<li class="room-empty">multiplayer is not configured</li>';
    return;
  }
  roomList.innerHTML = '<li class="room-empty">searching for rooms...</li>';
  browserRooms = await listOpenRooms();
  renderRoomBrowser();
}

function renderRoomBrowser() {
  const rooms = browserRooms.filter(r => {
    if (roomFilter === 'ranked') return r.ranked;
    if (roomFilter === 'normal') return !r.ranked;
    return true;
  });

  roomList.innerHTML = '';
  if (!rooms.length) {
    roomList.innerHTML = '<li class="room-empty">no open rooms — create one or hit Quickplay</li>';
    return;
  }

  for (const r of rooms) {
    const full = (r.count || 1) >= 6;
    const li = document.createElement('li');
    li.className = full ? 'full' : '';
    if (!full) {
      li.dataset.action = 'join-listed';
      li.dataset.code = r.code;
    }
    li.innerHTML = `
      <span class="room-name">${escapeHtml(r.host || 'Room')}</span>
      <span class="room-tag ${r.ranked ? 'ranked' : 'normal'}">${r.ranked ? 'RANKED' : 'NORMAL'}</span>
      <span class="room-count">${r.count || 1}/6</span>
      <span class="room-ping ${pingClass(r.ping || 0)}">${r.ping || 0}ms</span>`;
    roomList.appendChild(li);
  }
}

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
  const min = 2;
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
      startVersus(onlineFormat, versusDifficulty, true, onlineRoom?.playerList || null);
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
    ranked: queueMode === 'ranked',
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
    ranked: queueMode === 'ranked',
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

// Quickplay: scan the public room directory, join the best open room, and
// only create a fresh one if nothing suitable is out there.
async function quickplay() {
  setOnlineError('');
  if (!supabaseReady) { setOnlineError('Multiplayer requires Supabase to be configured.'); return; }

  searchCancelled = false;
  searchStatus.textContent = 'looking for an open room...';
  showScreen('searching');

  try {
    const code = await findOpenRoom(onlineFormat, { ranked: queueMode === 'ranked' });
    if (searchCancelled) return;

    if (code) {
      searchStatus.textContent = `found ${code} — joining...`;
      roomCodeInput.value = code;
      await joinRoom();
    } else {
      searchStatus.textContent = 'no rooms open — hosting one';
      await createRoom();
    }
  } catch (err) {
    if (searchCancelled) return;
    setOnlineError(err.message || 'Matchmaking failed.');
    showScreen('online');
  }
}

function cancelSearch() {
  searchCancelled = true;
  showScreen('online');
  setOnlineError('');
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
      // Content is always word-based now; bosses still speak in phrases.
      gameplayMode = target.dataset.gameplay || 'adventure';
      textMode = 'words';
      startGame();
      break;
    case 'back-to-menu': showScreen('menu'); break;
    case 'resume': resumeGame(); break;
    case 'show-instructions':
      instructionsReturn = pausedByMenu ? 'pause' : 'menu';
      showScreen('instructions');
      break;
    case 'close-instructions':
      showScreen(instructionsReturn === 'pause' ? 'pause' : 'menu');
      break;
    case 'toggle-boards': toggleBoards(); break;
    case 'pick-fill':
      fillWithBots = target.dataset.fill === '1';
      selectChip(target);
      break;
    case 'pick-lobby-fill':
      fillWithBots = target.dataset.fill === '1';
      selectChip(target);
      break;
    case 'roll-continue': applyRolledLoadout(); break;
    case 'pick-queue':
      queueMode = target.dataset.queue;
      selectChip(target);
      updateQueueHint();
      refreshRoomBrowser();
      break;
    case 'filter-rooms':
      roomFilter = target.dataset.filter;
      selectChip(target);
      renderRoomBrowser();
      break;
    case 'refresh-rooms': refreshRoomBrowser(); break;
    case 'join-listed':
      roomCodeInput.value = target.dataset.code;
      joinRoom();
      break;
    case 'auth-forgot': handleForgotPassword(); break;
    case 'cycle-avatar': cycleAvatar(); break;
    case 'edit-username': editUsername(); break;
    case 'edit-password': editPassword(); break;
    case 'quickplay': quickplay(); break;
    case 'cancel-search': cancelSearch(); break;
    case 'cycle-quality': cycleQuality(); break;
    case 'toggle-fullscreen': toggleFullscreen(); break;
    case 'back-to-modes': showScreen('mode'); break;
    // Versus matches must rebuild their opponents, not just reset the board.
    case 'play-again':
    case 'restart-run':
      // You can't rewind a live match against real people.
      if (isOnlineMatch && vs && !vs.finished) {
        spawnFx('NO RESTARTS IN PVP', canvas.width / 2, canvas.height * 0.3, 'combo');
        sfxPowerDenied();
        break;
      }
      if (gameplayMode === 'rumble') {
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
      if (!requireAccount()) break;
      setOnlineError(supabaseReady ? '' : 'Multiplayer requires Supabase to be configured.');
      updateQueueHint();
      showScreen('online');
      refreshRoomBrowser();
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
applyQuality();
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
  runSkill: runActiveSkillEffect,
  get snake() { return snake; },
  startSnake,
  typeAtSnake,
  rollLoadout,
  runCountdown,
  get wpmNow() { return currentWpm(); },
  get accNow() { return currentAccuracy(); },
  get completedChars() { return completedChars; },
  get typingMs() { return typingMs; },
  addTypingTime(ms) { typingMs += ms; },
  playfieldRight,
  get themeName() { return currentTheme.name; },
  setLevelTheme(lvl) { level = lvl; applyTheme(lvl); },
  get poisonedCount() { return poisoned.length; },
  get buffs() { return { doubleDamageTimer, comboFrenzyTimer, timeStopTimer, rapidTimer }; },
  setMode(g, t) { gameplayMode = g; textMode = t; },
  setCombo(c) { combo = c; },
  registerKill,
  makeWord,
  generateFitting,
  xpNeededFor,
  BOSS_INTERVAL,
};
