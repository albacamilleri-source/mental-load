-- Additive recipe bank used when a scheduled meal is marked as cooked.
-- Uses the same personal, no-login access model as the other meal planner tables.
begin;

create table public.meal_recipe_library (
  recipe_key text primary key,
  title text not null,
  source_ref text not null,
  ingredients jsonb,
  extracted_at timestamp without time zone,
  rating integer check (rating between 1 and 5),
  notes text not null default '',
  cooked_at timestamp with time zone not null default now(),
  constraint meal_recipe_library_key_length check (length(recipe_key) between 1 and 4096),
  constraint meal_recipe_library_title_present check (length(trim(title)) > 0),
  constraint meal_recipe_library_source_present check (length(trim(source_ref)) > 0)
);

create index meal_recipe_library_title_lower_idx on public.meal_recipe_library (lower(title));

alter table public.meal_recipe_library enable row level security;
grant select, insert, update on public.meal_recipe_library to anon, authenticated;

create policy meal_recipe_library_read on public.meal_recipe_library
  for select to anon, authenticated using (true);
create policy meal_recipe_library_insert on public.meal_recipe_library
  for insert to anon, authenticated with check (true);
create policy meal_recipe_library_update on public.meal_recipe_library
  for update to anon, authenticated using (true) with check (true);

commit;
