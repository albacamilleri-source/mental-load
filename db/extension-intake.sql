-- Prevent duplicate library records and active queue entries when importing from the extension.
begin;

create unique index meal_recipe_library_source_ref_unique
  on public.meal_recipe_library (source_ref);

create unique index meal_recipe_queue_source_ref_unique
  on public.meal_recipe_queue (source_ref);

commit;
