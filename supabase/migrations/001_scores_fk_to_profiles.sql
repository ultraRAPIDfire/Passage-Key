-- Migration 001 — repoint scores.user_id at profiles(id)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to run more than once.
--
-- Why: scores.user_id originally referenced auth.users(id). PostgREST can only
-- join along foreign keys it can see and cannot traverse into the `auth` schema,
-- so `scores -> profiles(username)` failed with:
--   "Could not find a relationship between 'scores' and 'profiles'"
--
-- profiles.id is itself an FK to auth.users(id) with ON DELETE CASCADE, so
-- referential integrity is unchanged: deleting an auth user still cascades
-- through profiles down to scores.

alter table public.scores
  drop constraint if exists scores_user_id_fkey;

alter table public.scores
  add constraint scores_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- Ask PostgREST to reload its schema cache so the new relationship is picked up
-- immediately rather than after the next restart.
notify pgrst, 'reload schema';
