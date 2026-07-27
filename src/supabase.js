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
