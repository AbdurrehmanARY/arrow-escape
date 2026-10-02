-- ArrowPath — development seed data.
--
-- Purpose:  Put believable rows in all four tables so Collection, Stats,
--           Challenge history and Leagues can be judged with content in them
--           rather than as a set of empty states.
--
-- Notes:    **Run this in the Supabase SQL editor, not from the app.** Row-level
--           security restricts every write to `auth.uid() = user_id`, so the
--           publishable key the app ships with cannot seed another player's rows
--           — that is the policy working, not an obstacle to route around. The
--           SQL editor runs as the service role, which is the right place.
--
--           Run `0001_progress_and_leagues.sql` first. Nothing here creates
--           tables.
--
--           Idempotent throughout: every insert ends in `on conflict`, so a
--           second run changes nothing. Section 4 is the teardown.
--
--           Every table references `auth.users`, so section 1 seeds whoever has
--           actually signed in. **This file invents no accounts and no players.**
--           It used to add 24 rival accounts so the league table looked busy;
--           that section is gone, and an empty league now renders the Leagues
--           screen's empty state instead of a table full of people who do not
--           exist. See section 2.

-- ===========================================================================
-- 1. Progress, challenges and league scores for every real account
-- ===========================================================================

-- 120 cleared levels each, with a spread of quality rather than a flat wall of
-- perfect runs. The Stats screen grades clears into perfect / clean / scraped
-- through, and all three bands need rows or that breakdown reads as broken.
insert into public.level_records (user_id, level_id, times_cleared, best_mistakes, best_hearts_left, updated_at)
select
  u.id,
  g.level_id,
  1 + (g.level_id % 3),
  case when g.level_id % 5 = 0 then 0
       when g.level_id % 5 in (1, 2) then 1 + (g.level_id % 2)
       else 3 + (g.level_id % 3) end,
  case when g.level_id % 5 = 0 then 5
       when g.level_id % 5 in (1, 2) then 4 - (g.level_id % 2)
       else 1 + (g.level_id % 2) end,
  now() - ((g.level_id % 60) || ' days')::interval
from auth.users u
cross join generate_series(1, 120) as g(level_id)
on conflict (user_id, level_id) do nothing;

-- 45 days of daily challenges. Mostly wins, with losses scattered through, so the
-- streak maths has something to break on — a history of nothing but wins makes
-- `currentStreak` and `longestStreak` indistinguishable.
insert into public.challenge_records
  (user_id, day, level_id, tier, outcome, time_ms, moves, hearts_left, hints_used, completed_at)
select
  u.id,
  (current_date - g.n),
  1 + ((g.n * 7) % 600),
  (array['easy','casual','medium','tricky','hard','superHard'])[1 + (g.n % 6)],
  case when g.n % 9 = 4 then 'lost' else 'won' end,
  45000 + (g.n * 3137) % 240000,
  20 + (g.n * 13) % 180,
  case when g.n % 9 = 4 then 0 else 1 + (g.n % 5) end,
  case when g.n % 4 = 0 then 0 else g.n % 3 end,
  (current_date - g.n) + interval '19 hours'
from auth.users u
cross join generate_series(0, 44) as g(n)
on conflict (user_id, day) do nothing;

-- Four weeks of league scores, climbing toward the present so a trend reads.
-- Thresholds come from `LEAGUES` in src/league/league.ts: Bronze 0, Silver 400,
-- Gold 1200, Ruby 2500, Obsidian 5000, Diamond 9000. These land in Ruby.
insert into public.league_scores (user_id, week_id, arrows, updated_at)
select u.id, w.week_id, w.arrows, now()
from auth.users u
cross join (values
  ('2026-W31', 1180),
  ('2026-W32', 1640),
  ('2026-W33', 2210),
  ('2026-W34', 2680)
) as w(week_id, arrows)
on conflict (user_id, week_id) do update set arrows = excluded.arrows;

-- ===========================================================================
-- 2. Rivals
-- ===========================================================================
--
-- This section used to insert 24 invented accounts into `auth.users`
-- (`rival1@arrowpath.invalid` …) with scores tuned so promotion and demotion
-- both had occupants. It is gone: fake leaderboard users are exactly what must
-- not ship, and a development database full of people who do not exist is how
-- those people end up in a production screenshot.
--
-- The consequence is honest and accepted — a single-player league shows the
-- Leagues screen's empty state rather than a populated table. `zoneFor` still
-- works; it simply has nothing to draw a zone around until real players compete.
-- Section 1 still seeds whoever has actually signed in, and it invents nothing.

-- ===========================================================================
-- 3. What landed
-- ===========================================================================

select 'profiles' as table_name, count(*) from public.profiles
union all select 'level_records',     count(*) from public.level_records
union all select 'challenge_records', count(*) from public.challenge_records
union all select 'league_scores',     count(*) from public.league_scores;

-- ---------------------------------------------------------------------------
-- 4. Teardown
-- ---------------------------------------------------------------------------
--
-- Uncomment to undo. Everything above references `auth.users`, so these three
-- statements clear the seeded rows for real accounts; deleting from `auth.users`
-- would cascade to their profiles and scores, which is why every table declares
-- `on delete cascade`.
--
-- There are no invented accounts left to delete.
--
-- delete from public.level_records;
-- delete from public.challenge_records;
-- delete from public.league_scores;
