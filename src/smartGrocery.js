const asPositiveNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const recipeIdentity = recipe => String(recipe?.source_ref || recipe?.recipe_key || recipe?.title || '').trim().toLowerCase();

function findLibraryRecipe(meal, library) {
  const source = String(meal?.source_ref || '').trim().toLowerCase();
  const key = String(meal?.recipe_key || '').trim();
  return (library || []).find(recipe =>
    (!recipe.is_deleted && source && String(recipe.source_ref || '').trim().toLowerCase() === source) ||
    (!recipe.is_deleted && key && recipe.recipe_key === key)
  );
}

export function scaleIngredients(ingredients, recipeYield, servingsNeeded) {
  const yielded = asPositiveNumber(recipeYield);
  const needed = asPositiveNumber(servingsNeeded) || yielded;
  const scale = yielded && needed ? needed / yielded : 1;
  return (Array.isArray(ingredients) ? ingredients : [])
    .filter(item => String(item?.name || '').trim())
    .map(item => {
      const quantity = Number(item.qty);
      return {
        name: String(item.name).trim(),
        qty: item.qty == null || item.qty === '' || !Number.isFinite(quantity) ? null : quantity * scale,
        unit: String(item.unit || '').trim(),
      };
    });
}

function scheduledRecipes(mealType, meals, library, scheduledDate) {
  return (meals || []).flatMap(meal => {
    const stored = findLibraryRecipe(meal, library);
    const ingredients = Array.isArray(meal.ingredients) && meal.ingredients.length ? meal.ingredients : stored?.ingredients;
    const recipeYield = asPositiveNumber(stored?.servings) || asPositiveNumber(meal.recipe_yield);
    const servingsNeeded = asPositiveNumber(meal.servings) || recipeYield;
    const scaled = scaleIngredients(ingredients, recipeYield, servingsNeeded);
    if (!meal.title?.trim() || !scaled.length) return [];
    return [{
      mealType,
      title: meal.title.trim(),
      source: String(meal.source_ref || '').trim(),
      scheduledFor: scheduledDate(meal),
      recipeYield,
      servingsNeeded,
      ingredients: scaled,
    }];
  });
}

function selectedRecipes(mealType, selections, library) {
  const selected = new Set((selections || []).map(row => row.recipe_key));
  return (library || []).flatMap(recipe => {
    if (recipe.is_deleted || !selected.has(recipe.recipe_key)) return [];
    const ingredients = scaleIngredients(recipe.ingredients, recipe.servings, recipe.servings);
    if (!recipe.title?.trim() || !ingredients.length) return [];
    return [{
      mealType,
      title: recipe.title.trim(),
      source: String(recipe.source_ref || '').trim(),
      scheduledFor: null,
      recipeYield: asPositiveNumber(recipe.servings),
      servingsNeeded: asPositiveNumber(recipe.servings),
      ingredients,
    }];
  });
}

export function buildSmartGroceryRecipes({
  dinnerMeals = [], dinnerLibrary = [], dinnerDate,
  breakfastMeals = [], breakfastLibrary = [],
  kidsLunchMeals = [], kidsLunchLibrary = [], kidsLunchSides = [], sideOptions = [],
  adultLunchSelections = [], adultLunchLibrary = [],
  sideSelections = [], sideLibrary = [], treatSelections = [], treatLibrary = [],
}) {
  const recipes = [
    ...scheduledRecipes('Dinner', dinnerMeals, dinnerLibrary, dinnerDate),
    ...scheduledRecipes('Breakfast', breakfastMeals, breakfastLibrary, meal => meal.scheduled_for || null),
    ...scheduledRecipes('Kids lunch', kidsLunchMeals, kidsLunchLibrary, meal => meal.scheduled_for || null),
    ...selectedRecipes('Adult lunch', adultLunchSelections, adultLunchLibrary),
    ...selectedRecipes('Side dishes', sideSelections, sideLibrary),
    ...selectedRecipes('Treats & snacks', treatSelections, treatLibrary),
  ];

  const optionNames = new Map((sideOptions || []).map(option => [option.id, option.name]));
  const sidesByDay = new Map((kidsLunchSides || []).map(row => [Number(row.day_number), row]));
  for (const meal of kidsLunchMeals || []) {
    const sides = sidesByDay.get(Number(meal.meal_number));
    if (!sides) continue;
    for (const id of [sides.side_one_id, sides.side_two_id, sides.side_three_id]) {
      const name = optionNames.get(id);
      if (!name) continue;
      recipes.push({
        mealType: 'Kids lunch side', title: name, source: '', scheduledFor: meal.scheduled_for || null,
        recipeYield: null, servingsNeeded: null,
        ingredients: [{ name, qty: null, unit: 'as needed' }],
      });
    }
  }

  const seen = new Set();
  return recipes.filter(recipe => {
    const identity = `${recipe.mealType}|${recipe.scheduledFor || ''}|${recipeIdentity(recipe)}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function smartGroceryText(result) {
  const sections = (result?.sections || []).filter(section => section.items?.length);
  const lines = sections.flatMap(section => [
    section.name.toUpperCase(),
    ...section.items.map(item => `• ${item.name}${item.amount ? ` — ${item.amount}` : ''}${item.note ? ` (${item.note})` : ''}`),
    '',
  ]);
  if (result?.review?.length) {
    lines.push('CHECK THESE', ...result.review.map(item => `• ${item.issue}${item.suggestion ? ` — ${item.suggestion}` : ''}`));
  }
  return lines.join('\n').trim();
}
