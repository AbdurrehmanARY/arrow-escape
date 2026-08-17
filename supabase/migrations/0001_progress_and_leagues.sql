-- ArrowPath — progress and league storage.
--
-- Purpose:  Give the four things the game currently keeps only on a device a home
--           on the server: who a player is, which levels they have cleared, which
--           daily challenges they have played, and what they have scored this week.
--
-- Notes:    **There is no server code here and none is needed.** Every table is
--           reached directly from the app with the publishable key; row-level
--           security is what makes that safe. A policy is not a suggestion the
--           client is trusted to follow — Postgres enforces it, so a modified
--           client still cannot read or write another player's rows.
--
--           **The one thing RLS cannot do is check whether a score is true.** A
--           player may only write their own `league_scores` row, and they may
--           write any number into it. That is a deliberate, documented limit of a
--           client-only design; closing it needs a server that re-verifies a clear,
--           which `src/game/` is written to make possible later without changing
--           any of this.
--
--           Run this once in the Supabase SQL editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- profiles — one row per account
-- ---------------------------------------------------------------------------
--
-- Exists so a leaderboard can show a name instead of a UUID. Deliberately holds
-- nothing else: the game asks for no personal data, and a table that cannot leak
-- what it never stored is the cheapest privacy guarantee available.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Readable by any signed-in player, because a league table has to name people.
-- This is the only table with a public read, and it is why it holds only a name.
drop policy if exists "profiles are readable by signed-in players" on public.profiles;
create policy "profiles are readable by signed-in players"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "a player writes only their own profile" on public.profiles;
create policy "a player writes only their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "a player updates only their own profile" on public.profiles;
create policy "a player updates only their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- level_records — one row per level a player has cleared
-- ---------------------------------------------------------------------------
--
-- Mirrors `LevelRecord` in `progressStore`. Only cleared levels get a row: the
-- 600 levels a new player has not touched are absence, not data, and writing them
-- would make a first sync 600 rows of nothing.

create table if not exists public.level_records (
  user_id          uuid not null references auth.users (id) on delete cascade,
  level_id         integer not null check (level_id between 1 and 1000),
  times_cleared    integer not null default 0 check (times_cleared >= 0),
  -- 0 is a perfect read, so this is a minimum rather than a maximum.
  best_mistakes    integer not null check (best_mistakes >= 0),
  best_hearts_left integer not null check (best_hearts_left between 0 and 5),
  updated_at       timestamptz not null default now(),
  primary key (user_id, level_id)
);

alter table public.level_records enable row level security;

drop policy if exists "a player sees only their own level records" on public.level_records;
create policy "a player sees only their own level records"
  on public.level_records for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "a player writes only their own level records" on public.level_records;
create policy "a player writes only their own level records"
  on public.level_records for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "a player updates only their own level records" on public.level_records;
create policy "a player updates only their own level records"
  on public.level_records for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- challenge_records — one row per day played
-- ---------------------------------------------------------------------------
--
-- Mirrors `ChallengeRecord`. `day` is the `YYYY-MM-DD` the client already uses as
-- its local key, kept as `date` so ordering and month queries are free.

create table if not exists public.challenge_records (
  user_id      uuid not null references auth.users (id) on delete cascade,
  day          date not null,
  level_id     integer not null,
  tier         text not null,
  outcome      text not null check (outcome in ('won', 'lost')),
  time_ms      integer not null check (time_ms >= 0),
  moves        integer not null check (moves >= 0),
  hearts_left  integer not null check (hearts_left between 0 and 5),
  hints_used   integer not null check (hints_used >= 0),
  completed_at timestamptz not null,
  primary key (user_id, day)
);

alter table public.challenge_records enable row level security;

drop policy if exists "a player sees only their own challenge records" on public.challenge_records;
create policy "a player sees only their own challenge records"
  on public.challenge_records for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "a player writes only their own challenge records" on public.challenge_records;
create policy "a player writes only their own challenge records"
  on public.challenge_records for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "a player updates only their own challenge records" on public.challenge_records;
create policy "a player updates only their own challenge records"
  on public.challenge_records for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- league_scores — arrows per player per week
-- ---------------------------------------------------------------------------
--
-- The only table with a cross-player read, and the reason the Leagues screen can
-- stop showing a single row. `week_id` is the client's own `2026-W33` key, so the
-- server never has to agree with the client about when a week starts — a question
-- that is genuinely hard across time zones and that `weekOf` already answers.

create table if not exists public.league_scores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  week_id    text not null check (week_id ~ '^\d{4}-W\d{2}$'),
  arrows     integer not null default 0 check (arrows >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_id)
);

alter table public.league_scores enable row level security;

-- The one deliberately public read in this schema. A league is a comparison, so
-- it cannot work without seeing other people's scores.
drop policy if exists "league scores are readable by signed-in players" on public.league_scores;
create policy "league scores are readable by signed-in players"
  on public.league_scores for select
  to authenticated
  using (true);

drop policy if exists "a player writes only their own score" on public.league_scores;
create policy "a player writes only their own score"
  on public.league_scores for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "a player updates only their own score" on public.league_scores;
create policy "a player updates only their own score"
  on public.league_scores for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Ordering the current week's table is the single hottest query in the app.
create index if not exists league_scores_week_arrows_idx
  on public.league_scores (week_id, arrows desc);

-- ---------------------------------------------------------------------------
-- A profile row for every account, without the client having to remember
-- ---------------------------------------------------------------------------
--
-- A trigger rather than a client insert, because "sign in, then create your
-- profile" has a window in which the second half can fail — a dropped connection
-- between the two leaves an account that exists and a player who has no name.
-- Doing it in the same transaction as the signup removes the window entirely.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- Google gives a full name; fall back to the local part of the address, and
    -- then to something neutral, so a leaderboard never shows a blank row.
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, 'Player'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill for any account that signed in before this migration ran.
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(u.email, 'Player'), '@', 1)
  )
from auth.users u
on conflict (id) do nothing;
