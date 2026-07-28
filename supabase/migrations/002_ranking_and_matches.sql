-- Migration 002 — ranking, player stats, and match history
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to run more than once.

-- ------------------------------------------------- profile: rank + stats

alter table public.profiles add column if not exists rank_points integer not null default 0;
alter table public.profiles add column if not exists games_played integer not null default 0;
alter table public.profiles add column if not exists wins integer not null default 0;
alter table public.profiles add column if not exists best_wpm integer not null default 0;
alter table public.profiles add column if not exists best_combo integer not null default 0;
alter table public.profiles add column if not exists bosses_slain integer not null default 0;

alter table public.profiles add constraint profiles_rank_points_range
  check (rank_points >= 0 and rank_points <= 100000) not valid;

create index if not exists profiles_rank_idx on public.profiles (rank_points desc);

-- ----------------------------------------------------------- match history

create table if not exists public.matches (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  mode          text not null,                       -- adventure | classic | rumble
  ranked        boolean not null default false,
  placement     integer,                             -- 1 = win, null for solo modes
  field_size    integer,
  score         integer not null default 0 check (score >= 0),
  wpm           integer not null default 0 check (wpm >= 0 and wpm <= 400),
  accuracy      integer not null default 0 check (accuracy between 0 and 100),
  best_combo    integer not null default 0 check (best_combo >= 0),
  level_reached integer not null default 1 check (level_reached >= 1),
  bosses        integer not null default 0 check (bosses >= 0),
  rp_change     integer not null default 0,
  rp_after      integer not null default 0,
  duration_sec  integer not null default 0 check (duration_sec >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists matches_user_time_idx on public.matches (user_id, created_at desc);
create index if not exists matches_ranked_idx on public.matches (ranked, created_at desc);

alter table public.matches enable row level security;

-- Match history is public so profiles can be viewed by others.
drop policy if exists "matches are viewable by everyone" on public.matches;
create policy "matches are viewable by everyone"
  on public.matches for select
  using (true);

drop policy if exists "users insert own matches" on public.matches;
create policy "users insert own matches"
  on public.matches for insert
  with check (auth.uid() = user_id);

-- Deliberately no update/delete policies: match history is immutable.

-- ---------------------------------- apply a finished match to a profile
--
-- SECURITY DEFINER so the aggregate columns can only move through this
-- function's rules rather than by arbitrary client writes. It always acts on
-- auth.uid(), so a caller cannot credit someone else's account.

create or replace function public.record_match(
  p_mode text,
  p_ranked boolean,
  p_placement integer,
  p_field_size integer,
  p_score integer,
  p_wpm integer,
  p_accuracy integer,
  p_best_combo integer,
  p_level integer,
  p_bosses integer,
  p_rp_change integer,
  p_duration_sec integer
)
returns table (rp_after integer, games_played integer, wins integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rp integer;
  v_win boolean := (p_placement = 1);
  v_delta integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Bound the client-supplied numbers so a tampered client cannot inflate RP.
  v_delta := greatest(-60, least(60, coalesce(p_rp_change, 0)));
  if not coalesce(p_ranked, false) then
    v_delta := 0;                    -- casual play never moves rank
  end if;

  update public.profiles
     set rank_points  = greatest(0, rank_points + v_delta),
         games_played = games_played + 1,
         wins         = wins + (case when v_win then 1 else 0 end),
         best_wpm     = greatest(best_wpm, least(400, coalesce(p_wpm, 0))),
         best_combo   = greatest(best_combo, greatest(0, coalesce(p_best_combo, 0))),
         bosses_slain = bosses_slain + greatest(0, coalesce(p_bosses, 0))
   where id = v_uid
   returning profiles.rank_points, profiles.games_played, profiles.wins
        into v_rp, games_played, wins;

  insert into public.matches (
    user_id, mode, ranked, placement, field_size, score, wpm, accuracy,
    best_combo, level_reached, bosses, rp_change, rp_after, duration_sec
  ) values (
    v_uid, p_mode, coalesce(p_ranked,false), p_placement, p_field_size,
    greatest(0, coalesce(p_score,0)),
    least(400, greatest(0, coalesce(p_wpm,0))),
    least(100, greatest(0, coalesce(p_accuracy,0))),
    greatest(0, coalesce(p_best_combo,0)),
    greatest(1, coalesce(p_level,1)),
    greatest(0, coalesce(p_bosses,0)),
    v_delta, v_rp, greatest(0, coalesce(p_duration_sec,0))
  );

  rp_after := v_rp;
  return next;
end;
$$;

revoke all on function public.record_match(text,boolean,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer) from public;
grant execute on function public.record_match(text,boolean,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer) to authenticated;

notify pgrst, 'reload schema';
