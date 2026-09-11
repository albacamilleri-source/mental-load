-- Store cooking methods with library, queued, and scheduled recipes.
begin;

alter table public.meal_recipe_library add column if not exists method text not null default '';
alter table public.meal_recipe_queue add column if not exists method text not null default '';
alter table public.weekly_meals add column if not exists method text not null default '';

commit;
