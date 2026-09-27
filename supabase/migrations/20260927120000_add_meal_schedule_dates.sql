begin;

alter table public.breakfast_weekly_meals
  add column if not exists scheduled_for date;

alter table public.kids_lunch_weekly_meals
  add column if not exists scheduled_for date;

-- Existing capsule meals represent the next time that weekday comes around.
-- Using a strict future occurrence prevents a recipe prepared for next Sunday
-- from appearing as today's meal when the migration runs on a Sunday.
update public.breakfast_weekly_meals
set scheduled_for = current_date + (
  (
    case meal_number
      when 1 then 1 when 2 then 1
      when 3 then 2 when 4 then 2
      when 5 then 3 when 6 then 3
      when 7 then 4 when 8 then 4
      when 9 then 5 when 10 then 6 when 11 then 7
    end
    - extract(isodow from current_date)::integer + 6
  ) % 7 + 1
)
where scheduled_for is null
  and (length(trim(title)) > 0 or length(trim(source_ref)) > 0);

update public.kids_lunch_weekly_meals
set scheduled_for = current_date + (
  (meal_number - extract(isodow from current_date)::integer + 6) % 7 + 1
)
where scheduled_for is null
  and (length(trim(title)) > 0 or length(trim(source_ref)) > 0);

create index if not exists breakfast_weekly_meals_scheduled_for_idx
  on public.breakfast_weekly_meals (scheduled_for);
create index if not exists kids_lunch_weekly_meals_scheduled_for_idx
  on public.kids_lunch_weekly_meals (scheduled_for);

commit;
