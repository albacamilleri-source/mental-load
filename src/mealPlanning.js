export const DEFAULT_CATEGORIES = Array.from({ length: 6 }, (_, i) => ({
  day_number: i + 1,
  name: i === 3 ? 'Instant pot or slow cooker' : i === 5 ? 'Soup Sunday' : '',
  accepted_tags: i === 3 ? ['instant pot', 'slow cooker'] : i === 5 ? ['soup'] : [],
}));

export function parseTags(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(items.map(tag => String(tag).trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean))];
}

export function recipeKey(meal) {
  const storedKey = String(meal?.recipe_key || '').trim();
  if (storedKey) return storedKey;
  return JSON.stringify([meal.title.trim().toLowerCase(), meal.source_ref.trim()]);
}

export function matchesCategory(tags, category) {
  const accepted = parseTags(category?.accepted_tags);
  const actual = parseTags(tags);
  return accepted.length === 0 || accepted.some(tag => actual.includes(tag));
}

export function mealValidation(meal, tags, category) {
  if (!meal.title.trim() || !meal.source_ref.trim()) return 'Add a meal title and source first.';
  if (!matchesCategory(tags, category)) return `Day ${meal.meal_number} requires ${parseTags(category.accepted_tags).join(' or ')}. Add a matching recipe tag or choose another recipe.`;
  return '';
}

export function matchingDays(tags, categories) {
  return categories.filter(category => matchesCategory(tags, category));
}
