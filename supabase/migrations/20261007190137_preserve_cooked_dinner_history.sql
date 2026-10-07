begin;

alter table public.weekly_meals
  add column if not exists completed_at timestamp with time zone;

create index if not exists weekly_meals_completed_at_idx
  on public.weekly_meals (completed_at)
  where completed_at is not null;

commit;
