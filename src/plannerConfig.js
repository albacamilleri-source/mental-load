import { DEFAULT_CATEGORIES } from './mealPlanning';

export const BREAKFAST_SLOTS = [
  { day_number: 1, day_name: 'Monday', audience: 'adults', label: 'Monday · Adults' },
  { day_number: 2, day_name: 'Monday', audience: 'kids', label: 'Monday · Kids' },
  { day_number: 3, day_name: 'Tuesday', audience: 'adults', label: 'Tuesday · Adults' },
  { day_number: 4, day_name: 'Tuesday', audience: 'kids', label: 'Tuesday · Kids' },
  { day_number: 5, day_name: 'Wednesday', audience: 'adults', label: 'Wednesday · Adults' },
  { day_number: 6, day_name: 'Wednesday', audience: 'kids', label: 'Wednesday · Kids' },
  { day_number: 7, day_name: 'Thursday', audience: 'adults', label: 'Thursday · Adults' },
  { day_number: 8, day_name: 'Thursday', audience: 'kids', label: 'Thursday · Kids' },
  { day_number: 9, day_name: 'Friday', audience: 'adults', label: 'Friday · Adults' },
  { day_number: 10, day_name: 'Saturday', audience: 'shared', label: 'Saturday' },
  { day_number: 11, day_name: 'Sunday', audience: 'shared', label: 'Sunday' },
];

export const BREAKFAST_CATEGORIES = BREAKFAST_SLOTS.map(slot => ({
  ...slot,
  sort_order: slot.day_number,
  name: ({ 2: 'Pancakes', 4: 'Waffles', 6: 'Oats', 8: 'Savory', 10: 'Weekend', 11: 'Weekend' })[slot.day_number] || '',
  accepted_tags: ({ 2: ['pancake'], 4: ['waffle'], 6: ['oats'], 8: ['savory'], 10: ['weekend'], 11: ['weekend'] })[slot.day_number] || [],
}));

export const LUNCH_SLOTS = [
  { day_number: 1, day_name: 'Monday', audience: 'adults', label: 'Monday · Adults' },
  { day_number: 2, day_name: 'Monday', audience: 'kids', label: 'Monday · Kids' },
  { day_number: 3, day_name: 'Tuesday', audience: 'adults', label: 'Tuesday · Adults' },
  { day_number: 4, day_name: 'Tuesday', audience: 'kids', label: 'Tuesday · Kids' },
  { day_number: 5, day_name: 'Wednesday', audience: 'adults', label: 'Wednesday · Adults' },
  { day_number: 6, day_name: 'Wednesday', audience: 'kids', label: 'Wednesday · Kids' },
  { day_number: 7, day_name: 'Thursday', audience: 'adults', label: 'Thursday · Adults' },
  { day_number: 8, day_name: 'Thursday', audience: 'kids', label: 'Thursday · Kids' },
  { day_number: 9, day_name: 'Friday', audience: 'adults', label: 'Friday · Adults' },
  { day_number: 10, day_name: 'Friday', audience: 'kids', label: 'Friday · Kids' },
  { day_number: 11, day_name: 'Saturday', audience: 'shared', label: 'Saturday' },
  { day_number: 12, day_name: 'Sunday', audience: 'shared', label: 'Sunday' },
];

export const LUNCH_CATEGORIES = LUNCH_SLOTS.map(slot => ({
  ...slot,
  sort_order: slot.day_number,
  name: '',
  accepted_tags: [],
}));

const pairedDayGroups = (weekdays, weekendStart) => [
  ...weekdays.map((name, index) => ({
    name,
    entries: [
      { slot: index * 2 + 1, label: 'Adults' },
      { slot: index * 2 + 2, label: 'Kids' },
    ],
  })),
  { name: 'Saturday', entries: [{ slot: weekendStart, label: 'Saturday' }] },
  { name: 'Sunday', entries: [{ slot: weekendStart + 1, label: 'Sunday' }] },
];

const dinnerTables = {
  weekly_meals: 'weekly_meals',
  meal_recipe_tags: 'meal_recipe_tags',
  meal_day_categories: 'meal_day_categories',
  meal_recipe_library: 'meal_recipe_library',
  meal_recipe_queue: 'meal_recipe_queue',
};

const breakfastTables = {
  weekly_meals: 'breakfast_weekly_meals',
  meal_recipe_tags: 'breakfast_recipe_tags',
  meal_day_categories: 'breakfast_day_categories',
  meal_recipe_library: 'breakfast_recipe_library',
  meal_recipe_queue: 'breakfast_recipe_queue',
};

const lunchTables = {
  weekly_meals: 'lunch_weekly_meals',
  meal_recipe_tags: 'lunch_recipe_tags',
  meal_day_categories: 'lunch_day_categories',
  meal_recipe_library: 'lunch_recipe_library',
  meal_recipe_queue: 'lunch_recipe_queue',
};

const breakfastDayGroups = [
  ...pairedDayGroups(['Monday', 'Tuesday', 'Wednesday', 'Thursday'], 10).slice(0, 4),
  {
    name: 'Friday',
    entries: [
      { slot: 9, label: 'Adults' },
      { label: 'Kids', fixed: true, category: 'Cereal', summary: 'Day off', message: 'Enjoy the day off.' },
    ],
  },
  ...pairedDayGroups([], 10),
];

export const PLANNER_CONFIG = {
  dinner: { title: 'Dinners', singular: 'dinner', tables: dinnerTables, defaultCategories: DEFAULT_CATEGORIES, slotCount: 6 },
  breakfast: { title: 'Breakfasts', singular: 'breakfast', tables: breakfastTables, defaultCategories: BREAKFAST_CATEGORIES, slotCount: 11, capsule: true, autoQueue: true, periodKey: 'breakfast-capsule', dayNames: BREAKFAST_SLOTS.map(slot => slot.label), dayGroups: breakfastDayGroups },
  lunch: { title: 'Lunches', singular: 'lunch', tables: lunchTables, defaultCategories: LUNCH_CATEGORIES, slotCount: 12, capsule: true, autoQueue: true, periodKey: 'lunch-capsule', dayNames: LUNCH_SLOTS.map(slot => slot.label), dayGroups: pairedDayGroups(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], 11) },
};
