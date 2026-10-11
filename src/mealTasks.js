import { parseTags, recipeKey } from './mealPlanning';

export const MEAL_LIBRARY_SOURCES = [
  { key: 'breakfast', label: 'Breakfasts', table: 'breakfast_recipe_library', tagsTable: 'breakfast_recipe_tags' },
  { key: 'kids_lunch', label: 'Kids Lunches', table: 'kids_lunch_recipe_library', tagsTable: 'kids_lunch_recipe_tags' },
  { key: 'dinner', label: 'Dinners', table: 'meal_recipe_library', tagsTable: 'meal_recipe_tags' },
  { key: 'adult_lunch', label: 'Adult Lunches', table: 'lunch_recipe_library', tagsTable: 'lunch_recipe_tags' },
  { key: 'sides', label: 'Side Dishes', table: 'side_dish_recipe_library', tagsTable: 'side_dish_recipe_tags' },
  { key: 'treats', label: 'Treats & Snacks', table: 'treat_recipe_library', tagsTable: 'treat_recipe_tags' },
];

const PROTEIN_PATTERN = /\b(beef|veal|chicken|pork|lamb|mutton|goat|turkey|duck|goose|bacon|ham|sausage|chorizo|prosciutto|pancetta|salami|pepperoni|steak|meat|meatball|mince|venison|rabbit|fish|salmon|cod|haddock|hake|tuna|trout|mackerel|sardines?|anchov(?:y|ies)|sea\s?bass|swordfish|tilapia|prawns?|shrimp|seafood|crab|lobster|squid|octopus|mussels?|clams?)\b/i;

function normalizedSource(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  try {
    const url = new URL(source);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().toLowerCase();
  } catch { return source.toLowerCase().replace(/\s+/g, ' '); }
}

function sameRecipe(left, right) {
  const leftSource = normalizedSource(left?.source_ref);
  const rightSource = normalizedSource(right?.source_ref);
  if (leftSource && rightSource) return leftSource === rightSource;
  return String(left?.title || '').trim().toLowerCase().replace(/\s+/g, ' ') === String(right?.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function localDate(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day, 12) : null;
}

function localISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function mondayForISOWeek(weekString) {
  const [yearText, weekText] = String(weekString || '').split('-W');
  const jan4 = new Date(Number(yearText), 0, 4, 12);
  jan4.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (Number(weekText) - 1) * 7);
  return jan4;
}

function dinnerDate(meal) {
  const date = mondayForISOWeek(meal.week_of);
  date.setDate(date.getDate() + Number(meal.meal_number) - 1);
  return localISODate(date);
}

export function mealNeedsDefrosting(recipe, tags = []) {
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients
    .map(item => item?.name || '')
    .filter(name => !/\b(stock|broth|bouillon|seasoning|sauce|flavou?r)\b/i.test(name))
    .join(' ') : '';
  return PROTEIN_PATTERN.test(`${recipe?.title || ''} ${ingredients} ${parseTags(tags).join(' ')}`);
}

function taskLabel(mealType, meal) {
  if (mealType === 'dinner') return 'Dinner';
  if (mealType === 'kids_lunch') return 'Kids lunch';
  return Number(meal.meal_number) === 10 || Number(meal.meal_number) === 11
    ? 'Breakfast'
    : `Breakfast · ${Number(meal.meal_number) % 2 === 0 ? 'kids' : 'adults'}`;
}

export async function loadMealPlanTasks(client, start, end) {
  const startDate = localDate(start);
  const endDate = localDate(end);
  if (!startDate || !endDate) return { prep: [], defrost: [] };
  const scheduleQueries = [
    client.from('breakfast_weekly_meals').select('*').gte('scheduled_for', start).lte('scheduled_for', end),
    client.from('kids_lunch_weekly_meals').select('*').gte('scheduled_for', start).lte('scheduled_for', end),
    client.from('weekly_meals').select('*'),
  ];
  const libraryQueries = MEAL_LIBRARY_SOURCES.flatMap(source => [
    client.from(source.table).select('*'),
    client.from(source.tagsTable).select('*'),
  ]);
  const results = await Promise.all([...scheduleQueries, ...libraryQueries]);
  const failed = results.find(result => result.error);
  if (failed) throw failed.error;

  const libraries = MEAL_LIBRARY_SOURCES.map((source, index) => {
    const recipes = results[3 + index * 2].data || [];
    const tags = Object.fromEntries((results[4 + index * 2].data || []).map(row => [row.recipe_key, parseTags(row.tags)]));
    return { ...source, recipes: recipes.filter(recipe => !recipe.is_deleted), tags };
  });
  const scheduled = [
    ...(results[0].data || []).map(meal => ({ mealType: 'breakfast', meal, scheduledFor: meal.scheduled_for })),
    ...(results[1].data || []).map(meal => ({ mealType: 'kids_lunch', meal, scheduledFor: meal.scheduled_for })),
    ...(results[2].data || []).map(meal => ({ mealType: 'dinner', meal, scheduledFor: dinnerDate(meal) })),
  ].filter(item => !item.meal.completed_at && item.meal.title && item.scheduledFor >= start && item.scheduledFor <= end);

  const tasks = scheduled.map(item => {
    const preferredKey = item.mealType === 'dinner' ? 'dinner' : item.mealType;
    const orderedLibraries = [...libraries].sort((left, right) => Number(right.key === preferredKey) - Number(left.key === preferredKey));
    const source = orderedLibraries.find(candidate => candidate.recipes.some(recipe => sameRecipe(recipe, item.meal)));
    const recipe = source?.recipes.find(candidate => sameRecipe(candidate, item.meal)) || item.meal;
    const tags = source?.tags[recipeKey(recipe)] || [];
    return {
      ...item,
      meal: { ...item.meal, scheduled_for: item.scheduledFor },
      recipe,
      recipeKey: recipeKey(recipe),
      weekOf: item.meal.week_of,
      mealNumber: Number(item.meal.meal_number),
      label: taskLabel(item.mealType, item.meal),
      requiresPrep: !!recipe.requires_prep,
      requiresDefrost: mealNeedsDefrosting({ ...recipe, ingredients: recipe.ingredients || item.meal.ingredients }, tags),
    };
  });

  const sortTasks = rows => rows.sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor) || left.label.localeCompare(right.label));
  return {
    prep: sortTasks(tasks.filter(task => task.requiresPrep)),
    defrost: sortTasks(tasks.filter(task => task.requiresDefrost)),
  };
}

export function mealTaskKey(item) {
  return `${item.mealType}:${item.weekOf}:${item.mealNumber}:${item.recipeKey}`;
}
