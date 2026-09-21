-- Add editable Saturday and Sunday breakfast queues.
begin;

alter table public.breakfast_day_categories drop constraint breakfast_day_categories_day_number_check;
alter table public.breakfast_day_categories add constraint breakfast_day_categories_day_number_check check (day_number between 1 and 6);
alter table public.breakfast_recipe_queue drop constraint breakfast_recipe_queue_day_number_check;
alter table public.breakfast_recipe_queue add constraint breakfast_recipe_queue_day_number_check check (day_number between 1 and 6);
alter table public.breakfast_weekly_meals drop constraint breakfast_weekly_meals_meal_number_check;
alter table public.breakfast_weekly_meals add constraint breakfast_weekly_meals_meal_number_check check (meal_number between 1 and 6);

insert into public.breakfast_day_categories (day_number, name, accepted_tags)
values (5, 'Weekend', array['weekend']), (6, 'Weekend', array['weekend'])
on conflict (day_number) do update
set name = case when public.breakfast_day_categories.name = '' then excluded.name else public.breakfast_day_categories.name end,
    accepted_tags = case when cardinality(public.breakfast_day_categories.accepted_tags) = 0 then excluded.accepted_tags else public.breakfast_day_categories.accepted_tags end;

commit;
