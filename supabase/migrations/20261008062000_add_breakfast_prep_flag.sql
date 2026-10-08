alter table public.breakfast_recipe_library
  add column if not exists requires_prep boolean not null default false;
