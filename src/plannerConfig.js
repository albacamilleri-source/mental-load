import { DEFAULT_CATEGORIES } from './mealPlanning';

export const BREAKFAST_CATEGORIES = Array.from({ length: 6 }, (_, index) => ({
  day_number: index + 1,
  name: '',
  accepted_tags: [],
}));

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

export const PLANNER_CONFIG = {
  dinner: { title: 'Dinners', singular: 'dinner', tables: dinnerTables, defaultCategories: DEFAULT_CATEGORIES, slotCount: 6 },
  breakfast: { title: 'Breakfasts', singular: 'breakfast', tables: breakfastTables, defaultCategories: BREAKFAST_CATEGORIES, slotCount: 6, capsule: true, dayNames: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday', 'Sunday'] },
};
