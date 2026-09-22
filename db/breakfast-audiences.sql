begin;

alter table public.breakfast_day_categories
  add column if not exists day_name text not null default '',
  add column if not exists audience text not null default 'shared',
  add column if not exists sort_order integer;

alter table public.breakfast_day_categories
  drop constraint if exists breakfast_day_categories_audience_check;
alter table public.breakfast_day_categories
  add constraint breakfast_day_categories_audience_check
  check (audience in ('adults', 'kids', 'shared'));

alter table public.breakfast_day_categories drop constraint if exists breakfast_day_categories_day_number_check;
alter table public.breakfast_recipe_queue drop constraint if exists breakfast_recipe_queue_day_number_check;
alter table public.breakfast_weekly_meals drop constraint if exists breakfast_weekly_meals_meal_number_check;

-- Move the six existing slots out of the target range first so primary and
-- unique keys cannot collide while the current weekday data becomes Kids.
update public.breakfast_day_categories set day_number = day_number + 100 where day_number between 1 and 6;
update public.breakfast_recipe_queue set day_number = day_number + 100 where day_number between 1 and 6;
update public.breakfast_weekly_meals set meal_number = meal_number + 100 where meal_number between 1 and 6;

update public.breakfast_day_categories
set day_number = case day_number
      when 101 then 2 when 102 then 4 when 103 then 6 when 104 then 8
      when 105 then 9 when 106 then 10 end,
    day_name = case day_number
      when 101 then 'Monday' when 102 then 'Tuesday' when 103 then 'Wednesday'
      when 104 then 'Thursday' when 105 then 'Saturday' when 106 then 'Sunday' end,
    audience = case when day_number between 101 and 104 then 'kids' else 'shared' end,
    sort_order = case day_number
      when 101 then 2 when 102 then 4 when 103 then 6 when 104 then 8
      when 105 then 9 when 106 then 10 end
where day_number between 101 and 106;

update public.breakfast_recipe_queue
set day_number = case day_number
  when 101 then 2 when 102 then 4 when 103 then 6 when 104 then 8
  when 105 then 9 when 106 then 10 end
where day_number between 101 and 106;

update public.breakfast_weekly_meals
set meal_number = case meal_number
  when 101 then 2 when 102 then 4 when 103 then 6 when 104 then 8
  when 105 then 9 when 106 then 10 end
where meal_number between 101 and 106;

insert into public.breakfast_day_categories (day_number, day_name, audience, sort_order, name, accepted_tags)
values
  (1, 'Monday', 'adults', 1, '', '{}'),
  (3, 'Tuesday', 'adults', 3, '', '{}'),
  (5, 'Wednesday', 'adults', 5, '', '{}'),
  (7, 'Thursday', 'adults', 7, '', '{}')
on conflict (day_number) do nothing;

alter table public.breakfast_day_categories
  add constraint breakfast_day_categories_day_number_check check (day_number between 1 and 10),
  add constraint breakfast_day_categories_sort_order_check check (sort_order between 1 and 10);
alter table public.breakfast_day_categories alter column sort_order set not null;
alter table public.breakfast_recipe_queue
  add constraint breakfast_recipe_queue_day_number_check check (day_number between 1 and 10);
alter table public.breakfast_weekly_meals
  add constraint breakfast_weekly_meals_meal_number_check check (meal_number between 1 and 10);

create unique index if not exists breakfast_day_categories_day_audience_idx
  on public.breakfast_day_categories (day_name, audience);

commit;
