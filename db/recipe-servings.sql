-- Add an optional servings yield to every current recipe store.
-- Existing recipes remain valid with a null value until edited or re-imported.
begin;

alter table public.meal_recipe_library add column if not exists servings integer check (servings > 0);
alter table public.meal_recipe_queue add column if not exists servings integer check (servings > 0);
alter table public.weekly_meals add column if not exists servings integer check (servings > 0);
alter table public.breakfast_recipe_library add column if not exists servings integer check (servings > 0);
alter table public.breakfast_recipe_queue add column if not exists servings integer check (servings > 0);
alter table public.breakfast_weekly_meals add column if not exists servings integer check (servings > 0);

commit;
