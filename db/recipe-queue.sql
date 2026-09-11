-- Additive FIFO recipe queues and queue/override metadata for scheduled meals.
begin;

create table public.meal_recipe_queue (
  id uuid primary key default gen_random_uuid(),
  day_number integer not null check (day_number between 1 and 6),
  position bigint not null,
  title text not null,
  source_ref text not null,
  ingredients jsonb,
  extracted_at timestamp without time zone,
  rating integer check (rating between 1 and 5),
  notes text not null default '',
  created_at timestamp with time zone not null default now(),
  constraint meal_recipe_queue_title_present check (length(trim(title)) > 0),
  constraint meal_recipe_queue_source_present check (length(trim(source_ref)) > 0)
);

create index meal_recipe_queue_day_position_idx on public.meal_recipe_queue (day_number, position, created_at);

alter table public.meal_recipe_queue enable row level security;
grant select, insert, update, delete on public.meal_recipe_queue to anon, authenticated;

create policy meal_recipe_queue_read on public.meal_recipe_queue for select to anon, authenticated using (true);
create policy meal_recipe_queue_insert on public.meal_recipe_queue for insert to anon, authenticated with check (true);
create policy meal_recipe_queue_update on public.meal_recipe_queue for update to anon, authenticated using (true) with check (true);
create policy meal_recipe_queue_delete on public.meal_recipe_queue for delete to anon, authenticated using (true);

alter table public.weekly_meals
  add column queue_item_id uuid references public.meal_recipe_queue(id) on delete set null,
  add column is_override boolean not null default false,
  add column override_type text check (override_type in ('manual', 'cookbook', 'printed', 'library'));

create index weekly_meals_queue_item_idx on public.weekly_meals (queue_item_id);

commit;
