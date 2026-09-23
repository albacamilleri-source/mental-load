-- A separate seven-day lunch capsule planner. Weekdays have Adults and Kids
-- rotations; Saturday and Sunday each have one shared rotation.
begin;

create table public.lunch_day_categories (
  day_number integer primary key check (day_number between 1 and 12),
  name text not null default '',
  accepted_tags text[] not null default '{}',
  day_name text not null default '',
  audience text not null default 'shared' check (audience in ('adults', 'kids', 'shared')),
  sort_order integer not null check (sort_order between 1 and 12)
);

insert into public.lunch_day_categories (day_number, day_name, audience, sort_order)
values
  (1, 'Monday', 'adults', 1),
  (2, 'Monday', 'kids', 2),
  (3, 'Tuesday', 'adults', 3),
  (4, 'Tuesday', 'kids', 4),
  (5, 'Wednesday', 'adults', 5),
  (6, 'Wednesday', 'kids', 6),
  (7, 'Thursday', 'adults', 7),
  (8, 'Thursday', 'kids', 8),
  (9, 'Friday', 'adults', 9),
  (10, 'Friday', 'kids', 10),
  (11, 'Saturday', 'shared', 11),
  (12, 'Sunday', 'shared', 12);

create unique index lunch_day_categories_day_audience_idx
  on public.lunch_day_categories (day_name, audience);

create table public.lunch_recipe_tags (
  recipe_key text primary key check (length(recipe_key) between 1 and 4096),
  tags text[] not null default '{}'
);

create table public.lunch_recipe_library (
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
create index lunch_recipe_library_title_lower_idx on public.lunch_recipe_library (lower(title));

create table public.lunch_recipe_queue (
  id uuid primary key default gen_random_uuid(),
  day_number integer not null check (day_number between 1 and 12),
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
create index lunch_recipe_queue_day_position_idx on public.lunch_recipe_queue (day_number, position, created_at);

create table public.lunch_weekly_meals (
  id uuid primary key default gen_random_uuid(),
  week_of text not null,
  meal_number integer not null check (meal_number between 1 and 12),
  title text not null,
  source_ref text not null,
  ingredients jsonb,
  extracted_at timestamp without time zone,
  rating integer check (rating between 1 and 5),
  notes text,
  created_at timestamp without time zone default now(),
  queue_item_id uuid references public.lunch_recipe_queue(id) on delete set null,
  is_override boolean not null default false,
  override_type text check (override_type in ('manual', 'cookbook', 'printed', 'library')),
  method text not null default '',
  servings integer check (servings > 0),
  unique (week_of, meal_number)
);
create index lunch_weekly_meals_queue_item_idx on public.lunch_weekly_meals (queue_item_id);

alter table public.lunch_day_categories enable row level security;
alter table public.lunch_recipe_tags enable row level security;
alter table public.lunch_recipe_library enable row level security;
alter table public.lunch_recipe_queue enable row level security;
alter table public.lunch_weekly_meals enable row level security;

grant select, insert, update on public.lunch_day_categories, public.lunch_recipe_tags, public.lunch_recipe_library to anon, authenticated;
grant select, insert, update, delete on public.lunch_recipe_queue, public.lunch_weekly_meals to anon, authenticated;

create policy lunch_day_categories_read on public.lunch_day_categories for select to anon, authenticated using (true);
create policy lunch_day_categories_insert on public.lunch_day_categories for insert to anon, authenticated with check (true);
create policy lunch_day_categories_update on public.lunch_day_categories for update to anon, authenticated using (true) with check (true);
create policy lunch_recipe_tags_read on public.lunch_recipe_tags for select to anon, authenticated using (true);
create policy lunch_recipe_tags_insert on public.lunch_recipe_tags for insert to anon, authenticated with check (true);
create policy lunch_recipe_tags_update on public.lunch_recipe_tags for update to anon, authenticated using (true) with check (true);
create policy lunch_recipe_library_read on public.lunch_recipe_library for select to anon, authenticated using (true);
create policy lunch_recipe_library_insert on public.lunch_recipe_library for insert to anon, authenticated with check (true);
create policy lunch_recipe_library_update on public.lunch_recipe_library for update to anon, authenticated using (true) with check (true);
create policy lunch_recipe_queue_read on public.lunch_recipe_queue for select to anon, authenticated using (true);
create policy lunch_recipe_queue_insert on public.lunch_recipe_queue for insert to anon, authenticated with check (true);
create policy lunch_recipe_queue_update on public.lunch_recipe_queue for update to anon, authenticated using (true) with check (true);
create policy lunch_recipe_queue_delete on public.lunch_recipe_queue for delete to anon, authenticated using (true);
create policy lunch_weekly_meals_read on public.lunch_weekly_meals for select to anon, authenticated using (true);
create policy lunch_weekly_meals_insert on public.lunch_weekly_meals for insert to anon, authenticated with check (true);
create policy lunch_weekly_meals_update on public.lunch_weekly_meals for update to anon, authenticated using (true) with check (true);
create policy lunch_weekly_meals_delete on public.lunch_weekly_meals for delete to anon, authenticated using (true);

commit;
