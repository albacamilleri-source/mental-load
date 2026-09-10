-- Additive schema for shared recipe tags and recurring day categories.
-- Uses the same personal, no-login access model as weekly_meals.
begin;
create table public.meal_recipe_tags (
  recipe_key text primary key,
  tags text[] not null default '{}',
  constraint meal_recipe_tags_key_length check (length(recipe_key) between 1 and 4096)
);
create table public.meal_day_categories (
  day_number integer primary key check (day_number between 1 and 6),
  name text not null default '',
  accepted_tags text[] not null default '{}'
);
alter table public.meal_recipe_tags enable row level security;
alter table public.meal_day_categories enable row level security;
grant select, insert, update on public.meal_recipe_tags to anon, authenticated;
grant select, insert, update on public.meal_day_categories to anon, authenticated;
create policy meal_recipe_tags_read on public.meal_recipe_tags for select to anon, authenticated using (true);
create policy meal_recipe_tags_insert on public.meal_recipe_tags for insert to anon, authenticated with check (true);
create policy meal_recipe_tags_update on public.meal_recipe_tags for update to anon, authenticated using (true) with check (true);
create policy meal_day_categories_read on public.meal_day_categories for select to anon, authenticated using (true);
create policy meal_day_categories_insert on public.meal_day_categories for insert to anon, authenticated with check (true);
create policy meal_day_categories_update on public.meal_day_categories for update to anon, authenticated using (true) with check (true);
insert into public.meal_day_categories (day_number, name, accepted_tags) values
  (1, '', '{}'), (2, '', '{}'), (3, '', '{}'),
  (4, 'Instant pot or slow cooker', array['instant pot', 'slow cooker']),
  (5, '', '{}'), (6, 'Soup Sunday', array['soup']);
commit;
