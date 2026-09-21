-- Breakfasts has four editable category queues and one unscheduled cereal day.
-- The persistent breakfast-capsule key keeps the current lineup across weeks.
begin;

do $$
begin
  if exists (select 1 from public.breakfast_recipe_queue where day_number > 4)
    or exists (select 1 from public.breakfast_weekly_meals where meal_number > 4) then
    raise exception 'Move breakfast recipes from days 5 and 6 before applying this migration';
  end if;
end $$;

delete from public.breakfast_day_categories where day_number > 4;

alter table public.breakfast_day_categories drop constraint breakfast_day_categories_day_number_check;
alter table public.breakfast_day_categories add constraint breakfast_day_categories_day_number_check check (day_number between 1 and 4);
alter table public.breakfast_recipe_queue drop constraint breakfast_recipe_queue_day_number_check;
alter table public.breakfast_recipe_queue add constraint breakfast_recipe_queue_day_number_check check (day_number between 1 and 4);
alter table public.breakfast_weekly_meals drop constraint breakfast_weekly_meals_meal_number_check;
alter table public.breakfast_weekly_meals add constraint breakfast_weekly_meals_meal_number_check check (meal_number between 1 and 4);

update public.breakfast_day_categories
set name = case day_number when 1 then 'Pancakes' when 2 then 'Waffles' when 3 then 'Oats' when 4 then 'Savory' end,
    accepted_tags = case day_number when 1 then array['pancake'] when 2 then array['waffle'] when 3 then array['oats'] when 4 then array['savory'] end
where day_number between 1 and 4 and name = '' and cardinality(accepted_tags) = 0;

commit;
