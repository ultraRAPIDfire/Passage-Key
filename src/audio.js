// Audio engine: synthesis, SFX, monster voices, and adaptive music.

export const MUTE_KEY = 'passageKeyMuted';
export const MUSIC_MUTE_KEY = 'passageKeyMusicMuted';
export const VOLUME_KEY = 'passageKeyVolume';
export const SHAKE_KEY = 'passageKeyShake';

let audioCtx = null;
export let muted = localStorage.getItem(MUTE_KEY) === '1';
export let musicMuted = localStorage.getItem(MUSIC_MUTE_KEY) === '1';
export let shakeEnabled = localStorage.getItem(SHAKE_KEY) !== '0';
export let masterVolume = localStorage.getItem(VOLUME_KEY) !== null
  ? Number(localStorage.getItem(VOLUME_KEY))
  : 0.8;

// Independent buses so music can sit under the effects (or be silenced alone).
const MUSIC_VOL_KEY = 'passageKeyMusicVolume';
const SFX_VOL_KEY = 'passageKeySfxVolume';
let musicVolume = localStorage.getItem(MUSIC_VOL_KEY) !== null ? Number(localStorage.getItem(MUSIC_VOL_KEY)) : 1;
let sfxVolume = localStorage.getItem(SFX_VOL_KEY) !== null ? Number(localStorage.getItem(SFX_VOL_KEY)) : 1;

export function getMusicVolume() { return musicVolume; }
export function getSfxVolume() { return sfxVolume; }
export function setMusicVolume(v) { musicVolume = v; localStorage.setItem(MUSIC_VOL_KEY, String(v)); }
export function setSfxVolume(v) { sfxVolume = v; localStorage.setItem(SFX_VOL_KEY, String(v)); }

// Setters live here: ES module bindings are read-only for importers.
export function setMuted(v) {
  muted = v;
  localStorage.setItem(MUTE_KEY, v ? '1' : '0');
}

export function setMusicMuted(v) {
  musicMuted = v;
  localStorage.setItem(MUSIC_MUTE_KEY, v ? '1' : '0');
}

export function setShakeEnabled(v) {
  shakeEnabled = v;
  localStorage.setItem(SHAKE_KEY, v ? '1' : '0');
}

export function setMasterVolume(v) {
  masterVolume = v;
  localStorage.setItem(VOLUME_KEY, String(v));
}

export function ensureAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function playOscAt(time, freq, duration, type, volume, slideTo) {
  const ac = ensureAudio();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, time + duration);
  gain.gain.setValueAtTime(Math.max(volume, 0.0001), time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(time);
  osc.stop(time + duration + 0.02);
}

export function playNoiseAt(time, duration, volume, filterType, filterFreq) {
  const ac = ensureAudio();
  const bufferSize = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(Math.max(volume, 0.0001), time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  let node = noise;
  if (filterType) {
    const filter = ac.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq || 1000, time);
    node.connect(filter);
    node = filter;
  }
  node.connect(gain).connect(ac.destination);
  noise.start(time);
  noise.stop(time + duration + 0.02);
}

export function tone({ freq, duration, type = 'square', volume = 0.12, slideTo = null, delay = 0 }) {
  if (muted) return;
  const ac = ensureAudio();
  playOscAt(ac.currentTime + delay, freq, duration, type, volume * masterVolume * sfxVolume, slideTo);
}

export function noiseBurst({ duration = 0.15, volume = 0.15, filterType = null, filterFreq = 1000 } = {}) {
  if (muted) return;
  const ac = ensureAudio();
  playNoiseAt(ac.currentTime, duration, volume * masterVolume * sfxVolume, filterType, filterFreq);
}

// ---------- monster voices ----------

// A growl: detuned saw pair swept downward through a lowpass, plus a throaty
// noise layer. `tier` 0..1 makes it deeper, louder and longer.
export function sfxMonsterRoar(tier = 0) {
  if (muted) return;
  const ac = ensureAudio();
  const t0 = ac.currentTime;
  const dur = 0.45 + tier * 0.45;
  const baseFreq = 150 - tier * 55;

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(300 + tier * 500, t0);
  filter.frequency.exponentialRampToValueAtTime(90, t0 + dur);
  filter.Q.value = 6 + tier * 6;

  const outGain = ac.createGain();
  outGain.gain.setValueAtTime(0.0001, t0);
  outGain.gain.linearRampToValueAtTime((0.16 + tier * 0.14) * masterVolume, t0 + 0.06);
  outGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  filter.connect(outGain).connect(ac.destination);

  [1, 1.011, 0.5].forEach((mult, i) => {
    const osc = ac.createOscillator();
    osc.type = i === 2 ? 'square' : 'sawtooth';
    const f = baseFreq * mult;
    osc.frequency.setValueAtTime(f * 1.35, t0);
    osc.frequency.exponentialRampToValueAtTime(f * 0.55, t0 + dur);

    // vibrato gives it a living, throaty wobble
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.frequency.setValueAtTime(18 + tier * 14, t0);
    lfoGain.gain.setValueAtTime(f * 0.12, t0);
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);

    osc.connect(filter);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  });

  playNoiseAt(t0, dur * 0.75, 0.07 * masterVolume * (1 + tier), 'bandpass', 420 - tier * 160);
}

// Short dying squeal when a monster is slain; pitch varies per species.
export function sfxMonsterDeath(pitch = 1) {
  if (muted) return;
  const ac = ensureAudio();
  const t0 = ac.currentTime;
  const f = 420 * pitch;
  playOscAt(t0, f, 0.16, 'sawtooth', 0.05 * masterVolume, f * 0.35);
  playNoiseAt(t0, 0.1, 0.04 * masterVolume, 'highpass', 900);
}

// Rising horde scream used for big power casts.
export function sfxHordeScream() {
  if (muted) return;
  const ac = ensureAudio();
  const t0 = ac.currentTime;
  for (let i = 0; i < 5; i++) {
    const f = 180 + i * 90;
    playOscAt(t0 + i * 0.03, f, 0.5, 'sawtooth', 0.05 * masterVolume, f * 2.4);
  }
  playNoiseAt(t0, 0.5, 0.12 * masterVolume, 'bandpass', 800);
}

// ---------- gameplay SFX ----------

export function sfxKeyTick() { tone({ freq: 1400, duration: 0.04, type: 'square', volume: 0.04 }); }
export function sfxKeyError() { tone({ freq: 160, duration: 0.09, type: 'sawtooth', volume: 0.08 }); }

export function sfxWordComplete(tier) {
  const base = 440 + tier * 12;
  [0, 4, 7].forEach((semi, i) => tone({
    freq: base * Math.pow(2, semi / 12), duration: 0.09, type: 'triangle', volume: 0.085, delay: i * 0.04,
  }));
}

export function sfxCombo(mega) {
  const base = 520;
  const notes = mega ? [0, 3, 7, 10, 12] : [0, 4, 7];
  notes.forEach((semi, i) => tone({
    freq: base * Math.pow(2, semi / 12), duration: 0.1, type: 'square', volume: mega ? 0.1 : 0.08, delay: i * 0.05,
  }));
}

export function sfxMiss() {
  tone({ freq: 220, duration: 0.3, type: 'sawtooth', volume: 0.12, slideTo: 60 });
  noiseBurst({ duration: 0.14, volume: 0.13, filterType: 'lowpass', filterFreq: 700 });
}

export function sfxLevelUp() {
  [0, 4, 7, 12, 16, 19].forEach((semi, i) => tone({
    freq: 392 * Math.pow(2, semi / 12), duration: 0.2, type: 'square', volume: 0.1, delay: i * 0.07,
  }));
}

export function sfxGameOver() {
  [0, -3, -7, -12].forEach((semi, i) => tone({
    freq: 392 * Math.pow(2, semi / 12), duration: 0.35, type: 'triangle', volume: 0.12, delay: i * 0.18,
  }));
  sfxMonsterRoar(1);
}

export function sfxUiClick() { tone({ freq: 600, duration: 0.05, type: 'square', volume: 0.07 }); }
export function sfxUiHover() { tone({ freq: 900, duration: 0.02, type: 'sine', volume: 0.03 }); }

export function sfxPower() {
  tone({ freq: 200, duration: 0.4, type: 'sawtooth', volume: 0.15, slideTo: 900 });
  noiseBurst({ duration: 0.3, volume: 0.18 });
  [0, 4, 7, 12, 16].forEach((semi, i) => tone({
    freq: 300 * Math.pow(2, semi / 12), duration: 0.25, type: 'triangle', volume: 0.12, delay: 0.1 + i * 0.04,
  }));
  sfxHordeScream();
}

export function sfxPowerReady() {
  tone({ freq: 1200, duration: 0.12, type: 'sine', volume: 0.08 });
  tone({ freq: 1600, duration: 0.15, type: 'sine', volume: 0.08, delay: 0.08 });
}

export function sfxPowerDenied() { tone({ freq: 150, duration: 0.08, type: 'square', volume: 0.05 }); }

// Crystalline shatter for the freeze skill.
export function sfxFreeze() {
  if (muted) return;
  const ac = ensureAudio();
  const t0 = ac.currentTime;
  [1800, 2400, 3200].forEach((f, i) => playOscAt(t0 + i * 0.05, f, 0.5, 'sine', 0.07 * masterVolume, f * 0.5));
  playNoiseAt(t0, 0.6, 0.09 * masterVolume, 'highpass', 2200);
  playOscAt(t0, 180, 0.5, 'triangle', 0.09 * masterVolume, 70);
}

// Descending warble for the slow skill.
export function sfxWarp() {
  if (muted) return;
  const ac = ensureAudio();
  const t0 = ac.currentTime;
  playOscAt(t0, 900, 0.7, 'sine', 0.1 * masterVolume, 180);
  playOscAt(t0 + 0.05, 600, 0.7, 'triangle', 0.07 * masterVolume, 120);
  playNoiseAt(t0, 0.4, 0.05 * masterVolume, 'lowpass', 500);
}

export function sfxShield() {
  if (muted) return;
  const ac = ensureAudio();
  const t0 = ac.currentTime;
  [440, 660, 880].forEach((f, i) => playOscAt(t0 + i * 0.04, f, 0.4, 'sine', 0.08 * masterVolume, f * 1.5));
}

export function sfxSurge() {
  if (muted) return;
  const ac = ensureAudio();
  const t0 = ac.currentTime;
  [0, 4, 7, 12].forEach((semi, i) =>
    playOscAt(t0 + i * 0.05, 523 * Math.pow(2, semi / 12), 0.4, 'square', 0.09 * masterVolume));
}

// ---------- adaptive music ----------

const MUSIC_ROOT = 110;
const MUSIC_SCALE = [0, 3, 5, 7, 10, 12, 15, 17];

let musicPlaying = false;
let musicTimer = null;
let nextNoteTime = 0;
let musicStep = 0;
let musicBpm = 100;
let musicPattern = [0, 3, 5, 3];
let musicIntensity = 1;

export function setMusicForLevel(lvl) {
  musicBpm = 92 + lvl * 8;
  musicIntensity = lvl;
  if (lvl <= 2) musicPattern = [0, 3, 5, 3];
  else if (lvl <= 4) musicPattern = [0, 3, 5, 7, 5, 3, 0, 3];
  else if (lvl <= 6) musicPattern = [0, 3, 5, 7, 10, 7, 5, 3];
  else musicPattern = [0, 5, 3, 7, 10, 12, 10, 7, 5, 3, 0, 7];
}

export function noteFreqForStep(step) {
  const degree = musicPattern[step % musicPattern.length];
  return MUSIC_ROOT * Math.pow(2, MUSIC_SCALE[degree] / 12);
}

export function scheduleMusic() {
  if (!musicPlaying) return;
  const ac = ensureAudio();
  while (nextNoteTime < ac.currentTime + 0.15) {
    const stepDur = 60 / musicBpm / 2;
    if (!musicMuted) {
      const freq = noteFreqForStep(musicStep);
      playOscAt(nextNoteTime, freq, stepDur * 0.9, 'triangle', 0.06 * masterVolume * musicVolume);
      if (musicIntensity >= 3 && musicStep % 2 === 1) {
        playNoiseAt(nextNoteTime, 0.03, 0.02 * masterVolume * musicVolume, 'highpass', 4000);
      }
      if (musicIntensity >= 5 && musicStep % 4 === 0) {
        playOscAt(nextNoteTime, freq * 0.5, stepDur * 1.6, 'sawtooth', 0.035 * masterVolume * musicVolume);
      }
      if (musicIntensity >= 7 && musicStep % 8 === 4) {
        playNoiseAt(nextNoteTime, 0.12, 0.045 * masterVolume * musicVolume, 'lowpass', 220);
      }
    }
    nextNoteTime += stepDur;
    musicStep++;
  }
}

export function startMusic(level) {
  ensureAudio();
  musicPlaying = true;
  musicStep = 0;
  nextNoteTime = audioCtx.currentTime + 0.1;
  setMusicForLevel(level);
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = setInterval(scheduleMusic, 40);
}

export function stopMusic() {
  musicPlaying = false;
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
