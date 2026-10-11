create table if not exists public.weekly_defrost_completions (
  meal_type text not null check (meal_type in ('breakfast', 'kids_lunch', 'dinner')),
  week_of text not null,
  meal_number integer not null check (meal_number between 1 and 11),
  scheduled_for date not null,
  recipe_key text not null,
  completed_at timestamptz not null default timezone('UTC', now()),
  primary key (meal_type, week_of, meal_number, recipe_key)
);

create index if not exists weekly_defrost_completions_date_idx
  on public.weekly_defrost_completions (scheduled_for);

alter table public.weekly_defrost_completions enable row level security;
revoke all on table public.weekly_defrost_completions from anon, authenticated;
grant select, insert, update, delete on table public.weekly_defrost_completions to anon, authenticated;

drop policy if exists weekly_defrost_completions_all on public.weekly_defrost_completions;
create policy weekly_defrost_completions_all
  on public.weekly_defrost_completions
  for all
  to anon, authenticated
  using (true)
  with check (true);
