set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.weekly_meals
  drop constraint if exists weekly_meals_override_type_check,
  add constraint weekly_meals_override_type_check
    check (
      override_type in ('manual', 'cookbook', 'printed', 'library', 'leftovers')
      or override_type like 'library:%'
    );

alter table public.breakfast_weekly_meals
  drop constraint if exists breakfast_weekly_meals_override_type_check,
  add constraint breakfast_weekly_meals_override_type_check
    check (
      override_type in ('manual', 'cookbook', 'printed', 'library', 'leftovers')
      or override_type like 'library:%'
    );

alter table public.kids_lunch_weekly_meals
  drop constraint if exists kids_lunch_weekly_meals_override_type_check,
  add constraint kids_lunch_weekly_meals_override_type_check
    check (
      override_type in ('manual', 'cookbook', 'printed', 'library', 'leftovers')
      or override_type like 'library:%'
    );
