import { chooseQueueDay, nextQueuePosition, normalizeRecipeUrl, parseTags, queueMealPayload } from '../supabase/functions/meal-recipe-intake/intake-core';

const categories = [
  {day_number:1, accepted_tags:['pasta']},
  {day_number:2, accepted_tags:[]},
  {day_number:3, accepted_tags:[]},
  {day_number:4, accepted_tags:['slow cooker','instant pot']},
  {day_number:5, accepted_tags:[]},
  {day_number:6, accepted_tags:['soup']},
];

test('queue assignment uses a matching category and keeps FIFO positions', () => {
  expect(chooseQueueDay(['SOUP'], categories, [], () => 0.8)).toBe(6);
  expect(nextQueuePosition([{day_number:6, position:1}, {day_number:6, position:4}, {day_number:2, position:9}], 6)).toBe(5);
});

test('queue assignment randomly selects matching days', () => {
  const twoPastaDays = categories.map(category => category.day_number === 3 ? {...category, accepted_tags:['pasta']} : category);
  expect(chooseQueueDay(['pasta'], twoPastaDays, [], () => 0)).toBe(1);
  expect(chooseQueueDay(['pasta'], twoPastaDays, [], () => 0.99)).toBe(3);
});

test('unmatched recipes prefer blank no-rule days', () => {
  const meals = [null, {title:'Busy',source_ref:'Book'}, null, null, {title:'Busy',source_ref:'Book'}, null];
  expect(chooseQueueDay(['fish'], categories, meals, () => 0)).toBe(3);
});

test('recipe URLs are normalized to prevent tracking duplicates', () => {
  expect(normalizeRecipeUrl('https://Example.com/recipe/?utm_source=newsletter#method')).toBe('https://example.com/recipe');
  expect(parseTags([' Soup ', 'soup', 'Quick'])).toEqual(['soup','quick']);
});

test('queued recipes carry their cooking method into the scheduled day', () => {
  const payload = queueMealPayload({id:'q1', title:'Soup', source_ref:'Book', ingredients:[], method:'1. Simmer.', notes:''}, '2026-W37', 6);
  expect(payload).toMatchObject({meal_number:6, method:'1. Simmer.', queue_item_id:'q1'});
});
