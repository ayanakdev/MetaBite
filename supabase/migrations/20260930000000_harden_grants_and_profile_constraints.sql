-- Grant hygiene, and the profiles bounds that were missing from the schema file.
--
-- Applied 20260930. Reconciles the checked-in migrations with a live database
-- that had already drifted ahead of them.

-- ---------------------------------------------------------------------------
-- Grant hygiene
-- ---------------------------------------------------------------------------
-- daily_totals is SECURITY DEFINER, and anon was granted EXECUTE on it. The
-- function filters on auth.uid(), so an unauthenticated call matched no rows and
-- returned a zero-filled row rather than anyone else's data - there was no leak.
-- But an RPC reachable without a session is surface that does not need to exist,
-- and it is callable directly over /rest/v1/rpc/daily_totals by anyone holding
-- the publishable key, which ships inside the app bundle.
--
-- The client always has a session before it calls this, so revoking from anon
-- changes nothing for the app.
revoke execute on function public.daily_totals(date) from anon;
revoke execute on function public.daily_totals(date) from public;
grant execute on function public.daily_totals(date) to authenticated;

-- handle_new_user is a trigger function (returns trigger), so Postgres already
-- refuses a direct call. Revoking keeps the grant list honest about that rather
-- than relying on the return type to stop it.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- app_day() and app_timezone() stay executable by PUBLIC on purpose. app_day() is
-- the DEFAULT for logged_meals.eaten_on, and a column default is evaluated as the
-- inserting role, so revoking it would break every insert. They are SECURITY
-- INVOKER and return a constant, so there is nothing to escalate into.

-- ---------------------------------------------------------------------------
-- profiles bounds
-- ---------------------------------------------------------------------------
-- These four goals and the avatar/nickname limits are enforced on the live
-- database but were missing from the checked-in schema, so a rebuild from the
-- migrations would have produced a database that accepts values the app's own
-- steppers refuse. The bounds match OnboardingScreen's steppers and
-- SettingsScreen's clamping exactly.
--
-- Re-stated idempotently so this migration is safe on a database that already
-- has them, and load-bearing on one that does not.

alter table public.profiles
  drop constraint if exists profiles_nickname_check;
alter table public.profiles
  add constraint profiles_nickname_check check (char_length(nickname) <= 40);

alter table public.profiles
  drop constraint if exists profiles_avatar_key_check;
alter table public.profiles
  add constraint profiles_avatar_key_check check (
    avatar_key = any (array[
      'apple'::text, 'dumbbell'::text, 'bolt'::text, 'avocado'::text,
      'salmon'::text, 'carrot'::text, 'drop'::text
    ])
  );

alter table public.profiles
  drop constraint if exists profiles_daily_calorie_goal_check;
alter table public.profiles
  add constraint profiles_daily_calorie_goal_check
  check (daily_calorie_goal between 800 and 10000);

alter table public.profiles
  drop constraint if exists profiles_daily_protein_goal_check;
alter table public.profiles
  add constraint profiles_daily_protein_goal_check
  check (daily_protein_goal between 0 and 1000);

alter table public.profiles
  drop constraint if exists profiles_daily_carb_goal_check;
alter table public.profiles
  add constraint profiles_daily_carb_goal_check
  check (daily_carb_goal between 0 and 2000);

alter table public.profiles
  drop constraint if exists profiles_daily_fat_goal_check;
alter table public.profiles
  add constraint profiles_daily_fat_goal_check
  check (daily_fat_goal between 0 and 1000);
