begin;

alter table public.kids_lunch_side_options
  add column if not exists side_type text not null default 'optional';

alter table public.kids_lunch_side_options
  drop constraint if exists kids_lunch_side_options_side_type_check;

alter table public.kids_lunch_side_options
  add constraint kids_lunch_side_options_side_type_check
  check (side_type in ('fruit', 'savory', 'optional'));

-- Preserve recognisable fruit choices automatically. Other existing choices
-- are savory by default and can be reassigned in Edit sides.
update public.kids_lunch_side_options
set side_type = case
  when lower(name) ~ '(fruit|apple|banana|berr|orange|clementine|pear|grape|melon|mango|kiwi|peach|plum|pineapple)' then 'fruit'
  else 'savory'
end;

alter table public.kids_lunch_day_sides
  add column if not exists side_three_id uuid references public.kids_lunch_side_options(id) on delete set null;

-- Remove assignments that no longer belong in their typed slot. They remain
-- available as choices in the appropriate dropdown.
update public.kids_lunch_day_sides day
set side_one_id = null
where side_one_id is not null
  and not exists (
    select 1 from public.kids_lunch_side_options option
    where option.id = day.side_one_id and option.side_type = 'fruit'
  );

update public.kids_lunch_day_sides day
set side_two_id = null
where side_two_id is not null
  and not exists (
    select 1 from public.kids_lunch_side_options option
    where option.id = day.side_two_id and option.side_type = 'savory'
  );

commit;
