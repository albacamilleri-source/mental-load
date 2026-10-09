-- A recipe can permanently require advance prep. Completing that prep is a
-- separate, week-specific action recorded in weekly_prep_completions.
alter table public.meal_recipe_library add column if not exists requires_prep boolean not null default false;
alter table public.breakfast_recipe_library add column if not exists requires_prep boolean not null default false;
alter table public.lunch_recipe_library add column if not exists requires_prep boolean not null default false;
alter table public.kids_lunch_recipe_library add column if not exists requires_prep boolean not null default false;
alter table public.side_dish_recipe_library add column if not exists requires_prep boolean not null default false;
alter table public.treat_recipe_library add column if not exists requires_prep boolean not null default false;

create table if not exists public.weekly_prep_completions (
  meal_type text not null check (meal_type in ('breakfast', 'kids_lunch', 'dinner')),
  week_of text not null,
  meal_number integer not null check (meal_number between 1 and 11),
  scheduled_for date not null,
  recipe_key text not null,
  completed_at timestamptz not null default timezone('UTC', now()),
  primary key (meal_type, week_of, meal_number, recipe_key)
);

create index if not exists weekly_prep_completions_week_idx
  on public.weekly_prep_completions (week_of, scheduled_for);

alter table public.weekly_prep_completions enable row level security;
grant select, insert, update, delete on public.weekly_prep_completions to anon, authenticated;

drop policy if exists weekly_prep_completions_all on public.weekly_prep_completions;
create policy weekly_prep_completions_all
  on public.weekly_prep_completions
  for all
  to anon, authenticated
  using (true)
  with check (true);

create or replace function public.recipe_plugin_context(p_library text)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  r record;
  v_tags text[] := '{}';
  v_category_tags text[] := '{}';
  v_categories_table text;
begin
  select key, display_name, library_table, tags_table, audience
  into r
  from public.recipe_library_registry
  where key = p_library and is_active = true;

  if not found then raise exception 'Unknown recipe library: %', p_library; end if;
  if r.tags_table is not null then
    if r.tags_table !~ '^[a-z0-9_]+$' then raise exception 'Invalid tags table'; end if;
    execute format('select coalesce(array_agg(distinct t order by t), ''{}''::text[]) from %I, unnest(tags) t', r.tags_table) into v_tags;
  end if;

  v_categories_table := case p_library
    when 'dinner' then 'meal_day_categories'
    when 'breakfast' then 'breakfast_day_categories'
    when 'adult_lunch' then 'lunch_day_categories'
    when 'kids_lunch' then 'kids_lunch_day_categories'
    else null
  end;
  if v_categories_table is not null then
    execute format('select coalesce(array_agg(distinct t order by t), ''{}''::text[]) from %I, unnest(accepted_tags) t', v_categories_table) into v_category_tags;
  end if;

  return jsonb_build_object(
    'key', r.key,
    'display_name', r.display_name,
    'audience', r.audience,
    'existing_tags', to_jsonb(v_tags),
    'accepted_category_tags', to_jsonb(v_category_tags),
    'supports_requires_prep', true
  );
end;
$function$;

create or replace function public.recipe_prep_status(
  p_library text,
  p_title text default null,
  p_source_ref text default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  r record;
  v_recipe record;
begin
  select key, display_name, library_table into r
  from public.recipe_library_registry
  where key = p_library and is_active = true;
  if not found then return jsonb_build_object('status','error','error','Unknown recipe library.'); end if;
  if r.library_table !~ '^[a-z0-9_]+$' then return jsonb_build_object('status','error','error','Invalid recipe library configuration.'); end if;
  if nullif(btrim(p_title), '') is null and nullif(btrim(p_source_ref), '') is null then
    return jsonb_build_object('status','error','error','Supply a recipe title or source.');
  end if;

  execute format(
    'select recipe_key, title, source_ref, requires_prep from %I
      where is_deleted = false
        and (($1 is not null and lower(title) = lower($1))
          or ($2 is not null and lower(source_ref) = lower($2)))
      order by case when $2 is not null and lower(source_ref) = lower($2) then 0 else 1 end
      limit 1', r.library_table
  ) into v_recipe using nullif(btrim(p_title), ''), nullif(btrim(p_source_ref), '');

  if v_recipe.recipe_key is null then
    return jsonb_build_object('status','not_found','library',p_library);
  end if;
  return jsonb_build_object(
    'status','found', 'library',p_library, 'library_name',r.display_name,
    'recipe_key',v_recipe.recipe_key, 'title',v_recipe.title,
    'source_ref',v_recipe.source_ref, 'requires_prep',v_recipe.requires_prep
  );
end;
$function$;

grant execute on function public.recipe_prep_status(text, text, text) to anon, authenticated;

create or replace function public.save_recipe_from_plugin(p_library text, p_recipe jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  r record;
  v_title text := nullif(btrim(p_recipe->>'title'), '');
  v_source text := nullif(btrim(p_recipe->>'source_ref'), '');
  v_method text := nullif(btrim(p_recipe->>'method'), '');
  v_yield text := nullif(btrim(p_recipe->>'yield_text'), '');
  v_servings integer;
  v_requires_prep boolean := false;
  v_ingredients jsonb := p_recipe->'ingredients';
  v_tags text[] := '{}';
  v_key text;
  v_existing record;
  v_tag text;
begin
  select key, display_name, library_table, tags_table into r
  from public.recipe_library_registry where key = p_library and is_active = true;
  if not found then return jsonb_build_object('status','error','error','Unknown recipe library.'); end if;
  if r.library_table !~ '^[a-z0-9_]+$' or (r.tags_table is not null and r.tags_table !~ '^[a-z0-9_]+$') then
    return jsonb_build_object('status','error','error','Invalid recipe library configuration.');
  end if;
  if v_title is null then return jsonb_build_object('status','needs_review','questions',jsonb_build_array('What is the recipe title?')); end if;
  if v_source is null then return jsonb_build_object('status','needs_review','questions',jsonb_build_array('What cookbook and page is this recipe from?')); end if;
  if v_method is null then return jsonb_build_object('status','needs_review','questions',jsonb_build_array('Part of the method is unreadable. Can you clarify it?')); end if;
  if v_ingredients is null or jsonb_typeof(v_ingredients) <> 'array' or jsonb_array_length(v_ingredients) = 0 then
    return jsonb_build_object('status','needs_review','questions',jsonb_build_array('The ingredient list is incomplete. Can you clarify it?'));
  end if;

  if p_recipe ? 'servings' and p_recipe->>'servings' is not null and btrim(p_recipe->>'servings') <> '' then
    begin v_servings := (p_recipe->>'servings')::integer; if v_servings <= 0 then v_servings := null; end if;
    exception when others then v_servings := null; end;
  end if;
  if p_recipe ? 'requires_prep' and p_recipe->>'requires_prep' is not null then
    begin v_requires_prep := (p_recipe->>'requires_prep')::boolean;
    exception when others then v_requires_prep := false; end;
  end if;
  if p_recipe ? 'tags' and jsonb_typeof(p_recipe->'tags') = 'array' then
    for v_tag in select lower(btrim(value)) from jsonb_array_elements_text(p_recipe->'tags') loop
      if v_tag <> '' and not (v_tag = any(v_tags)) then v_tags := array_append(v_tags, v_tag); end if;
    end loop;
  end if;

  v_key := jsonb_build_array(lower(v_title), v_source)::text;
  execute format(
    'select recipe_key, title, source_ref, is_deleted, requires_prep from %I
      where lower(source_ref) = lower($1) order by is_deleted asc limit 1', r.library_table
  ) into v_existing using v_source;

  if v_existing.recipe_key is not null and coalesce(v_existing.is_deleted,false) = false then
    if lower(v_existing.title) = lower(v_title) then
      if p_recipe ? 'requires_prep' then
        execute format('update %I set requires_prep = $1 where recipe_key = $2', r.library_table)
          using v_requires_prep, v_existing.recipe_key;
      else
        v_requires_prep := coalesce(v_existing.requires_prep, false);
      end if;
      return jsonb_build_object(
        'status','already_exists','library',p_library,'title',v_existing.title,
        'source_ref',v_existing.source_ref,'recipe_key',v_existing.recipe_key,
        'requires_prep',v_requires_prep
      );
    end if;
    return jsonb_build_object('status','conflict','error',format('That source is already used by %s.', v_existing.title));
  end if;

  execute format(
    'insert into %I
      (recipe_key,title,source_ref,ingredients,method,servings,yield_text,extracted_at,has_been_cooked,requires_prep,is_deleted)
     values ($1,$2,$3,$4,$5,$6,$7,timezone(''UTC'',now()),false,$8,false)', r.library_table
  ) using v_key, v_title, v_source, v_ingredients, v_method, v_servings, v_yield, v_requires_prep;

  if r.tags_table is not null then
    execute format('insert into %I (recipe_key,tags) values ($1,$2) on conflict (recipe_key) do update set tags = excluded.tags', r.tags_table)
      using v_key, v_tags;
  end if;

  return jsonb_build_object(
    'status','saved','library',p_library,'library_name',r.display_name,'title',v_title,
    'source_ref',v_source,'yield_text',v_yield,'servings',v_servings,'tags',to_jsonb(v_tags),
    'recipe_key',v_key,'ingredient_count',jsonb_array_length(v_ingredients),'requires_prep',v_requires_prep
  );
exception
  when unique_violation then return jsonb_build_object('status','conflict','error','A recipe with that source or key already exists.');
  when others then return jsonb_build_object('status','error','error',sqlerrm);
end;
$function$;
