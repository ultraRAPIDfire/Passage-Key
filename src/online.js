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
  constructor({ code, name, format, onEvent }) {
    this.code = code.toUpperCase();
    this.name = name;
    this.format = format;          // 'rumble' | 'tower'
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
    if (this.directory) {
      try { await supabase.removeChannel(this.directory); } catch { /* already gone */ }
      this.directory = null;
    }
    this.channel = null;
    this.players.clear();
  }

  // Keep the public directory entry in step with the real roster.
  async publish() {
    if (!this.isHost) return;
    if (!this.directory) {
      this.directory = await advertiseRoom({
        code: this.code, format: this.format, count: this.players.size || 1,
      });
    } else {
      await this.directory.track({
        code: this.code, format: this.format,
        count: this.players.size || 1,
        open: !this.started, at: Date.now(),
      });
    }
  }
}

// ---------- quickplay ----------

// Rooms advertise themselves in a shared lobby channel so Quickplay can find
// one without any server-side matchmaking service.
const DIRECTORY_CHANNEL = 'passagekey:lobby';

export async function advertiseRoom({ code, format, count }) {
  if (!isConfigured || !supabase) return null;
  const ch = supabase.channel(DIRECTORY_CHANNEL, {
    config: { presence: { key: code } },
  });
  await new Promise((resolve) => {
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ code, format, count, open: true, at: Date.now() });
        resolve();
      }
    });
  });
  return ch;
}

// Look through advertised rooms for an open one matching the format.
export async function findOpenRoom(format, { timeout = 3500 } = {}) {
  if (!isConfigured || !supabase) throw new Error('Online play requires Supabase to be configured.');

  const ch = supabase.channel(DIRECTORY_CHANNEL, { config: { presence: { key: `seek-${generateRoomCode()}` } } });

  const found = await new Promise((resolve) => {
    let settled = false;
    const finish = (val) => { if (!settled) { settled = true; resolve(val); } };

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const cap = format === 'tower' ? 8 : 6;
      const candidates = [];
      for (const key of Object.keys(state)) {
        const meta = state[key][0];
        if (!meta || !meta.open || meta.code === undefined) continue;
        if (meta.format !== format) continue;
        if ((meta.count || 1) >= cap) continue;
        candidates.push(meta);
      }
      // Prefer the fullest room that still has space, so games start sooner.
      candidates.sort((a, b) => (b.count || 1) - (a.count || 1));
      if (candidates.length) finish(candidates[0].code);
    });

    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      setTimeout(() => finish(null), timeout);
    });
  });

  try { await supabase.removeChannel(ch); } catch { /* already gone */ }
  return found;
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
