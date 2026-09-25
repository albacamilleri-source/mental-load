begin;

alter table public.breakfast_day_categories add column if not exists is_paused boolean not null default false;
alter table public.lunch_day_categories add column if not exists is_paused boolean not null default false;
alter table public.kids_lunch_day_categories add column if not exists is_paused boolean not null default false;

commit;
