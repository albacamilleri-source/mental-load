import { chooseQueueDay, frontQueuePosition, nextQueuePosition, queueForDay, queueInsertionBeforeTail } from './mealQueue';
import { DEFAULT_CATEGORIES } from './mealPlanning';

const blankMeals = Array.from({length: 6}, (_, i) => ({meal_number: i + 1, title: '', source_ref: ''}));

test('chooses randomly among matching rule queues', () => {
  const categories = DEFAULT_CATEGORIES.map(c => ({...c}));
  expect(chooseQueueDay(['soup', 'instant pot'], categories, blankMeals, () => 0)).toBe(4);
  expect(chooseQueueDay(['soup', 'instant pot'], categories, blankMeals, () => 0.99)).toBe(6);
});

test('unmatched recipes prefer blank no-rule days', () => {
  const meals = blankMeals.map(meal => ({...meal}));
  meals[0] = {...meals[0], title: 'Busy', source_ref: 'Book'};
  expect(chooseQueueDay(['salad'], DEFAULT_CATEGORIES, meals, () => 0)).toBe(2);
});

test('queue helpers preserve FIFO positions', () => {
  const items = [{id:'b', day_number:2, position:2}, {id:'a', day_number:2, position:1}, {id:'c', day_number:3, position:1}];
  expect(queueForDay(items, 2).map(item => item.id)).toEqual(['a', 'b']);
  expect(nextQueuePosition(items, 2)).toBe(3);
  expect(frontQueuePosition(items, 2)).toBe(0);
  expect(queueInsertionBeforeTail(items, 2)).toEqual({position:2, tail:items[0]});
});
