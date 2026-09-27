begin;

alter table public.meal_day_categories add column if not exists is_paused boolean not null default false;

alter table public.meal_day_categories drop constraint if exists meal_day_categories_day_number_check;
alter table public.meal_day_categories add constraint meal_day_categories_day_number_check check (day_number between 1 and 7);
insert into public.meal_day_categories (day_number, name, accepted_tags, is_paused)
values (7, '', '{}', false)
on conflict (day_number) do nothing;

alter table public.weekly_meals drop constraint if exists weekly_meals_meal_number_check;
alter table public.weekly_meals add constraint weekly_meals_meal_number_check check (meal_number between 1 and 7);
alter table public.meal_recipe_queue drop constraint if exists meal_recipe_queue_day_number_check;
alter table public.meal_recipe_queue add constraint meal_recipe_queue_day_number_check check (day_number between 1 and 7);

create table if not exists public.lunch_prep_selections (
  recipe_key text primary key check (length(recipe_key) between 1 and 4096),
  selected_at timestamp with time zone not null default now()
);

create table if not exists public.side_dish_recipe_tags (
  recipe_key text primary key check (length(recipe_key) between 1 and 4096),
  tags text[] not null default '{}'
);
create table if not exists public.side_dish_recipe_library (
  recipe_key text primary key check (length(recipe_key) between 1 and 4096),
  title text not null check (length(trim(title)) > 0),
  source_ref text not null unique check (length(trim(source_ref)) > 0),
  ingredients jsonb,
  extracted_at timestamp without time zone,
  rating integer check (rating between 1 and 5),
  notes text not null default '',
  cooked_at timestamp with time zone not null default now(),
  has_been_cooked boolean not null default false,
  is_deleted boolean not null default false,
  method text not null default '',
  servings integer check (servings > 0)
);
create index if not exists side_dish_recipe_library_title_lower_idx on public.side_dish_recipe_library (lower(title));
create table if not exists public.side_dish_prep_selections (
  recipe_key text primary key check (length(recipe_key) between 1 and 4096),
  selected_at timestamp with time zone not null default now()
);

create table if not exists public.treat_recipe_tags (
  recipe_key text primary key check (length(recipe_key) between 1 and 4096),
  tags text[] not null default '{}'
);
create table if not exists public.treat_recipe_library (
  recipe_key text primary key check (length(recipe_key) between 1 and 4096),
  title text not null check (length(trim(title)) > 0),
  source_ref text not null unique check (length(trim(source_ref)) > 0),
  ingredients jsonb,
  extracted_at timestamp without time zone,
  rating integer check (rating between 1 and 5),
  notes text not null default '',
  cooked_at timestamp with time zone not null default now(),
  has_been_cooked boolean not null default false,
  is_deleted boolean not null default false,
  method text not null default '',
  servings integer check (servings > 0)
);
create index if not exists treat_recipe_library_title_lower_idx on public.treat_recipe_library (lower(title));
create table if not exists public.treat_prep_selections (
  recipe_key text primary key check (length(recipe_key) between 1 and 4096),
  selected_at timestamp with time zone not null default now()
);

alter table public.lunch_prep_selections enable row level security;
alter table public.side_dish_recipe_tags enable row level security;
alter table public.side_dish_recipe_library enable row level security;
alter table public.side_dish_prep_selections enable row level security;
alter table public.treat_recipe_tags enable row level security;
alter table public.treat_recipe_library enable row level security;
alter table public.treat_prep_selections enable row level security;

grant select, insert, update, delete on public.lunch_prep_selections,
  public.side_dish_recipe_tags, public.side_dish_recipe_library, public.side_dish_prep_selections,
  public.treat_recipe_tags, public.treat_recipe_library, public.treat_prep_selections
to anon, authenticated;

create policy lunch_prep_selections_all on public.lunch_prep_selections for all to anon, authenticated using (true) with check (true);
create policy side_dish_recipe_tags_all on public.side_dish_recipe_tags for all to anon, authenticated using (true) with check (true);
create policy side_dish_recipe_library_all on public.side_dish_recipe_library for all to anon, authenticated using (true) with check (true);
create policy side_dish_prep_selections_all on public.side_dish_prep_selections for all to anon, authenticated using (true) with check (true);
create policy treat_recipe_tags_all on public.treat_recipe_tags for all to anon, authenticated using (true) with check (true);
create policy treat_recipe_library_all on public.treat_recipe_library for all to anon, authenticated using (true) with check (true);
create policy treat_prep_selections_all on public.treat_prep_selections for all to anon, authenticated using (true) with check (true);

commit;
