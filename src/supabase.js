// Supabase client + auth/profile/leaderboard helpers.
//
// Both values below are *publishable* browser keys. The anon key is safe to
// ship to clients — all access control is enforced by Row Level Security
// policies in the database (see supabase/schema.sql). The service_role key
// must NEVER appear in this file or anywhere else in the frontend.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;

// Supabase renamed these: `sb_publishable_...` is the modern replacement for the
// legacy `anon` JWT. Accept either name so existing setups keep working.
const anonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

// The game is fully playable offline; online features simply stay disabled
// until credentials are provided, rather than crashing the app.
export const isConfigured = Boolean(url && anonKey);

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

if (!isConfigured) {
  console.info('[Passage Key] Supabase not configured — running in offline mode.');
}

// ---------- auth ----------

export async function signUp({ email, password, username }) {
  if (!supabase) throw new Error('Online features are not configured.');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  if (!supabase) throw new Error('Online features are not configured.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function requestPasswordReset(email) {
  if (!supabase) throw new Error('Online features are not configured.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function changePassword(newPassword) {
  if (!supabase) throw new Error('Online features are not configured.');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// Usernames are unique, so surface a friendly message instead of a raw
// Postgres constraint error.
export async function changeUsername(userId, username) {
  if (!supabase) throw new Error('Online features are not configured.');
  const { data, error } = await supabase
    .from('profiles')
    .update({ username, display_name: username })
    .eq('id', userId)
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('That username is already taken.');
    throw error;
  }
  return data;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

// ---------- profile ----------

export async function getProfile(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

export async function updateProfile(userId, patch) {
  if (!supabase) throw new Error('Online features are not configured.');
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- scores ----------

export async function submitScore(entry) {
  if (!supabase) return null;
  const session = await getSession();
  if (!session) return null; // anonymous runs stay local-only

  const { data, error } = await supabase.from('scores').insert({
    user_id: session.user.id,
    mode: entry.mode,
    score: entry.score,
    level: entry.level,
    wpm: entry.wpm,
    accuracy: entry.accuracy,
    best_combo: entry.bestCombo,
    bosses: entry.bosses ?? 0,
  }).select().single();

  if (error) {
    console.warn('[Passage Key] score submit failed:', error.message);
    return null;
  }
  return data;
}

const SCORE_COLUMNS = 'score, level, wpm, accuracy, best_combo, bosses, mode, created_at';

// ---------- matches / ranking ----------

// Routed through a SECURITY DEFINER function so aggregate stats and RP can
// only move by the server's rules, never by a direct client write.
export async function recordMatch(m) {
  if (!supabase) return null;
  const session = await getSession();
  if (!session) return null;

  const { data, error } = await supabase.rpc('record_match', {
    p_mode: m.mode,
    p_ranked: !!m.ranked,
    p_placement: m.placement ?? null,
    p_field_size: m.fieldSize ?? null,
    p_score: Math.round(m.score || 0),
    p_wpm: Math.round(m.wpm || 0),
    p_accuracy: Math.round(m.accuracy || 0),
    p_best_combo: Math.round(m.bestCombo || 0),
    p_level: Math.round(m.level || 1),
    p_bosses: Math.round(m.bosses || 0),
    p_rp_change: Math.round(m.rpChange || 0),
    p_duration_sec: Math.round(m.durationSec || 0),
  });

  if (error) {
    console.warn('[Passage Key] match record failed:', error.message);
    return null;
  }
  return Array.isArray(data) ? data[0] : data;
}

export async function fetchMatchHistory(userId, limit = 15) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[Passage Key] match history failed:', error.message);
    return [];
  }
  return data;
}

export async function fetchRankLeaderboard(limit = 25) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('username, rank_points, wins, games_played, best_wpm')
    .order('rank_points', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[Passage Key] rank board failed:', error.message);
    return [];
  }
  return data;
}

export async function fetchGlobalLeaderboard({ mode = null, limit = 25 } = {}) {
  if (!supabase) return [];

  const run = (columns) => {
    let q = supabase
      .from('scores')
      .select(columns)
      .order('score', { ascending: false })
      .limit(limit);
    if (mode) q = q.eq('mode', mode);
    return q;
  };

  // Preferred: join the player's username in a single round trip.
  const withNames = await run(`${SCORE_COLUMNS}, profiles(username)`);
  if (!withNames.error) return withNames.data;

  // The join needs the scores -> profiles foreign key (see migration 001).
  // If it's missing, still show the board rather than nothing.
  console.warn('[Passage Key] leaderboard join unavailable, falling back:', withNames.error.message);
  const plain = await run(SCORE_COLUMNS);
  if (plain.error) {
    console.warn('[Passage Key] leaderboard fetch failed:', plain.error.message);
    return [];
  }
  return plain.data.map(row => ({ ...row, profiles: null }));
}
