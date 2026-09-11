import { matchesCategory, parseTags, recipeKey } from './mealPlanning';

export function queueForDay(items, day) {
  return items
    .filter(item => Number(item.day_number) === Number(day))
    .sort((a, b) => Number(a.position) - Number(b.position) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

function pick(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

export function chooseQueueDay(tags, categories, meals, random = Math.random) {
  const normalized = parseTags(tags);
  const matchingRules = categories.filter(category => parseTags(category.accepted_tags).length > 0 && matchesCategory(normalized, category));
  if (matchingRules.length) return pick(matchingRules, random).day_number;

  const noRuleDays = categories.filter(category => parseTags(category.accepted_tags).length === 0);
  const blankNoRuleDays = noRuleDays.filter(category => {
    const meal = meals[category.day_number - 1];
    return !meal || (!String(meal.title || '').trim() && !String(meal.source_ref || '').trim());
  });
  if (blankNoRuleDays.length) return pick(blankNoRuleDays, random).day_number;
  if (noRuleDays.length) return pick(noRuleDays, random).day_number;

  const blankDays = categories.filter(category => {
    const meal = meals[category.day_number - 1];
    return !meal || (!String(meal.title || '').trim() && !String(meal.source_ref || '').trim());
  });
  return pick(blankDays.length ? blankDays : categories, random).day_number;
}

export function nextQueuePosition(items, day) {
  const positions = queueForDay(items, day).map(item => Number(item.position) || 0);
  return positions.length ? Math.max(...positions) + 1 : 1;
}

export function frontQueuePosition(items, day) {
  const positions = queueForDay(items, day).map(item => Number(item.position) || 0);
  return positions.length ? Math.min(...positions) - 1 : 1;
}

export function recipeTagsFor(meal, tagMap) {
  return parseTags(tagMap[recipeKey(meal)] || []);
}
