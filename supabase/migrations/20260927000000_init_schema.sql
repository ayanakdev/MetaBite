-- MetaBite initial schema.
--
-- Reconstructed to match the live database exactly (verified by introspecting
-- pg_proc / pg_policies / pg_indexes / pg_attrdef on the running project).
--
-- The previous version of this file described an abandoned multi-tenant design
-- (organizations, organization_members) that never reached the live database.
-- Do not reintroduce it: MetaBite is strictly single-user, with rows scoped by
-- user_id and enforced by RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- App day boundary
-- ---------------------------------------------------------------------------
-- The product rolls over at 00:00 Asia/Karachi (UTC+5, no DST), not at the
-- server's UTC midnight. Both the client and the database must agree on this or
-- meals logged late at night get filed under the wrong day. The client mirrors
-- this in src/lib/dates.ts (APP_TIMEZONE) - keep the two in sync.

create or replace function public.app_timezone()
returns text
language sql
stable
as $$ select 'Asia/Karachi'::text; $$;

create or replace function public.app_day()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Karachi')::date; $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- One row per auth user, created by the on_auth_user_created trigger.

create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text        not null,
  nickname             text        not null default '',
  avatar_key           text        not null default 'bolt',
  daily_calorie_goal   integer     not null default 2000,
  daily_protein_goal   integer     not null default 80,
  daily_carb_goal      integer     not null default 200,
  daily_fat_goal       integer     not null default 70,
  onboarded_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

-- ---------------------------------------------------------------------------
-- logged_meals
-- ---------------------------------------------------------------------------
-- eaten_on is stored (not derived at read time) so a 30-day history query is a
-- plain range scan. The default uses app_day() so a meal logged at 23:50 PKT
-- lands on the local day, and the app sends eaten_on explicitly to correct it.
--
-- user_id references profiles(id), not auth.users(id). The FK chain is
-- auth.users -> profiles -> logged_meals, which means deleting the auth user
-- cascades to both, and it also makes it impossible to log a meal for a user
-- who has no profile row.
--
-- A CHECK constraint pins source to the MealSource union in
-- src/lib/types.ts; adding a source there without updating this will make every
-- meal save fail at the database.
create table if not exists public.logged_meals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  eaten_on     date        not null default public.app_day(),
  logged_at    timestamptz not null default now(),
  title        text        not null,
  source       text        not null default 'manual',
  photo_path   text,
  ingredients  jsonb       not null default '[]'::jsonb,
  calories     numeric     not null default 0,
  protein_g    numeric     not null default 0,
  carbs_g      numeric     not null default 0,
  fat_g        numeric     not null default 0,
  fiber_g      numeric     not null default 0,
  sugar_g      numeric     not null default 0,
  sodium_mg    numeric     not null default 0,
  ai_notes     text,
  micros       jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Serves the dashboard (today) and the 30-day History tab (range scan) alike.
create index if not exists logged_meals_user_day_idx
  on public.logged_meals (user_id, eaten_on desc);

-- Keep source in step with the MealSource union in src/lib/types.ts. The app
-- only ever writes 'gemini' or 'manual', but constraining it here turns a
-- typo into a clear constraint violation instead of a silently wrong row.
alter table public.logged_meals
  drop constraint if exists logged_meals_source_check;
alter table public.logged_meals
  add constraint logged_meals_source_check
  check (source in ('gemini', 'usda', 'openfoodfacts', 'manual'));

alter table public.logged_meals
  drop constraint if exists logged_meals_title_check;
alter table public.logged_meals
  add constraint logged_meals_title_check
  check (char_length(btrim(title)) between 1 and 120);

-- Negative macros are always a bug upstream, and they would silently drain the
-- daily tanks.
alter table public.logged_meals
  drop constraint if exists logged_meals_calories_check;
alter table public.logged_meals
  add constraint logged_meals_calories_check check (calories >= 0);

alter table public.logged_meals
  drop constraint if exists logged_meals_protein_g_check;
alter table public.logged_meals
  add constraint logged_meals_protein_g_check check (protein_g >= 0);

alter table public.logged_meals
  drop constraint if exists logged_meals_carbs_g_check;
alter table public.logged_meals
  add constraint logged_meals_carbs_g_check check (carbs_g >= 0);

alter table public.logged_meals
  drop constraint if exists logged_meals_fat_g_check;
alter table public.logged_meals
  add constraint logged_meals_fat_g_check check (fat_g >= 0);

alter table public.logged_meals
  drop constraint if exists logged_meals_fiber_g_check;
alter table public.logged_meals
  add constraint logged_meals_fiber_g_check check (fiber_g >= 0);

alter table public.logged_meals
  drop constraint if exists logged_meals_sugar_g_check;
alter table public.logged_meals
  add constraint logged_meals_sugar_g_check check (sugar_g >= 0);

alter table public.logged_meals
  drop constraint if exists logged_meals_sodium_mg_check;
alter table public.logged_meals
  add constraint logged_meals_sodium_mg_check check (sodium_mg >= 0);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists logged_meals_set_updated_at on public.logged_meals;
create trigger logged_meals_set_updated_at
  before update on public.logged_meals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Signup -> profile
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because it is fired by auth.users, where the caller's
-- privileges do not extend to public.profiles.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved text;
begin
  resolved := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'nickname',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  if resolved is null or resolved = '' then
    -- split_part gives the part of the address before '@'
    resolved := coalesce(
      nullif(split_part(new.email, '@', 1), ''),
      'athlete'
    );
  end if;

  insert into public.profiles (id, email, nickname, avatar_key)
  values (
    new.id,
    new.email,
    left(resolved, 40),
    coalesce(nullif(new.raw_user_meta_data ->> 'avatar_key', ''), 'bolt')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Daily totals
-- ---------------------------------------------------------------------------
-- Returns exactly one row even on a day with no meals. Aggregating over
-- logged_meals directly would return NOTHING on an empty day, and the client's
-- refreshDay() keeps the previous day's totals when no row comes back - so
-- yesterday's calories would still be on screen today. Driving the aggregate
-- from a one-row dummy relation with a LEFT JOIN makes the function total.
--
-- target_day defaults to app_day(), so `select * from daily_totals()` is today's
-- totals. A default cannot be REMOVED by create or replace, so this function is
-- dropped and recreated rather than replaced in place.
--
-- (Rewritten in 20260928000000_daily_totals_always_returns_one_row.sql; the
-- version in the initial commit had the empty-day bug described above.)

drop function if exists public.daily_totals(date);

create function public.daily_totals(target_day date default public.app_day())
returns table (
  eaten_on    date,
  calories    numeric,
  protein_g   numeric,
  carbs_g     numeric,
  fat_g       numeric,
  fiber_g     numeric,
  sugar_g     numeric,
  sodium_mg   numeric,
  meal_count  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.day,
    coalesce(sum(m.calories), 0),
    coalesce(sum(m.protein_g), 0),
    coalesce(sum(m.carbs_g), 0),
    coalesce(sum(m.fat_g), 0),
    coalesce(sum(m.fiber_g), 0),
    coalesce(sum(m.sugar_g), 0),
    coalesce(sum(m.sodium_mg), 0),
    count(m.id)
  from (select target_day as day) d
  left join public.logged_meals m
    on m.user_id = auth.uid()
   and m.eaten_on = d.day
  group by d.day;
$$;

revoke all on function public.daily_totals(date) from public;
grant execute on function public.daily_totals(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Every table in public is user-scoped; there are no shared rows.

alter table public.profiles     enable row level security;
alter table public.logged_meals enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using ((id = auth.uid()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using ((id = auth.uid()))
  with check ((id = auth.uid()));

drop policy if exists meals_select_own on public.logged_meals;
create policy meals_select_own on public.logged_meals
  for select to authenticated
  using ((user_id = auth.uid()));

drop policy if exists meals_insert_own on public.logged_meals;
create policy meals_insert_own on public.logged_meals
  for insert to authenticated
  with check ((user_id = auth.uid()));

drop policy if exists meals_update_own on public.logged_meals;
create policy meals_update_own on public.logged_meals
  for update to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

drop policy if exists meals_delete_own on public.logged_meals;
create policy meals_delete_own on public.logged_meals
  for delete to authenticated
  using ((user_id = auth.uid()));
