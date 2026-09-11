export function parseTags(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map(tag => String(tag).trim().toLowerCase()).filter(Boolean))];
}

export function normalizeRecipeUrl(value) {
  const url = new URL(String(value || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Enter a valid http(s) recipe URL.');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

export function recipeKey(recipe) {
  return JSON.stringify([String(recipe.title || '').trim().toLowerCase(), String(recipe.source_ref || '').trim()]);
}

function isBlank(meal) {
  return !meal || (!String(meal.title || '').trim() && !String(meal.source_ref || '').trim());
}

function pick(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

export function chooseQueueDay(tags, categories, meals, random = Math.random) {
  const normalized = parseTags(tags);
  const matching = categories.filter(category => {
    const accepted = parseTags(category.accepted_tags);
    return accepted.length > 0 && accepted.some(tag => normalized.includes(tag));
  });
  if (matching.length) return Number(pick(matching, random).day_number);

  const noRule = categories.filter(category => parseTags(category.accepted_tags).length === 0);
  const blankNoRule = noRule.filter(category => isBlank(meals[Number(category.day_number) - 1]));
  if (blankNoRule.length) return Number(pick(blankNoRule, random).day_number);
  if (noRule.length) return Number(pick(noRule, random).day_number);

  const blank = categories.filter(category => isBlank(meals[Number(category.day_number) - 1]));
  return Number(pick(blank.length ? blank : categories, random).day_number);
}

export function nextQueuePosition(items, day) {
  const positions = items.filter(item => Number(item.day_number) === Number(day)).map(item => Number(item.position) || 0);
  return positions.length ? Math.max(...positions) + 1 : 1;
}

export function queueMealPayload(item, weekOf, day) {
  return {
    week_of: weekOf,
    meal_number: day,
    title: String(item.title).trim(),
    source_ref: String(item.source_ref).trim(),
    ingredients: item.ingredients,
    extracted_at: item.extracted_at,
    rating: item.rating,
    notes: item.notes || '',
    queue_item_id: item.id,
    is_override: false,
    override_type: null,
  };
}
