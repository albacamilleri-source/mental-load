-- A separate breakfast planner with the same six-day workflow as dinners.
-- Existing dinner tables and records are unchanged.
begin;

create table public.breakfast_day_categories (
  day_number integer primary key check (day_number between 1 and 6),
  name text not null default '',
  accepted_tags text[] not null default '{}'
);
insert into public.breakfast_day_categories (day_number)
select generate_series(1, 6);

create table public.breakfast_recipe_tags (
  recipe_key text primary key check (length(recipe_key) between 1 and 4096),
  tags text[] not null default '{}'
);

create table public.breakfast_recipe_library (
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
  method text not null default ''
);
create index breakfast_recipe_library_title_lower_idx on public.breakfast_recipe_library (lower(title));

create table public.breakfast_recipe_queue (
  id uuid primary key default gen_random_uuid(),
  day_number integer not null check (day_number between 1 and 6),
  position bigint not null,
  title text not null check (length(trim(title)) > 0),
  source_ref text not null unique check (length(trim(source_ref)) > 0),
  ingredients jsonb,
  extracted_at timestamp without time zone,
  rating integer check (rating between 1 and 5),
  notes text not null default '',
  created_at timestamp with time zone not null default now(),
  method text not null default ''
);
create index breakfast_recipe_queue_day_position_idx on public.breakfast_recipe_queue (day_number, position, created_at);

create table public.breakfast_weekly_meals (
  id uuid primary key default gen_random_uuid(),
  week_of text not null,
  meal_number integer not null check (meal_number between 1 and 6),
  title text not null,
  source_ref text not null,
  ingredients jsonb,
  extracted_at timestamp without time zone,
  rating integer check (rating between 1 and 5),
  notes text,
  created_at timestamp without time zone default now(),
  queue_item_id uuid references public.breakfast_recipe_queue(id) on delete set null,
  is_override boolean not null default false,
  override_type text check (override_type in ('manual', 'cookbook', 'printed', 'library')),
  method text not null default '',
  unique (week_of, meal_number)
);
create index breakfast_weekly_meals_queue_item_idx on public.breakfast_weekly_meals (queue_item_id);

alter table public.breakfast_day_categories enable row level security;
alter table public.breakfast_recipe_tags enable row level security;
alter table public.breakfast_recipe_library enable row level security;
alter table public.breakfast_recipe_queue enable row level security;
alter table public.breakfast_weekly_meals enable row level security;

grant select, insert, update on public.breakfast_day_categories, public.breakfast_recipe_tags, public.breakfast_recipe_library to anon, authenticated;
grant select, insert, update, delete on public.breakfast_recipe_queue, public.breakfast_weekly_meals to anon, authenticated;

create policy breakfast_day_categories_read on public.breakfast_day_categories for select to anon, authenticated using (true);
create policy breakfast_day_categories_insert on public.breakfast_day_categories for insert to anon, authenticated with check (true);
create policy breakfast_day_categories_update on public.breakfast_day_categories for update to anon, authenticated using (true) with check (true);
create policy breakfast_recipe_tags_read on public.breakfast_recipe_tags for select to anon, authenticated using (true);
create policy breakfast_recipe_tags_insert on public.breakfast_recipe_tags for insert to anon, authenticated with check (true);
create policy breakfast_recipe_tags_update on public.breakfast_recipe_tags for update to anon, authenticated using (true) with check (true);
create policy breakfast_recipe_library_read on public.breakfast_recipe_library for select to anon, authenticated using (true);
create policy breakfast_recipe_library_insert on public.breakfast_recipe_library for insert to anon, authenticated with check (true);
create policy breakfast_recipe_library_update on public.breakfast_recipe_library for update to anon, authenticated using (true) with check (true);
create policy breakfast_recipe_queue_read on public.breakfast_recipe_queue for select to anon, authenticated using (true);
create policy breakfast_recipe_queue_insert on public.breakfast_recipe_queue for insert to anon, authenticated with check (true);
create policy breakfast_recipe_queue_update on public.breakfast_recipe_queue for update to anon, authenticated using (true) with check (true);
create policy breakfast_recipe_queue_delete on public.breakfast_recipe_queue for delete to anon, authenticated using (true);
create policy breakfast_weekly_meals_read on public.breakfast_weekly_meals for select to anon, authenticated using (true);
create policy breakfast_weekly_meals_insert on public.breakfast_weekly_meals for insert to anon, authenticated with check (true);
create policy breakfast_weekly_meals_update on public.breakfast_weekly_meals for update to anon, authenticated using (true) with check (true);
create policy breakfast_weekly_meals_delete on public.breakfast_weekly_meals for delete to anon, authenticated using (true);

commit;
