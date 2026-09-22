begin;

alter table public.breakfast_day_categories drop constraint if exists breakfast_day_categories_day_number_check;
alter table public.breakfast_day_categories drop constraint if exists breakfast_day_categories_sort_order_check;
alter table public.breakfast_recipe_queue drop constraint if exists breakfast_recipe_queue_day_number_check;
alter table public.breakfast_weekly_meals drop constraint if exists breakfast_weekly_meals_meal_number_check;

-- Make room for Friday Adults while keeping both shared weekend rotations.
update public.breakfast_day_categories set day_number = day_number + 100, sort_order = sort_order + 100 where day_number in (9, 10);
update public.breakfast_recipe_queue set day_number = day_number + 100 where day_number in (9, 10);
update public.breakfast_weekly_meals set meal_number = meal_number + 100 where meal_number in (9, 10);

update public.breakfast_day_categories
set day_number = case day_number when 109 then 10 when 110 then 11 end,
    sort_order = case sort_order when 109 then 10 when 110 then 11 end
where day_number in (109, 110);

update public.breakfast_recipe_queue
set day_number = case day_number when 109 then 10 when 110 then 11 end
where day_number in (109, 110);

update public.breakfast_weekly_meals
set meal_number = case meal_number when 109 then 10 when 110 then 11 end
where meal_number in (109, 110);

insert into public.breakfast_day_categories (day_number, day_name, audience, sort_order, name, accepted_tags)
values (9, 'Friday', 'adults', 9, '', '{}');

alter table public.breakfast_day_categories
  add constraint breakfast_day_categories_day_number_check check (day_number between 1 and 11),
  add constraint breakfast_day_categories_sort_order_check check (sort_order between 1 and 11);
alter table public.breakfast_recipe_queue
  add constraint breakfast_recipe_queue_day_number_check check (day_number between 1 and 11);
alter table public.breakfast_weekly_meals
  add constraint breakfast_weekly_meals_meal_number_check check (meal_number between 1 and 11);

commit;
