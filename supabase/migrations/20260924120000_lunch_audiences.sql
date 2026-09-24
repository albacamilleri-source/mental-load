begin;

-- The original combined Lunch planner has no saved data. Reuse it for the
-- Adult planner and reduce its twelve audience slots to seven calendar days.
alter table public.lunch_day_categories drop constraint if exists lunch_day_categories_day_number_check;
alter table public.lunch_day_categories drop constraint if exists lunch_day_categories_sort_order_check;
alter table public.lunch_recipe_queue drop constraint if exists lunch_recipe_queue_day_number_check;
alter table public.lunch_weekly_meals drop constraint if exists lunch_weekly_meals_meal_number_check;

delete from public.lunch_weekly_meals;
delete from public.lunch_recipe_queue;
delete from public.lunch_day_categories;

insert into public.lunch_day_categories (day_number, day_name, audience, sort_order, name, accepted_tags)
values
  (1, 'Monday', 'adults', 1, '', '{}'),
  (2, 'Tuesday', 'adults', 2, '', '{}'),
  (3, 'Wednesday', 'adults', 3, '', '{}'),
  (4, 'Thursday', 'adults', 4, '', '{}'),
  (5, 'Friday', 'adults', 5, '', '{}'),
  (6, 'Saturday', 'adults', 6, '', '{}'),
  (7, 'Sunday', 'adults', 7, '', '{}');

alter table public.lunch_day_categories
  add constraint lunch_day_categories_day_number_check check (day_number between 1 and 7),
  add constraint lunch_day_categories_sort_order_check check (sort_order between 1 and 7);
alter table public.lunch_recipe_queue
  add constraint lunch_recipe_queue_day_number_check check (day_number between 1 and 7);
alter table public.lunch_weekly_meals
  add constraint lunch_weekly_meals_meal_number_check check (meal_number between 1 and 7);

create table public.kids_lunch_day_categories (
  day_number integer primary key check (day_number between 1 and 7),
  name text not null default '',
  accepted_tags text[] not null default '{}',
  day_name text not null,
  audience text not null default 'kids' check (audience = 'kids'),
  sort_order integer not null check (sort_order between 1 and 7)
);

insert into public.kids_lunch_day_categories (day_number, day_name, audience, sort_order)
values
  (1, 'Monday', 'kids', 1),
  (2, 'Tuesday', 'kids', 2),
  (3, 'Wednesday', 'kids', 3),
  (4, 'Thursday', 'kids', 4),
  (5, 'Friday', 'kids', 5),
  (6, 'Saturday', 'kids', 6),
  (7, 'Sunday', 'kids', 7);

create table public.kids_lunch_recipe_tags (
  recipe_key text primary key check (length(recipe_key) between 1 and 4096),
  tags text[] not null default '{}'
);

create table public.kids_lunch_recipe_library (
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
create index kids_lunch_recipe_library_title_lower_idx on public.kids_lunch_recipe_library (lower(title));

create table public.kids_lunch_recipe_queue (
  id uuid primary key default gen_random_uuid(),
  day_number integer not null check (day_number between 1 and 7),
  position bigint not null,
  title text not null check (length(trim(title)) > 0),
  source_ref text not null unique check (length(trim(source_ref)) > 0),
  ingredients jsonb,
  extracted_at timestamp without time zone,
  rating integer check (rating between 1 and 5),
  notes text not null default '',
  created_at timestamp with time zone not null default now(),
  method text not null default '',
  servings integer check (servings > 0)
);
create index kids_lunch_recipe_queue_day_position_idx on public.kids_lunch_recipe_queue (day_number, position, created_at);

create table public.kids_lunch_weekly_meals (
  id uuid primary key default gen_random_uuid(),
  week_of text not null,
  meal_number integer not null check (meal_number between 1 and 7),
  title text not null,
  source_ref text not null,
  ingredients jsonb,
  extracted_at timestamp without time zone,
  rating integer check (rating between 1 and 5),
  notes text,
  created_at timestamp without time zone default now(),
  queue_item_id uuid references public.kids_lunch_recipe_queue(id) on delete set null,
  is_override boolean not null default false,
  override_type text check (override_type in ('manual', 'cookbook', 'printed', 'library')),
  method text not null default '',
  servings integer check (servings > 0),
  unique (week_of, meal_number)
);
create index kids_lunch_weekly_meals_queue_item_idx on public.kids_lunch_weekly_meals (queue_item_id);

create table public.kids_lunch_side_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  sort_order integer not null check (sort_order > 0)
);

create table public.kids_lunch_day_sides (
  day_number integer primary key check (day_number between 1 and 7),
  side_one_id uuid references public.kids_lunch_side_options(id) on delete set null,
  side_two_id uuid references public.kids_lunch_side_options(id) on delete set null
);
insert into public.kids_lunch_day_sides (day_number)
values (1), (2), (3), (4), (5), (6), (7);

alter table public.kids_lunch_day_categories enable row level security;
alter table public.kids_lunch_recipe_tags enable row level security;
alter table public.kids_lunch_recipe_library enable row level security;
alter table public.kids_lunch_recipe_queue enable row level security;
alter table public.kids_lunch_weekly_meals enable row level security;
alter table public.kids_lunch_side_options enable row level security;
alter table public.kids_lunch_day_sides enable row level security;

grant select, insert, update on public.kids_lunch_day_categories, public.kids_lunch_recipe_tags, public.kids_lunch_recipe_library, public.kids_lunch_day_sides to anon, authenticated;
grant select, insert, update, delete on public.kids_lunch_recipe_queue, public.kids_lunch_weekly_meals, public.kids_lunch_side_options to anon, authenticated;

create policy kids_lunch_day_categories_read on public.kids_lunch_day_categories for select to anon, authenticated using (true);
create policy kids_lunch_day_categories_insert on public.kids_lunch_day_categories for insert to anon, authenticated with check (true);
create policy kids_lunch_day_categories_update on public.kids_lunch_day_categories for update to anon, authenticated using (true) with check (true);
create policy kids_lunch_recipe_tags_read on public.kids_lunch_recipe_tags for select to anon, authenticated using (true);
create policy kids_lunch_recipe_tags_insert on public.kids_lunch_recipe_tags for insert to anon, authenticated with check (true);
create policy kids_lunch_recipe_tags_update on public.kids_lunch_recipe_tags for update to anon, authenticated using (true) with check (true);
create policy kids_lunch_recipe_library_read on public.kids_lunch_recipe_library for select to anon, authenticated using (true);
create policy kids_lunch_recipe_library_insert on public.kids_lunch_recipe_library for insert to anon, authenticated with check (true);
create policy kids_lunch_recipe_library_update on public.kids_lunch_recipe_library for update to anon, authenticated using (true) with check (true);
create policy kids_lunch_recipe_queue_read on public.kids_lunch_recipe_queue for select to anon, authenticated using (true);
create policy kids_lunch_recipe_queue_insert on public.kids_lunch_recipe_queue for insert to anon, authenticated with check (true);
create policy kids_lunch_recipe_queue_update on public.kids_lunch_recipe_queue for update to anon, authenticated using (true) with check (true);
create policy kids_lunch_recipe_queue_delete on public.kids_lunch_recipe_queue for delete to anon, authenticated using (true);
create policy kids_lunch_weekly_meals_read on public.kids_lunch_weekly_meals for select to anon, authenticated using (true);
create policy kids_lunch_weekly_meals_insert on public.kids_lunch_weekly_meals for insert to anon, authenticated with check (true);
create policy kids_lunch_weekly_meals_update on public.kids_lunch_weekly_meals for update to anon, authenticated using (true) with check (true);
create policy kids_lunch_weekly_meals_delete on public.kids_lunch_weekly_meals for delete to anon, authenticated using (true);
create policy kids_lunch_side_options_read on public.kids_lunch_side_options for select to anon, authenticated using (true);
create policy kids_lunch_side_options_insert on public.kids_lunch_side_options for insert to anon, authenticated with check (true);
create policy kids_lunch_side_options_update on public.kids_lunch_side_options for update to anon, authenticated using (true) with check (true);
create policy kids_lunch_side_options_delete on public.kids_lunch_side_options for delete to anon, authenticated using (true);
create policy kids_lunch_day_sides_read on public.kids_lunch_day_sides for select to anon, authenticated using (true);
create policy kids_lunch_day_sides_insert on public.kids_lunch_day_sides for insert to anon, authenticated with check (true);
create policy kids_lunch_day_sides_update on public.kids_lunch_day_sides for update to anon, authenticated using (true) with check (true);

commit;
