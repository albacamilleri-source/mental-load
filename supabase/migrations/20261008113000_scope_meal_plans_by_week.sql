-- Breakfasts and kids lunches were originally stored as one perpetual
-- "capsule" row per slot. Convert those rows to real ISO weeks so navigating
-- the planner cannot relabel and overwrite the same record.
alter table public.breakfast_weekly_meals
  add column if not exists completed_at timestamptz;

alter table public.kids_lunch_weekly_meals
  add column if not exists completed_at timestamptz;

update public.breakfast_weekly_meals
set week_of = to_char(scheduled_for, 'IYYY-"W"IW')
where scheduled_for is not null
  and week_of = 'breakfast-capsule';

update public.kids_lunch_weekly_meals
set week_of = to_char(scheduled_for, 'IYYY-"W"IW')
where scheduled_for is not null
  and week_of = 'kids-lunch-capsule';

-- A pause is a decision for one calendar week, while category rules remain
-- reusable planner settings.
create table if not exists public.meal_day_pauses (
  week_of text not null,
  day_number integer not null check (day_number between 1 and 7),
  is_paused boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (week_of, day_number)
);

create table if not exists public.breakfast_day_pauses (
  week_of text not null,
  day_number integer not null check (day_number between 1 and 11),
  is_paused boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (week_of, day_number)
);

create table if not exists public.kids_lunch_day_pauses (
  week_of text not null,
  day_number integer not null check (day_number between 1 and 7),
  is_paused boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (week_of, day_number)
);

insert into public.meal_day_pauses (week_of, day_number, is_paused)
select to_char(current_date, 'IYYY-"W"IW'), day_number, true
from public.meal_day_categories
where coalesce(is_paused, false)
on conflict (week_of, day_number) do update set is_paused = excluded.is_paused;

insert into public.breakfast_day_pauses (week_of, day_number, is_paused)
select to_char(current_date, 'IYYY-"W"IW'), day_number, true
from public.breakfast_day_categories
where coalesce(is_paused, false)
on conflict (week_of, day_number) do update set is_paused = excluded.is_paused;

insert into public.kids_lunch_day_pauses (week_of, day_number, is_paused)
select to_char(current_date, 'IYYY-"W"IW'), day_number, true
from public.kids_lunch_day_categories
where coalesce(is_paused, false)
on conflict (week_of, day_number) do update set is_paused = excluded.is_paused;

update public.meal_day_categories set is_paused = false where coalesce(is_paused, false);
update public.breakfast_day_categories set is_paused = false where coalesce(is_paused, false);
update public.kids_lunch_day_categories set is_paused = false where coalesce(is_paused, false);

alter table public.meal_day_pauses enable row level security;
alter table public.breakfast_day_pauses enable row level security;
alter table public.kids_lunch_day_pauses enable row level security;

create policy "Allow all access" on public.meal_day_pauses for all using (true) with check (true);
create policy "Allow all access" on public.breakfast_day_pauses for all using (true) with check (true);
create policy "Allow all access" on public.kids_lunch_day_pauses for all using (true) with check (true);

grant select, insert, update, delete on public.meal_day_pauses to anon, authenticated;
grant select, insert, update, delete on public.breakfast_day_pauses to anon, authenticated;
grant select, insert, update, delete on public.kids_lunch_day_pauses to anon, authenticated;

-- Kids-lunch sides belong to the selected week too.
alter table public.kids_lunch_day_sides
  add column if not exists week_of text;

update public.kids_lunch_day_sides sides
set week_of = coalesce(
  (select to_char(meal.scheduled_for, 'IYYY-"W"IW')
   from public.kids_lunch_weekly_meals meal
   where meal.meal_number = sides.day_number
   order by meal.scheduled_for desc nulls last
   limit 1),
  to_char(current_date, 'IYYY-"W"IW')
)
where week_of is null;

alter table public.kids_lunch_day_sides
  alter column week_of set not null,
  drop constraint if exists kids_lunch_day_sides_pkey,
  add constraint kids_lunch_day_sides_pkey primary key (week_of, day_number);
