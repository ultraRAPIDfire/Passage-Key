// Online multiplayer over Supabase Realtime.
//
// Deliberately peer-broadcast rather than server-authoritative: in a typing
// game each player simulates only their own board, so the only thing that has
// to cross the wire is "I sent you N words" plus lightweight status. That keeps
// it free (no game server) and latency-tolerant.
//
// Trade-off: a modified client could lie about its combo. Acceptable for
// casual/friends play; see README for the hardening path.

import { supabase, isConfigured, getSession } from './supabase.js';

export const ROOM_CODE_LENGTH = 5;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable 0/O/1/I

export function generateRoomCode() {
  let out = '';
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export class OnlineRoom {
  constructor({ code, name, format, ranked = false, onEvent }) {
    this.code = code.toUpperCase();
    this.name = name;
    this.format = format;
    this.ranked = ranked;
    this.onEvent = onEvent || (() => {});
    this.channel = null;
    this.directory = null;
    this.selfId = null;
    this.isHost = false;
    this.players = new Map();      // id -> { id, name, team, ready, hp, combo, alive }
    this.started = false;
  }

  get playerList() {
    return [...this.players.values()];
  }

  async connect({ asHost = false } = {}) {
    if (!isConfigured || !supabase) {
      throw new Error('Online play requires Supabase to be configured.');
    }

    const session = await getSession();
    this.selfId = session?.user?.id || `guest-${generateRoomCode()}`;
    this.isHost = asHost;

    this.channel = supabase.channel(`room:${this.code}`, {
      config: {
        presence: { key: this.selfId },
        broadcast: { self: false },
      },
    });

    // Presence is the roster: who is here, their team, and their live status.
    this.channel.on('presence', { event: 'sync' }, () => {
      const state = this.channel.presenceState();
      this.players.clear();
      for (const key of Object.keys(state)) {
        const meta = state[key][0];
        if (meta) this.players.set(key, { ...meta, id: key });
      }
      this.publish().catch(() => {});
      this.onEvent({ type: 'roster', players: this.playerList });
    });

    this.channel.on('broadcast', { event: 'attack' }, ({ payload }) => {
      if (payload.targetId && payload.targetId !== this.selfId) return;
      this.onEvent({ type: 'incoming', from: payload.fromName, count: payload.count });
    });

    this.channel.on('broadcast', { event: 'claim' }, ({ payload }) => {
      this.onEvent({ type: 'claim', wordId: payload.wordId, byId: payload.byId, byName: payload.byName });
    });

    this.channel.on('broadcast', { event: 'release' }, ({ payload }) => {
      this.onEvent({ type: 'release', wordId: payload.wordId });
    });

    this.channel.on('broadcast', { event: 'complete' }, ({ payload }) => {
      this.onEvent({ type: 'complete', wordId: payload.wordId, byId: payload.byId, team: payload.team });
    });

    this.channel.on('broadcast', { event: 'start' }, ({ payload }) => {
      this.started = true;
      this.onEvent({ type: 'start', seed: payload.seed, teams: payload.teams });
    });

    this.channel.on('broadcast', { event: 'eliminated' }, ({ payload }) => {
      this.onEvent({ type: 'eliminated', id: payload.id, name: payload.name });
    });

    this.channel.on('broadcast', { event: 'finished' }, ({ payload }) => {
      this.onEvent({ type: 'finished', winner: payload.winner });
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timed out.')), 12000);
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          await this.channel.track({
            name: this.name,
            team: null,
            ready: false,
            hp: 100,
            combo: 0,
            alive: true,
            host: asHost,
          });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error('Could not join the room.'));
        }
      });
    });

    return this;
  }

  async updateSelf(patch) {
    if (!this.channel) return;
    const current = this.players.get(this.selfId) || {};
    await this.channel.track({ ...current, ...patch, name: this.name });
  }

  send(event, payload) {
    if (!this.channel) return;
    this.channel.send({ type: 'broadcast', event, payload });
  }

  attack(targetId, count) {
    this.send('attack', { targetId, count, fromName: this.name, fromId: this.selfId });
  }

  claimWord(wordId) {
    this.send('claim', { wordId, byId: this.selfId, byName: this.name });
  }

  releaseWord(wordId) {
    this.send('release', { wordId, byId: this.selfId });
  }

  completeWord(wordId, team) {
    this.send('complete', { wordId, byId: this.selfId, team });
  }

  // Host assigns teams and a shared RNG seed so every client generates the
  // same word stream for tower mode.
  startMatch() {
    if (!this.isHost) return;
    const players = this.playerList;
    const teams = {};
    players.forEach((p, i) => { teams[p.id] = i % 2 === 0 ? 'A' : 'B'; });
    const seed = Math.floor(Math.random() * 1e9);
    this.started = true;
    this.send('start', { seed, teams });
    this.onEvent({ type: 'start', seed, teams });
  }

  async leave() {
    if (!this.channel) return;
    try {
      await this.channel.untrack();
      await supabase.removeChannel(this.channel);
    } catch { /* channel already torn down */ }
    if (this.isHost) await unadvertiseRoom();
    this.directory = null;
    this.channel = null;
    this.players.clear();
  }

  // Keep the public directory entry in step with the real roster.
  async publish() {
    if (!this.isHost) return;
    this.directory = await advertiseRoom({
      code: this.code,
      format: this.format,
      count: this.players.size || 1,
      ranked: this.ranked,
      host: this.name,
    });
    // Closed rooms drop out of the browser once the match begins.
    if (this.started && this.directory) {
      await this.directory.track({
        code: this.code, format: this.format, count: this.players.size || 1,
        ranked: this.ranked, host: this.name, open: false, at: Date.now(),
      });
    }
  }
}

// ---------- quickplay ----------

// Rooms advertise themselves in a shared lobby channel so Quickplay can find
// one without any server-side matchmaking service.
const DIRECTORY_CHANNEL = 'passagekey:lobby';

// Supabase reuses a channel instance per topic, and handlers cannot be added
// after subscribe(). So the directory is a single shared channel that every
// consumer (advertiser, browser, matchmaker) reads from.
let dirChannel = null;
let dirReady = null;
const dirKey = `c-${generateRoomCode()}${generateRoomCode()}`;

// Round trip to the realtime endpoint, captured once at subscribe time.
let dirPing = 0;

function ensureDirectory() {
  if (dirReady) return dirReady;
  if (!isConfigured || !supabase) return Promise.resolve(null);

  dirChannel = supabase.channel(DIRECTORY_CHANNEL, {
    config: { presence: { key: dirKey } },
  });
  // A presence handler must exist before subscribing for state to arrive.
  dirChannel.on('presence', { event: 'sync' }, () => {});

  const t0 = performance.now();
  dirReady = new Promise((resolve) => {
    const done = setTimeout(() => resolve(dirChannel), 6000);
    dirChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        dirPing = Math.round(performance.now() - t0);
        clearTimeout(done);
        resolve(dirChannel);
      }
    });
  });
  return dirReady;
}

export function directoryPing() { return dirPing; }

function readRooms() {
  if (!dirChannel) return [];
  const state = dirChannel.presenceState();
  const out = [];
  for (const key of Object.keys(state)) {
    const meta = state[key][0];
    if (!meta || !meta.open || !meta.code) continue;
    out.push(meta);
  }
  return out;
}

// Publish (or refresh) this client's room in the shared directory.
export async function advertiseRoom({ code, format, count, ranked, host }) {
  const ch = await ensureDirectory();
  if (!ch) return null;
  await ch.track({ code, format, count, ranked: !!ranked, host, open: true, at: Date.now() });
  return ch;
}

export async function unadvertiseRoom() {
  if (!dirChannel) return;
  try { await dirChannel.untrack(); } catch { /* already gone */ }
}

// Snapshot every advertised room for the lobby browser. Ping is the measured
// round trip to the realtime endpoint rather than an invented number.
export async function listOpenRooms({ settle = 900 } = {}) {
  const ch = await ensureDirectory();
  if (!ch) return [];
  // Give presence a beat to sync; the settle wait is not part of the ping.
  await new Promise(r => setTimeout(r, settle));

  return readRooms()
    .map(r => ({ ...r, ping: dirPing }))
    .sort((a, b) => (b.count || 1) - (a.count || 1));
}

// Pick the fullest room that still has space and matches the queue.
export async function findOpenRoom(format, { settle = 1200, ranked = null, capacity = 6 } = {}) {
  const ch = await ensureDirectory();
  if (!ch) throw new Error('Online play requires Supabase to be configured.');
  await new Promise(r => setTimeout(r, settle));

  const candidates = readRooms().filter(m => {
    if (m.format !== format) return false;
    if (ranked !== null && !!m.ranked !== !!ranked) return false;
    if ((m.count || 1) >= capacity) return false;
    return m.code !== undefined;
  });

  candidates.sort((a, b) => (b.count || 1) - (a.count || 1));
  return candidates.length ? candidates[0].code : null;
}

// Deterministic PRNG so all clients in a tower match see identical words.
export function makeSeededRandom(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
