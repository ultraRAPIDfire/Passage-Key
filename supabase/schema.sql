-- Passage Key — database schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
--
-- Security model: the browser only ever holds the `anon` key, so every table
-- below is protected by Row Level Security. Without RLS enabled, the anon key
-- would let anyone read and write everything.

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null,
  display_name text,
  avatar_id    integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Usernames are shown on leaderboards, so profiles are world-readable.
drop policy if exists "profiles are viewable by everyone" on public.profiles;
create policy "profiles are viewable by everyone"
  on public.profiles for select
  using (true);

-- But only the owner may create or modify their own row.
drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------------------------------------------------------------------ scores

-- NOTE: user_id references public.profiles(id) rather than auth.users(id).
-- profiles.id is itself an FK to auth.users(id), so integrity is identical —
-- but PostgREST can only join along foreign keys it can see, and it cannot
-- traverse into the auth schema. Pointing at profiles is what makes the
-- `scores -> profiles(username)` leaderboard join resolve.
create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  mode       text not null,
  score      integer not null check (score >= 0),
  level      integer not null check (level >= 1),
  wpm        integer not null check (wpm >= 0 and wpm <= 400),
  accuracy   integer not null check (accuracy between 0 and 100),
  best_combo integer not null default 0 check (best_combo >= 0),
  bosses     integer not null default 0 check (bosses >= 0),
  created_at timestamptz not null default now()
);

create index if not exists scores_score_idx on public.scores (score desc);
create index if not exists scores_mode_score_idx on public.scores (mode, score desc);
create index if not exists scores_user_idx on public.scores (user_id);

alter table public.scores enable row level security;

drop policy if exists "scores are viewable by everyone" on public.scores;
create policy "scores are viewable by everyone"
  on public.scores for select
  using (true);

-- A user may only submit scores attributed to themselves.
drop policy if exists "users insert own scores" on public.scores;
create policy "users insert own scores"
  on public.scores for insert
  with check (auth.uid() = user_id);

-- Deliberately NO update/delete policies: submitted scores are immutable,
-- so a client cannot retroactively edit its history.

-- NOTE ON TRUST: scores are submitted by the browser, so a determined user can
-- still forge a plausible run. The CHECK constraints above bound the obvious
-- nonsense (e.g. 9999 WPM). If leaderboard integrity becomes important, move
-- submission into an Edge Function that validates keystroke telemetry.

-- ----------------------------------------------- auto-create profile on signup

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    -- fall back to a unique handle if none was supplied at signup
    coalesce(
      nullif(new.raw_user_meta_data->>'username', ''),
      'player_' || substr(new.id::text, 1, 8)
    ),
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), 'Player')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------- keep updated_at fresh

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
