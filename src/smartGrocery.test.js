import { buildSmartGroceryRecipes, scaleIngredients, smartGroceryText } from './smartGrocery';

test('scales scheduled ingredients from recipe yield to servings needed', () => {
  expect(scaleIngredients([{ name: 'eggs', qty: 2, unit: 'item' }], 2, 6)).toEqual([
    { name: 'eggs', qty: 6, unit: 'item' },
  ]);
});

test('collects scheduled meals and active Prep List recipes without deleted records', () => {
  const dinner = { title: 'Soup', source_ref: 'book:soup', servings: 4, ingredients: [{ name: 'carrot', qty: 2, unit: 'item' }] };
  const lunch = { recipe_key: 'lunch-1', title: 'Wrap', source_ref: 'book:wrap', servings: 2, ingredients: [{ name: 'egg', qty: 1, unit: 'item' }] };
  const recipes = buildSmartGroceryRecipes({
    dinnerMeals: [dinner], dinnerLibrary: [{ ...dinner, servings: 2 }], dinnerDate: () => '2026-09-28',
    adultLunchSelections: [{ recipe_key: 'lunch-1' }], adultLunchLibrary: [lunch, { ...lunch, recipe_key: 'deleted', is_deleted: true }],
  });
  expect(recipes).toHaveLength(2);
  expect(recipes[0]).toMatchObject({ mealType: 'Dinner', scheduledFor: '2026-09-28', ingredients: [{ name: 'carrot', qty: 4, unit: 'item' }] });
  expect(recipes[1]).toMatchObject({ mealType: 'Adult lunch', title: 'Wrap' });
});

test('includes selected kids lunch sides once for each scheduled day', () => {
  const recipes = buildSmartGroceryRecipes({
    kidsLunchMeals: [{ meal_number: 1, title: 'Main', source_ref: 'main', scheduled_for: '2026-09-28', ingredients: [{ name: 'bread', qty: 2, unit: 'slice' }] }],
    kidsLunchSides: [{ day_number: 1, side_one_id: 'fruit', side_two_id: 'fruit' }],
    sideOptions: [{ id: 'fruit', name: 'Fresh fruit' }],
  });
  expect(recipes.filter(recipe => recipe.mealType === 'Kids lunch side')).toHaveLength(1);
});

test('formats the organised list and its QA warnings for copying', () => {
  const text = smartGroceryText({ sections: [{ name: 'Dairy & Eggs', items: [{ name: 'Eggs', amount: '13', note: '' }] }], review: [{ issue: 'Salt total looks high', suggestion: 'Check the source recipes' }] });
  expect(text).toContain('DAIRY & EGGS');
  expect(text).toContain('• Eggs — 13');
  expect(text).toContain('CHECK THESE');
  expect(text).toContain('Salt total looks high');
});
