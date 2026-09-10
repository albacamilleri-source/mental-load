import { DEFAULT_CATEGORIES, parseTags, recipeKey, matchesCategory, mealValidation, matchingDays } from './mealPlanning';

test('normalizes user tags without losing multi-word categories', () => {
  expect(parseTags(' Soup, INSTANT   POT, soup, , slow cooker ')).toEqual(['soup', 'instant pot', 'slow cooker']);
});
test('requires soup exactly, not a partial or similar tag', () => {
  const soup = DEFAULT_CATEGORIES[5];
  expect(matchesCategory(['SOUP'], soup)).toBe(true);
  expect(matchesCategory(['soupy', 'soup maker'], soup)).toBe(false);
  expect(matchesCategory([], soup)).toBe(false);
});
test('accepts either appliance tag, with no requirement for both', () => {
  const appliance = DEFAULT_CATEGORIES[3];
  expect(matchesCategory(['instant pot'], appliance)).toBe(true);
  expect(matchesCategory(['slow cooker'], appliance)).toBe(true);
  expect(matchesCategory(['stovetop'], appliance)).toBe(false);
});
test('unrestricted days accept untagged recipes', () => {
  expect(matchesCategory([], DEFAULT_CATEGORIES[0])).toBe(true);
});
test('recipe identity survives week and day duplication but distinguishes sources', () => {
  const meal = { title: ' Tomato Soup ', source_ref: 'Book p.42', meal_number: 1, week_of: '2026-W37' };
  expect(recipeKey(meal)).toBe(recipeKey({ ...meal, title: 'tomato soup', meal_number: 6, week_of: '2026-W38' }));
  expect(recipeKey(meal)).not.toBe(recipeKey({ ...meal, source_ref: 'Book p.43' }));
});
test('reuse excludes incompatible days and includes OR matches', () => {
  expect(matchingDays(['slow cooker'], DEFAULT_CATEGORIES).map(c => c.day_number)).toEqual([1, 2, 3, 4, 5]);
  expect(matchingDays(['soup'], DEFAULT_CATEGORIES).map(c => c.day_number)).toEqual([1, 2, 3, 5, 6]);
});
test('saving enforces required fields and category matching', () => {
  const meal = { title: 'Soup', source_ref: 'Book', meal_number: 6 };
  expect(mealValidation(meal, [], DEFAULT_CATEGORIES[5])).toMatch(/requires soup/);
  expect(mealValidation(meal, ['soup'], DEFAULT_CATEGORIES[5])).toBe('');
  expect(mealValidation({ ...meal, source_ref: ' ' }, ['soup'], DEFAULT_CATEGORIES[5])).toMatch(/title and source/);
});
