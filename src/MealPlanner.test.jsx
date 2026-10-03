import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import MealPlanner, { MealPlannerWorkspace, SelectionPlannerWorkspace, SmartGroceryList } from './MealPlanner';
import { DEFAULT_CATEGORIES, recipeKey } from './mealPlanning';
import { BREAKFAST_CATEGORIES, BREAKFAST_SLOTS, KIDS_LUNCH_CATEGORIES, LUNCH_CATEGORIES } from './plannerConfig';

const mockFrom = jest.fn();
const mockInvoke = jest.fn();
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (...args) => mockFrom(...args), functions: { invoke: (...args) => mockInvoke(...args) } }) }));
let container, root, current, past, library, queue, tagRows, categories, breakfastCurrent, breakfastPast, breakfastLibrary, breakfastQueue, breakfastTagRows, breakfastCategories, lunchCurrent, lunchPast, lunchLibrary, lunchQueue, lunchTagRows, lunchCategories, kidsLunchCurrent, kidsLunchPast, kidsLunchLibrary, kidsLunchQueue, kidsLunchTagRows, kidsLunchCategories, kidsLunchSideOptions, kidsLunchDaySides, writes, failure, deferWeeklyWrite, resolveWeeklyWrite;
const sample = (n, tags = []) => ({ id: `meal-${n}`, meal_number: n, title: `Recipe ${n}`, source_ref: `Book ${n}`, week_of: '2026-W36', ingredients: [{name: 'carrot', qty: 1, unit: 'item'}], extracted_at: null, tags });
const weekAfterToday = () => {
  const date = new Date(); date.setDate(date.getDate() + 7);
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7; utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return `${utc.getUTCFullYear()}-W${String(Math.ceil((((utc - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`;
};
function setupQueries() {
  const weeklyReadCount = { dinner: 0, breakfast: 0, lunch: 0, kids_lunch: 0 };
  mockFrom.mockImplementation(table => {
    const kind = table.startsWith('breakfast_') ? 'breakfast' : table.startsWith('kids_lunch_') ? 'kids_lunch' : table.startsWith('lunch_') ? 'lunch' : 'dinner';
    const logicalTable = kind === 'breakfast' ? ({breakfast_weekly_meals:'weekly_meals',breakfast_recipe_tags:'meal_recipe_tags',breakfast_day_categories:'meal_day_categories',breakfast_recipe_library:'meal_recipe_library',breakfast_recipe_queue:'meal_recipe_queue'}[table] || table) : kind === 'kids_lunch' ? ({kids_lunch_weekly_meals:'weekly_meals',kids_lunch_recipe_tags:'meal_recipe_tags',kids_lunch_day_categories:'meal_day_categories',kids_lunch_recipe_library:'meal_recipe_library',kids_lunch_recipe_queue:'meal_recipe_queue',kids_lunch_side_options:'side_options',kids_lunch_day_sides:'day_sides'}[table] || table) : kind === 'lunch' ? ({lunch_weekly_meals:'weekly_meals',lunch_recipe_tags:'meal_recipe_tags',lunch_day_categories:'meal_day_categories',lunch_recipe_library:'meal_recipe_library',lunch_recipe_queue:'meal_recipe_queue'}[table] || table) : table;
    if (logicalTable === 'weekly_meals') weeklyReadCount[kind] += 1;
    let isPast = logicalTable === 'weekly_meals' && weeklyReadCount[kind] === 2, payload, action = '', maybeSingle = false;
    const filters = {};
    const query = {
      select: () => query,
      eq: (field, value) => { filters[field] = value; if (action) writes.push({ table, [action]: { field, value, payload } }); return query; },
      lt: () => { isPast = true; return query; }, gte: () => query, lte: () => query, order: () => query,
      upsert: value => { payload = value; writes.push({ table, value }); return query; },
      insert: value => { payload = value; action = 'insert'; writes.push({ table, insert: value }); return query; },
      update: value => { payload = value; action = 'update'; return query; },
      delete: () => { action = 'delete'; return query; },
      single: () => query,
      maybeSingle: () => { maybeSingle = true; return query; },
      then: (resolve, reject) => {
        if (failure) return Promise.resolve({ error: {message: failure} }).then(resolve, reject);
        const source = kind === 'breakfast' ? {current:breakfastCurrent,past:breakfastPast,library:breakfastLibrary,queue:breakfastQueue,tagRows:breakfastTagRows,categories:breakfastCategories} : kind === 'kids_lunch' ? {current:kidsLunchCurrent,past:kidsLunchPast,library:kidsLunchLibrary,queue:kidsLunchQueue,tagRows:kidsLunchTagRows,categories:kidsLunchCategories,sideOptions:kidsLunchSideOptions,daySides:kidsLunchDaySides} : kind === 'lunch' ? {current:lunchCurrent,past:lunchPast,library:lunchLibrary,queue:lunchQueue,tagRows:lunchTagRows,categories:lunchCategories} : {current,past,library,queue,tagRows,categories};
        let data = logicalTable === 'weekly_meals' ? (isPast ? source.past : source.current) : logicalTable === 'meal_recipe_tags' ? source.tagRows : logicalTable === 'meal_day_categories' ? source.categories : logicalTable === 'meal_recipe_library' ? source.library : logicalTable === 'side_options' ? source.sideOptions : logicalTable === 'day_sides' ? source.daySides : source.queue;
        if (maybeSingle && logicalTable === 'meal_recipe_queue') data = source.queue.find(row => Object.entries(filters).every(([field, value]) => row[field] === value)) || null;
        if (payload && logicalTable === 'weekly_meals') data = { id: 'saved', ...payload };
        if (payload && logicalTable === 'meal_recipe_library') data = payload;
        if (payload && logicalTable === 'meal_recipe_queue' && action === 'insert') data = { id: `queue-${writes.length}`, created_at: '2026-09-11T08:00:00Z', ...payload };
        if (payload && (logicalTable === 'side_options' || logicalTable === 'day_sides')) data = payload;
        if (payload && logicalTable === 'weekly_meals' && deferWeeklyWrite) return new Promise(done => { resolveWeeklyWrite = () => done({ data, error: null }); }).then(resolve, reject);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
}
async function render(mealType = 'dinner') { await act(async () => { root.render(['lunch', 'sides', 'treats'].includes(mealType) ? <SelectionPlannerWorkspace mealType={mealType}/> : <MealPlannerWorkspace mealType={mealType}/>); }); }
async function change(label, value) {
  await act(async () => { Simulate.change(document.body.querySelector(`[aria-label="${label}"]`), { target: { value } }); });
}
function button(text, parent = document.body) { return [...parent.querySelectorAll('button')].find(b => b.textContent === text); }
function day(n) { return container.querySelector(`[aria-label="Day ${n} meal title"]`)?.closest('.meal'); }
async function click(el) { await act(async () => { el.click(); }); }
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.confirm = jest.fn(() => true);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  current = []; past = []; library = []; queue = []; tagRows = []; categories = DEFAULT_CATEGORIES.map(c => ({...c})); breakfastCurrent = []; breakfastPast = []; breakfastLibrary = []; breakfastQueue = []; breakfastTagRows = []; breakfastCategories = BREAKFAST_CATEGORIES.map(c => ({...c, accepted_tags: [...c.accepted_tags]})); lunchCurrent = []; lunchPast = []; lunchLibrary = []; lunchQueue = []; lunchTagRows = []; lunchCategories = LUNCH_CATEGORIES.map(c => ({...c, accepted_tags: [...c.accepted_tags]})); kidsLunchCurrent = []; kidsLunchPast = []; kidsLunchLibrary = []; kidsLunchQueue = []; kidsLunchTagRows = []; kidsLunchCategories = KIDS_LUNCH_CATEGORIES.map(c => ({...c, accepted_tags: [...c.accepted_tags]})); kidsLunchSideOptions = []; kidsLunchDaySides = []; writes = []; failure = ''; deferWeeklyWrite = false; resolveWeeklyWrite = null; mockInvoke.mockReset(); setupQueries();
  window.history.replaceState({}, '', '/mental-load/#meal-planner'); window.scrollTo = jest.fn();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test('Meal Planner opens a choice screen and returns from Breakfasts without leaving the app', async () => {
  await act(async () => { root.render(<MealPlanner/>); });
  expect(container.querySelector('.plannerChoice .plannerChoiceTitle').textContent).toContain('Breakfasts');
  expect(container.querySelector('[aria-label="Open Dinners planner"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Open Breakfasts planner"]')).not.toBeNull();
  await click(container.querySelector('[aria-label="Open Breakfasts planner"]'));
  expect(window.location.hash).toBe('#meal-planner/breakfasts');
  expect(container.querySelector('.plannerHeader .brand').textContent).toContain('Breakfasts');
  await click(container.querySelector('[aria-label="Back to Meal Planner"]'));
  expect(window.location.hash).toBe('#meal-planner');
  expect(container.querySelector('[aria-label="Open Dinners planner"]')).not.toBeNull();
  await click(container.querySelector('[aria-label="Open Dinners planner"]'));
  expect(window.location.hash).toBe('#meal-planner/dinners');
  expect(container.querySelector('.plannerHeader .brand').textContent).toContain('Dinners');
});

test('smart grocery list gathers every module and shows the AI-organised result', async () => {
  breakfastCurrent = [{...sample(70), week_of:'breakfast-capsule', scheduled_for:'2026-09-28', servings:4, ingredients:[{name:'whole eggs',qty:4,unit:'item'}]}];
  breakfastLibrary = [{...breakfastCurrent[0], recipe_key:recipeKey(breakfastCurrent[0]), servings:2, is_deleted:false}];
  mockInvoke.mockResolvedValue({data:{recipeCount:1,inputIngredientCount:1,sections:[{name:'Dairy & Eggs',items:[{name:'Eggs',amount:'8',note:'',sources:['Recipe 70']}]}],review:[{issue:'Confirm egg size',suggestion:'Use the recipe specification',sources:['Recipe 70']}]},error:null});
  await act(async () => { root.render(<SmartGroceryList/>); });
  await click(button('Generate complete grocery list'));
  expect(mockInvoke).toHaveBeenCalledWith('meal-grocery-list', expect.objectContaining({body:expect.objectContaining({dateFrom:'2026-09-28',dateTo:'2026-10-04'})}));
  const sent = mockInvoke.mock.calls[0][1].body.recipes;
  expect(sent.find(recipe => recipe.title === 'Recipe 70').ingredients[0].qty).toBe(8);
  expect(container.textContent).toContain('Dairy & Eggs');
  expect(container.textContent).toContain('Confirm egg size');
});

test('smart grocery list explains when there is nothing with ingredients to organise', async () => {
  await act(async () => { root.render(<SmartGroceryList/>); });
  await click(button('Generate complete grocery list'));
  expect(container.querySelector('[role="alert"]').textContent).toContain('No selected recipes with ingredients');
  expect(mockInvoke).not.toHaveBeenCalled();
});

test('Meal Planner opens a Lunches submenu with Kids before Adults', async () => {
  await act(async () => { root.render(<MealPlanner/>); });
  expect([...container.querySelectorAll('.plannerChoiceTitle')].map(node => node.textContent.trim().replace('↗', '').trim())).toEqual(['Breakfasts', 'Lunches', 'Dinners', 'Side Dishes', 'Treats & Snacks']);
  await click(container.querySelector('[aria-label="Open Lunches planner"]'));
  expect(window.location.hash).toBe('#meal-planner/lunches');
  expect([...container.querySelectorAll('.plannerChoiceTitle')].map(node => node.textContent.trim().replace('↗', '').trim())).toEqual(['Kids', 'Adults']);
  await click(container.querySelector('[aria-label="Open Adult Lunches planner"]'));
  expect(window.location.hash).toBe('#meal-planner/lunches/adults');
  expect(container.querySelector('.plannerHeader .brand').textContent).toContain('Adult Lunches');
  await click(container.querySelector('[aria-label="Back to Lunches"]'));
  expect(window.location.hash).toBe('#meal-planner/lunches');
});

test('Adult Lunches has an isolated selection library and Prep List', async () => {
  library = [{...sample(1), recipe_key:recipeKey(sample(1)), has_been_cooked:false, is_deleted:false}];
  lunchLibrary = [{...sample(90), recipe_key:recipeKey(sample(90)), has_been_cooked:false, is_deleted:false}];
  await render('lunch');
  expect(mockFrom).toHaveBeenCalledWith('lunch_recipe_library');
  expect(mockFrom).toHaveBeenCalledWith('lunch_prep_selections');
  expect(mockFrom).not.toHaveBeenCalledWith('meal_recipe_library');
  expect(container.querySelector('#recipe-library').textContent).toContain('Recipe 90');
  expect(container.querySelector('#recipe-library').textContent).not.toContain('Recipe 1');
  expect(container.querySelector('.prepRibbon')).not.toBeNull();
  expect(container.querySelectorAll('[aria-label$=" meal title"]')).toHaveLength(0);
});

test('Adult Lunches can add and remove a recipe from the Prep List', async () => {
  const source = 'https://example.com/adult-lunch';
  const storedKey = JSON.stringify(['original lunch title', source]);
  lunchLibrary = [{...sample(91), title:'Improved Lunch Title', source_ref:source, recipe_key:storedKey, has_been_cooked:false, is_deleted:false}];
  lunchTagRows = [{recipe_key:storedKey, tags:['adult']}];
  await render('lunch');
  const card = [...container.querySelectorAll('#recipe-library .recipeCard')].find(node => node.textContent.includes('Improved Lunch Title'));
  await click(card.querySelector('input[type="checkbox"]'));
  expect(writes.find(write => write.table === 'lunch_prep_selections' && write.value?.recipe_key === storedKey)).toBeTruthy();
  expect(container.querySelector('.prepRibbon').textContent).toContain('Improved Lunch Title');
});

test('renaming an Adult Lunch recipe keeps its stable key and source record', async () => {
  const source = 'https://example.com/lunch-to-rename';
  const storedKey = JSON.stringify(['original lunch title', source]);
  lunchLibrary = [{...sample(92), title:'Original Lunch Title', source_ref:source, recipe_key:storedKey, has_been_cooked:false, is_deleted:false}];
  lunchQueue = [{recipe_key:storedKey, selected_at:'2026-09-27T08:00:00Z'}];
  await render('lunch');
  const card = [...container.querySelectorAll('#recipe-library .recipeCard')].find(node => node.textContent.includes('Original Lunch Title'));
  await click(button('View recipe', card));
  await change('Title for Original Lunch Title', 'Renamed Lunch');
  await click(button('Save changes', document.body));
  const saved = writes.find(write => write.table === 'lunch_recipe_library' && write.value?.title === 'Renamed Lunch');
  expect(saved.value).toMatchObject({recipe_key:storedKey, source_ref:source, is_deleted:false});
  expect(writes.find(write => write.table === 'lunch_recipe_library' && write.update?.payload?.is_deleted)).toBeUndefined();
  expect(container.querySelector('#recipe-library').textContent).toContain('Renamed Lunch');
  expect(container.querySelector('.prepRibbon').textContent).toContain('Renamed Lunch');
});

test('Kids Lunches chooses mains from its library and keeps editable side dropdowns for seven days', async () => {
  kidsLunchLibrary = [{...sample(80), recipe_key:recipeKey(sample(80)), has_been_cooked:false, is_deleted:false}];
  kidsLunchSideOptions = [{id:'side-fruit', name:'Fruit', sort_order:1}];
  kidsLunchDaySides = [{day_number:1, side_one_id:'side-fruit', side_two_id:null}];
  await render('kids_lunch');
  expect(mockFrom).toHaveBeenCalledWith('kids_lunch_weekly_meals');
  expect(mockFrom).toHaveBeenCalledWith('kids_lunch_recipe_library');
  expect(mockFrom).toHaveBeenCalledWith('kids_lunch_side_options');
  expect(mockFrom).toHaveBeenCalledWith('kids_lunch_day_sides');
  expect(container.querySelector('#recipe-library').textContent).toContain('Recipe 80');
  expect(container.querySelectorAll('[aria-label$=" meal title"]')).toHaveLength(0);
  expect(container.querySelectorAll('[aria-label$=" Main recipe"]')).toHaveLength(7);
  expect(container.querySelector('[aria-label="Day 1 meal source"]')).toBeNull();
  expect(container.querySelector('[aria-label="Day 1 recipe tags"]')).toBeNull();
  await change('Monday Main recipe', recipeKey(kidsLunchLibrary[0]));
  expect(writes.find(write => write.table === 'kids_lunch_weekly_meals' && write.value?.title === 'Recipe 80')).toBeTruthy();
  expect([...container.querySelectorAll('.meal')].find(card => card.querySelector('.dayHeading')?.textContent === 'Monday').textContent).toContain('Recipe 80');
  expect(container.querySelectorAll('.kidsLunchSides select')).toHaveLength(14);
  expect(container.querySelector('[aria-label="Monday Side 1"]').value).toBe('side-fruit');
  await change('Monday Side 2', 'side-fruit');
  expect(writes.find(write => write.table === 'kids_lunch_day_sides' && write.value?.day_number === 1)).toMatchObject({value:{side_one_id:'side-fruit',side_two_id:'side-fruit'}});
  await click(button('Edit sides'));
  const modal = document.body.querySelector('[aria-label="Edit lunch sides"]');
  await change('Side option 1', 'Fresh fruit');
  await click(button('+ Add side', modal));
  await change('Side option 2', 'Yoghurt');
  await click(button('Save side choices', modal));
  expect(writes.find(write => write.table === 'kids_lunch_side_options' && Array.isArray(write.value))).toBeTruthy();
});

test('Kids Lunch main dropdown only offers library recipes matching that day rule', async () => {
  kidsLunchCategories[0] = {...kidsLunchCategories[0], name:'Pasta Monday', accepted_tags:['pasta']};
  const pasta = {...sample(81), title:'Lunchbox Pasta', recipe_key:recipeKey(sample(81)), has_been_cooked:false, is_deleted:false};
  const soup = {...sample(82), title:'Tomato Soup', recipe_key:recipeKey(sample(82)), has_been_cooked:false, is_deleted:false};
  kidsLunchLibrary = [pasta, soup];
  kidsLunchTagRows = [{recipe_key:recipeKey(pasta), tags:['pasta']}, {recipe_key:recipeKey(soup), tags:['soup']}];
  await render('kids_lunch');
  const options = [...container.querySelector('[aria-label="Monday Main recipe"]').options].map(option => option.textContent);
  expect(options).toContain('Lunchbox Pasta');
  expect(options).not.toContain('Tomato Soup');
});

test('unscheduling a Kids Lunch reuses the stored library key for the same source', async () => {
  const source = 'https://example.com/strawberry-croissant';
  const storedKey = JSON.stringify(['original croissant title', source]);
  const scheduled = {...sample(83), meal_number:1, title:'Strawberry Cream Cheese Croissant', source_ref:source, week_of:'kids-lunch-capsule', scheduled_for:'2026-10-05'};
  kidsLunchCurrent = [scheduled];
  kidsLunchLibrary = [{...scheduled, recipe_key:storedKey, has_been_cooked:false, is_deleted:false}];
  kidsLunchTagRows = [{recipe_key:storedKey, tags:['sandwich']}];
  kidsLunchCategories[0] = {...kidsLunchCategories[0], name:'Sandwich Monday', accepted_tags:['sandwich']};
  await render('kids_lunch');
  const monday = [...container.querySelectorAll('.meal')].find(card => card.querySelector('.dayHeading')?.textContent === 'Monday');
  await click(button('Unschedule', monday));
  expect(writes.find(write => write.table === 'kids_lunch_recipe_library' && write.value?.is_deleted === false)?.value.recipe_key).toBe(storedKey);
  expect(monday.textContent).not.toContain('duplicate key value');
});

test('Adult Lunch URL imports save directly to its selection library', async () => {
  mockInvoke.mockResolvedValue({data: {ok:true, destination:'library', updatedExisting:false, alreadyQueued:false, recipe:{title:'Tomato Wrap'}}, error: null});
  await render('lunch');
  await change('Recipe URL to import', 'https://example.com/tomato-wrap');
  await click(button('Import recipe'));
  expect(mockInvoke).toHaveBeenCalledWith('meal-recipe-intake', {body: {url:'https://example.com/tomato-wrap', destination:'library', mealType:'lunch'}});
  expect(button('Save to library')).toBeUndefined();
});

test('Kids Lunch URL imports use the independent Kids queue', async () => {
  mockInvoke.mockResolvedValue({data: {ok:true, destination:'queue', dayNumber:3, updatedExisting:false, alreadyQueued:false, recipe:{title:'Lunchbox Pasta'}}, error: null});
  await render('kids_lunch');
  await change('Recipe URL to import', 'https://example.com/lunchbox-pasta');
  await click(button('Import recipe'));
  expect(mockInvoke).toHaveBeenCalledWith('meal-recipe-intake', {body: {url:'https://example.com/lunchbox-pasta', destination:'queue', weekOf:'kids-lunch-capsule', mealType:'kids_lunch'}});
});

test('browser navigation does not discard an unsaved Breakfasts draft', async () => {
  await act(async () => { root.render(<MealPlanner/>); });
  await click(container.querySelector('[aria-label="Open Breakfasts planner"]'));
  await change('Day 1 meal title', 'Porridge draft');
  window.confirm.mockReturnValue(false);
  await act(async () => { window.history.pushState({}, '', '#meal-planner'); window.dispatchEvent(new Event('hashchange')); });
  expect(window.location.hash).toBe('#meal-planner/breakfasts');
  expect(container.querySelector('[aria-label="Day 1 meal title"]').value).toBe('Porridge draft');
});

test('Breakfasts has its own persistent category rotation and recipe tables', async () => {
  library = [{...sample(1), recipe_key:recipeKey(sample(1)), has_been_cooked:false, is_deleted:false}];
  breakfastLibrary = [{...sample(2), recipe_key:recipeKey(sample(2)), has_been_cooked:false, is_deleted:false}];
  await render('breakfast');
  expect(mockFrom).toHaveBeenCalledWith('breakfast_weekly_meals');
  expect(mockFrom).toHaveBeenCalledWith('breakfast_recipe_library');
  expect(mockFrom).toHaveBeenCalledWith('breakfast_recipe_queue');
  expect(mockFrom).not.toHaveBeenCalledWith('meal_recipe_library');
  expect(container.querySelector('#recipe-library').textContent).toContain('Recipe 2');
  expect(container.querySelector('#recipe-library').textContent).not.toContain('Recipe 1');
  expect(day(8).textContent).toContain('Savory');
  expect(container.querySelectorAll('[aria-label$=" meal title"]')).toHaveLength(11);
  expect(container.querySelectorAll('.breakfastDayGroup, .cerealDay, .meal:not(.breakfastAudienceMeal)')).toHaveLength(7);
  expect(container.querySelectorAll('.breakfastDayGroup')).toHaveLength(5);
  expect(container.querySelectorAll('.breakfastAudienceMeal')).toHaveLength(10);
  expect([...container.querySelectorAll('.breakfastDayGroup')].find(group => group.querySelector('.dayHeading').textContent === 'Friday').textContent).toContain('Kids · Cereal');
  expect([...container.querySelectorAll('.breakfastDayGroup > .mealSummary > .dayHeading')].map(node => node.textContent)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  expect([...container.querySelectorAll('.breakfastDayGroup:first-of-type .breakfastAudienceMeal .dayHeading')].map(node => node.textContent)).toEqual(['Adults', 'Kids']);
  expect([...container.querySelectorAll('.meal:not(.breakfastAudienceMeal) > .mealSummary .dayHeading')].map(node => node.textContent)).toEqual(['Saturday', 'Sunday']);
  expect(container.querySelector('.weekNav')).toBeNull();
  expect(container.textContent).not.toContain('Six rotating breakfast queues');
  expect(container.textContent).not.toContain('Queue choices follow your day categories');
  expect(button('Save to library')).toBeUndefined();
  expect(button('Generate grocery list').disabled).toBe(false);
  expect(container.querySelector('[aria-label="Day 8 scheduled date"]').value).toBeTruthy();
  await change('Day 8 meal title', 'Savory eggs'); await change('Day 8 source', 'Family notebook'); await change('Day 8 recipe tags', 'savory');
  await click(button('Save meal', day(8)));
  expect(writes.find(write => write.table === 'breakfast_weekly_meals' && write.value?.title === 'Savory eggs')?.value.scheduled_for).toBe(container.querySelector('[aria-label="Day 8 scheduled date"]').value);
  expect(writes.find(write => write.table === 'breakfast_recipe_tags')).toBeTruthy();
  expect(writes.find(write => write.table === 'weekly_meals')).toBeUndefined();
});

test('Breakfast URL imports are scoped to Breakfasts', async () => {
  mockInvoke.mockResolvedValue({data: {ok:true, destination:'queue', dayNumber:1, updatedExisting:false, alreadyQueued:false, recipe:{title:'Oat Pancakes'}}, error: null});
  await render('breakfast');
  await change('Recipe URL to import', 'https://example.com/oat-pancakes');
  await click(button('Import recipe'));
  expect(mockInvoke).toHaveBeenCalledWith('meal-recipe-intake', {body: {url:'https://example.com/oat-pancakes', destination:'queue', weekOf:'breakfast-capsule', mealType:'breakfast'}});
});

test('Breakfasts fills from its own queue and saves its own category changes', async () => {
  breakfastQueue = [{...sample(3), id:'breakfast-q1', day_number:2, position:1, created_at:'2026-09-20T08:00:00Z'}];
  breakfastTagRows = [{recipe_key:recipeKey(sample(3)), tags:['pancake']}];
  await render('breakfast');
  expect(container.querySelector('[aria-label="Day 2 meal title"]').value).toBe('Recipe 3');
  expect(writes.find(write => write.table === 'breakfast_weekly_meals' && write.value?.queue_item_id === 'breakfast-q1' && write.value.week_of === 'breakfast-capsule')).toBeTruthy();
  expect(writes.find(write => write.table === 'weekly_meals')).toBeUndefined();
  await click(button('Edit categories'));
  await change('Day 2 accepted tags', 'pancake, crepe');
  await click(button('Save day categories'));
  expect(writes.find(write => write.table === 'breakfast_day_categories' && write.value?.find(category => category.day_number === 2)?.accepted_tags?.includes('crepe'))).toBeTruthy();
  expect(writes.find(write => write.table === 'meal_day_categories')).toBeUndefined();
});

test('marking breakfast made rotates it and preserves a permanent tried status', async () => {
  const first = {...sample(21), week_of:'breakfast-capsule', meal_number:2, queue_item_id:'breakfast-q1'};
  const second = {...sample(22), day_number:2, position:2, id:'breakfast-q2', created_at:'2026-09-20T09:00:00Z'};
  breakfastCurrent = [first];
  breakfastQueue = [{...first, id:'breakfast-q1', day_number:2, position:1, created_at:'2026-09-20T08:00:00Z'}, second];
  breakfastTagRows = [first, second].map(row => ({recipe_key:recipeKey(row), tags:['pancake']}));
  await render('breakfast');
  await click(button('Made · rotate', day(2)));
  expect(day(2).textContent).toContain('Recipe 22');
  expect(writes).toContainEqual({table:'breakfast_recipe_queue', update:{field:'id', value:'breakfast-q1', payload:{position:3}}});
  expect(writes.find(write => write.table === 'breakfast_weekly_meals' && write.value?.queue_item_id === 'breakfast-q2' && write.value.week_of === 'breakfast-capsule')).toBeTruthy();
  expect(writes.find(write => write.table === 'breakfast_recipe_library').value).toMatchObject({has_been_cooked:true});
  expect(container.querySelector('#recipe-library').textContent).toContain('✓ Tried');
});

test('skipping breakfast rotates it without marking an untried recipe as tried', async () => {
  const first = {...sample(51), week_of:'breakfast-capsule', meal_number:2, queue_item_id:'breakfast-q1'};
  const second = {...sample(52), day_number:2, position:2, id:'breakfast-q2', created_at:'2026-09-20T09:00:00Z'};
  breakfastCurrent = [first];
  breakfastQueue = [{...first, id:'breakfast-q1', day_number:2, position:1, created_at:'2026-09-20T08:00:00Z'}, second];
  breakfastTagRows = [first, second].map(row => ({recipe_key:recipeKey(row), tags:['pancake']}));
  await render('breakfast');
  await click(button('Skip · rotate', day(2)));
  expect(day(2).textContent).toContain('Recipe 52');
  expect(writes.find(write => write.table === 'breakfast_recipe_library').value).toMatchObject({has_been_cooked:false});
  expect(container.querySelector('#recipe-library').textContent).toContain('Not tried yet');
});

test('pausing a breakfast clears the day without removing or rotating its queue', async () => {
  const sunday = {...sample(61), week_of:'breakfast-capsule', meal_number:11, queue_item_id:'breakfast-q-sunday'};
  breakfastCurrent = [sunday];
  breakfastQueue = [{...sunday, id:'breakfast-q-sunday', day_number:11, position:1, created_at:'2026-09-20T08:00:00Z'}];
  await render('breakfast');
  const sundayCard = day(11);
  await click(button('Pause queue', sundayCard));
  expect(writes).toContainEqual({table:'breakfast_day_categories', update:{field:'day_number', value:11, payload:{is_paused:true}}});
  expect(writes).toContainEqual({table:'breakfast_weekly_meals', delete:{field:'id', value:'meal-61', payload:undefined}});
  expect(writes.find(write => write.table === 'breakfast_recipe_queue' && write.delete)).toBeUndefined();
  expect(sundayCard.textContent).toContain('Queue paused');
  expect(sundayCard.textContent).toContain('Recipe 61 is still first in this queue');
  await click(button('Resume queue', sundayCard));
  expect(writes).toContainEqual({table:'breakfast_day_categories', update:{field:'day_number', value:11, payload:{is_paused:false}}});
  expect(writes.find(write => write.table === 'breakfast_weekly_meals' && write.value?.queue_item_id === 'breakfast-q-sunday')).toBeTruthy();
});

test('a paused breakfast stays blank on reload even when its queue has recipes', async () => {
  breakfastCategories[10].is_paused = true;
  breakfastQueue = [{...sample(62), id:'breakfast-q-paused', day_number:11, position:1, created_at:'2026-09-20T08:00:00Z'}];
  await render('breakfast');
  expect(container.textContent).toContain('Queue paused');
  expect(writes.find(write => write.table === 'breakfast_weekly_meals' && write.value?.queue_item_id === 'breakfast-q-paused')).toBeUndefined();
});

test('an already empty breakfast day can be paused before anything fills it', async () => {
  await render('breakfast');
  const sundayCard = day(11);
  expect(button('Pause queue', sundayCard).disabled).toBe(false);
  await click(button('Pause queue', sundayCard));
  expect(writes).toContainEqual({table:'breakfast_day_categories', update:{field:'day_number', value:11, payload:{is_paused:true}}});
  expect(sundayCard.textContent).toContain('Queue paused');
  expect(button('Resume queue', sundayCard)).toBeTruthy();
});

test('queue status recognises a recipe by source when a stale queue title differs', async () => {
  const libraryRecipe = {...sample(63), title:'Updated breakfast title', source_ref:'Manual entry: Alba', recipe_key:recipeKey({title:'Updated breakfast title', source_ref:'Manual entry: Alba'}), has_been_cooked:true, is_deleted:false};
  breakfastLibrary = [libraryRecipe];
  breakfastQueue = [{...sample(63), id:'breakfast-q-existing', title:'Old breakfast title', source_ref:'Manual entry: Alba', day_number:8, position:1, created_at:'2026-09-20T08:00:00Z'}];
  await render('breakfast');
  const card = [...container.querySelectorAll('#recipe-library .recipeCard')].find(node => node.textContent.includes('Updated breakfast title'));
  expect(card.textContent).toContain('Queued · Day 8');
  expect(button('Remove from queue', card).disabled).toBe(false);
});

test('breakfast grocery lists use the scheduled recipes that already have ingredients', async () => {
  const pancake = {...sample(41), week_of:'breakfast-capsule', meal_number:2};
  breakfastCurrent = [pancake];
  breakfastTagRows = [{recipe_key:recipeKey(pancake), tags:['pancake']}];
  await render('breakfast');
  expect(button('Generate grocery list').disabled).toBe(false);
  await click(button('Generate grocery list'));
  expect(container.querySelector('#grocery').textContent).toContain('carrot, 1');
});

test('grocery quantities scale from recipe yield to the servings needed for a scheduled meal', async () => {
  const pancake = {...sample(71), week_of:'breakfast-capsule', meal_number:2, servings:2, ingredients:[{name:'flour', qty:200, unit:'g'}]};
  breakfastCurrent = [pancake];
  breakfastLibrary = [{...pancake, recipe_key:recipeKey(pancake), servings:4, has_been_cooked:false, is_deleted:false}];
  breakfastTagRows = [{recipe_key:recipeKey(pancake), tags:['pancake']}];
  await render('breakfast');
  expect(container.querySelector('[aria-label="Day 2 servings needed"]').value).toBe('2');
  await click(button('Generate grocery list'));
  expect(container.querySelector('#grocery').textContent).toContain('flour, 100 g');
});

test('manual breakfast recipes have one save action and always enter a queue', async () => {
  await render('breakfast');
  await click(button('Add manually'));
  const modal = document.body.querySelector('[aria-label="Add a recipe manually"]');
  expect(button('Save to library', modal)).toBeUndefined();
  expect(button('Save & queue', modal)).toBeUndefined();
  await change('Manual recipe title', 'Sunday Toast');
  await change('Manual recipe URL or source', 'Family notebook');
  await change('Manual recipe tags', 'weekend');
  await change('Manual recipe ingredients', '2 slices bread');
  await click(button('Save recipe', modal));
  expect(writes.find(write => write.table === 'breakfast_recipe_library' && write.value?.title === 'Sunday Toast')).toBeTruthy();
  expect(writes.find(write => write.table === 'breakfast_recipe_queue' && write.insert?.title === 'Sunday Toast')).toBeTruthy();
});

test('new breakfast recipes enter before the last rotated recipe', async () => {
  const currentRecipe = {...sample(31), week_of:'breakfast-capsule', meal_number:2, queue_item_id:'breakfast-q-current'};
  const newRecipe = {...sample(32), recipe_key:recipeKey(sample(32)), has_been_cooked:false, is_deleted:false};
  breakfastCurrent = [currentRecipe];
  breakfastQueue = [{...currentRecipe, id:'breakfast-q-current', day_number:2, position:1, created_at:'2026-09-20T08:00:00Z'}];
  breakfastLibrary = [newRecipe];
  breakfastTagRows = [currentRecipe, newRecipe].map(row => ({recipe_key:recipeKey(row), tags:['pancake']}));
  await render('breakfast');
  await click(button('Send to queue'));
  expect(writes).toContainEqual({table:'breakfast_recipe_queue', update:{field:'id', value:'breakfast-q-current', payload:{position:2}}});
  expect(writes.find(write => write.table === 'breakfast_recipe_queue' && write.insert?.title === 'Recipe 32')).toMatchObject({insert:{day_number:2,position:1}});
});

test('weekend-tagged breakfasts are assigned and scheduled on a weekend day', async () => {
  const random = jest.spyOn(Math, 'random').mockReturnValue(0);
  const recipe = {...sample(33), recipe_key:recipeKey(sample(33)), has_been_cooked:false, is_deleted:false};
  breakfastLibrary = [recipe];
  breakfastTagRows = [{recipe_key:recipe.recipe_key, tags:['weekend']}];
  await render('breakfast');
  await click(button('Send to queue'));
  expect(writes.find(write => write.table === 'breakfast_recipe_queue' && write.insert?.title === 'Recipe 33')).toMatchObject({insert:{day_number:10}});
  expect(writes.find(write => write.table === 'breakfast_weekly_meals' && write.value?.meal_number === 10 && write.value?.title === 'Recipe 33')).toBeTruthy();
  random.mockRestore();
});

test('breakfast rules select Kids independently while unmatched recipes use a blank Adults slot', async () => {
  const random = jest.spyOn(Math, 'random').mockReturnValue(0);
  breakfastLibrary = [{...sample(23), recipe_key:recipeKey(sample(23)), has_been_cooked:false, is_deleted:false}];
  await render('breakfast');
  await click(button('Send to queue'));
  expect(writes.find(write => write.table === 'breakfast_recipe_queue' && write.insert?.title === 'Recipe 23')).toMatchObject({insert:{day_number:1}});
  expect(writes.find(write => write.table === 'breakfast_weekly_meals' && write.value?.meal_number === 1)).toBeTruthy();
  random.mockRestore();
});

test('blocks a mismatched meal and saves normalized tags with a matching meal', async () => {
  await render();
  await change('Day 4 meal title', 'Stew'); await change('Day 4 source', 'Book p.12');
  expect(button('Save meal', day(4)).disabled).toBe(true);
  await change('Day 4 recipe tags', ' SLOW COOKER, dinner ');
  expect(button('Save meal', day(4)).disabled).toBe(false);
  await click(button('Save meal', day(4)));
  expect(writes).toHaveLength(2);
  expect(writes[0].value.tags).toEqual(['slow cooker', 'dinner']);
  expect(writes[1].value).toMatchObject({meal_number: 4, title: 'Stew', source_ref: 'Book p.12'});
  expect(day(4).textContent).toContain('Saved');
});

test('grocery generation includes valid saved recipes after category edits', async () => {
  current = Array.from({length:7}, (_,i) => sample(i+1));
  tagRows = [current[3], current[5]].map(m => ({recipe_key: recipeKey(m), tags: m.meal_number === 4 ? ['instant pot'] : ['soup']}));
  await render();
  expect(button('Generate grocery list').disabled).toBe(false);
  await click(button('Edit categories'));
  await change('Day 1 accepted tags', 'soup');
  await click(button('Save day categories'));
  expect(button('Generate grocery list').disabled).toBe(false);
  expect(day(1).textContent).toContain('Add a recipe tagged soup');
});

test('day categories are edited in a modal instead of taking space on the planner', async () => {
  await render();
  expect(container.querySelector('#day-categories')).toBeNull();
  expect(container.textContent).not.toContain('Day 1 · Pasta Thursday');
  await click(button('Edit categories'));
  const modal = document.body.querySelector('[aria-label="Edit day categories"]');
  expect(modal).not.toBeNull();
  expect(modal.querySelectorAll('.categoryCard')).toHaveLength(7);
  await click(modal.querySelector('[aria-label="Close categories"]'));
  expect(document.body.querySelector('[aria-label="Edit day categories"]')).toBeNull();
});

test('Use recipe automatically selects a matching empty category without queueing it', async () => {
  past = [sample(1)];
  await render();
  await change('Tags for Recipe 1', 'soup');
  expect(button('Use recipe').disabled).toBe(true);
  expect(button('Save tags')).toBeUndefined();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 700)); });
  expect(container.querySelector('#recipe-library').textContent).toContain('Tags saved');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1700)); });
  expect(container.querySelector('#recipe-library').textContent).not.toContain('Tags saved');
  expect(container.querySelector('[aria-label="Destination for Recipe 1"]')).toBeNull();
  await click(button('Use recipe'));
  expect(writes[writes.length - 1].value).toMatchObject({meal_number: 6, title: 'Recipe 1'});
  expect(container.querySelector('[aria-label="Day 6 recipe tags"]').value).toBe('soup');
  expect(writes.find(write => write.table === 'meal_recipe_queue' && write.insert)).toBeUndefined();
});

test('Use recipe falls back to a random empty day when no category matches', async () => {
  const random = jest.spyOn(Math, 'random').mockReturnValue(0);
  library = [{...sample(1), recipe_key:recipeKey(sample(1)), has_been_cooked:false, is_deleted:false}];
  tagRows = [{recipe_key:recipeKey(sample(1)), tags:['fish']}];
  await render();
  await click(button('Use recipe', container.querySelector('#recipe-library')));
  expect(container.querySelector('[aria-label="Day 1 meal title"]').value).toBe('Recipe 1');
  expect(writes.find(write => write.table === 'meal_recipe_queue' && write.insert)).toBeUndefined();
  random.mockRestore();
});

test('using one recipe leaves other library cards interactive while its save is pending', async () => {
  library = [1, 2].map(n => ({...sample(n), recipe_key:recipeKey(sample(n)), has_been_cooked:false, is_deleted:false}));
  await render();
  deferWeeklyWrite = true;
  const cards = [...container.querySelectorAll('#recipe-library .recipeCard')];
  await act(async () => { button('Use recipe', cards[0]).click(); await Promise.resolve(); });
  expect(button('Adding…', cards[0]).disabled).toBe(true);
  expect(button('Use recipe', cards[1]).disabled).toBe(false);
  expect(button('View recipe', cards[1]).disabled).toBe(false);
  await act(async () => resolveWeeklyWrite());
  expect(button('Use recipe', cards[0]).disabled).toBe(false);
});

test('Use recipe shows an error popup when every day already has a meal', async () => {
  current = Array.from({length:7}, (_, index) => sample(index + 1));
  library = [{...sample(8), recipe_key:recipeKey(sample(8)), has_been_cooked:false, is_deleted:false}];
  await render();
  await click(button('Use recipe', [...container.querySelectorAll('#recipe-library .recipeCard')].find(card => card.textContent.includes('Recipe 8'))));
  expect(document.body.textContent).toContain('All days already have an assigned meal. Clear a day if you want to use this recipe.');
  expect(writes.find(write => write.table === 'weekly_meals' && write.value?.title === 'Recipe 8')).toBeUndefined();
});

test('week days are collapsed summaries with the recipe name visible', async () => {
  current = [sample(1)];
  library = [{...sample(1), recipe_key:recipeKey(sample(1)), has_been_cooked:false, is_deleted:false}];
  await render();
  expect(day(1).tagName).toBe('DETAILS');
  expect(day(1).open).toBe(false);
  expect(day(1).querySelector('summary').textContent).toContain('Recipe 1');
  expect(day(2).querySelector('summary').textContent).toContain('Empty');
  await click(day(1).querySelector('summary'));
  expect(day(1).open).toBe(true);
  expect(button('Review ingredients', day(1))).toBeUndefined();
  expect(button('Extract ingredients', day(1))).toBeUndefined();
  await click(button('View recipe', day(1)));
  expect(document.body.querySelector('[aria-label="Recipe details for Recipe 1"]')).not.toBeNull();
});

test('failed saves retain edits and display a retryable error', async () => {
  await render(); await change('Day 1 meal title', 'Pasta'); await change('Day 1 source', 'Book');
  failure = 'Connection lost'; await click(button('Save meal', day(1)));
  expect(day(1).textContent).toContain('Connection lost');
  expect(day(1).textContent).toContain('Unsaved changes');
  expect(container.querySelector('[aria-label="Day 1 meal title"]').value).toBe('Pasta');
});

test('load errors do not leave an editable planner with missing category rules', async () => {
  failure = 'Cannot load categories'; await render();
  expect(container.querySelector('[role="alert"]').textContent).toContain(failure);
  expect(button('Generate grocery list').disabled).toBe(true);
  expect(container.querySelectorAll('.meal')).toHaveLength(0);
});


test('marking dinner cooked banks it, moves it to the queue tail, and schedules the next recipe in the following week', async () => {
  const first = {...sample(1, ['pasta']), servings:2, queue_item_id:'dinner-q1'};
  const second = {...sample(2), id:'dinner-q2', day_number:1, position:2, created_at:'2026-09-10T09:00:00Z'};
  current = [first];
  queue = [{...first, id:'dinner-q1', day_number:1, position:1, created_at:'2026-09-10T08:00:00Z'}, second];
  library = [{...sample(1), recipe_key:recipeKey(sample(1)), servings:4, has_been_cooked:false, is_deleted:false}];
  tagRows = [{recipe_key:recipeKey(first), tags:['pasta']}, {recipe_key:recipeKey(second), tags:['pasta']}];
  await render();
  await click(button('Mark cooked', day(1)));
  expect(writes.find(write => write.table === 'meal_recipe_library').value).toMatchObject({title: 'Recipe 1', source_ref: 'Book 1', servings:4, has_been_cooked: true, is_deleted: false});
  expect(writes).toContainEqual({table: 'weekly_meals', delete: {field: 'id', value: 'meal-1', payload: undefined}});
  expect(writes).toContainEqual({table:'meal_recipe_queue', update:{field:'id', value:'dinner-q1', payload:{position:3}}});
  const nextDinner = writes.find(write => write.table === 'weekly_meals' && write.value?.queue_item_id === 'dinner-q2');
  expect(nextDinner?.value).toMatchObject({title:'Recipe 2', meal_number:1, week_of:weekAfterToday()});
  expect(container.querySelector('#recipe-library').textContent).toContain('Recipe 1');
});

test('marking an unqueued dinner cooked adds it to the rotation instead of losing it', async () => {
  current = [{...sample(1), servings:2}];
  library = [{...sample(1), recipe_key:recipeKey(sample(1)), servings:2, has_been_cooked:false, is_deleted:false}];
  tagRows = [{recipe_key:recipeKey(sample(1)), tags:['pasta']}];
  await render();
  await click(button('Mark cooked', day(1)));
  expect(writes.find(write => write.table === 'meal_recipe_queue' && write.insert)).toMatchObject({insert:{title:'Recipe 1', day_number:1, position:1}});
  expect(writes.find(write => write.table === 'weekly_meals' && write.value?.title === 'Recipe 1' && write.value?.week_of === weekAfterToday())).toBeTruthy();
});

test('touchscreen recipe cards keep Delete tappable without enabling native drag', async () => {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = jest.fn(() => ({matches:true, addEventListener:jest.fn(), removeEventListener:jest.fn()}));
  library = [{...sample(1), recipe_key:recipeKey(sample(1)), has_been_cooked:false, is_deleted:false}];
  await render();
  const card = container.querySelector('#recipe-library .recipeCard');
  expect(card.draggable).toBe(false);
  await click(button('Delete', card));
  expect(container.querySelector('#recipe-library').textContent).not.toContain('Recipe 1');
  window.matchMedia = originalMatchMedia;
});

test('library recipes are searchable and can be dragged onto a matching empty day', async () => {
  const cooked = {...sample(1), recipe_key: recipeKey(sample(1)), cooked_at: '2026-09-10T20:00:00Z', has_been_cooked: true, is_deleted: false};
  library = [cooked];
  tagRows = [{recipe_key: cooked.recipe_key, tags: ['soup']}];
  await render();
  await change('Search recipe library', 'soup');
  const card = container.querySelector('#recipe-library .recipeCard');
  expect(card).not.toBeNull();
  const transfer = { values: {}, setData(type, value) { this.values[type] = value; }, getData(type) { return this.values[type] || ''; }, effectAllowed: '', dropEffect: '' };
  await act(async () => { Simulate.dragStart(card, {dataTransfer: transfer}); });
  await act(async () => { Simulate.dragOver(day(6), {dataTransfer: transfer}); Simulate.drop(day(6), {dataTransfer: transfer}); });
  expect(writes[writes.length - 1].value).toMatchObject({meal_number: 6, title: 'Recipe 1'});
  expect(container.querySelector('[aria-label="Day 6 recipe tags"]').value).toBe('soup');
});

test('recipe library combines current, past, queued, and cooked recipes without duplicates', async () => {
  const duplicate = {...sample(1), recipe_key: recipeKey(sample(1)), cooked_at: '2026-09-10T20:00:00Z'};
  current = [sample(1)];
  past = [sample(2), sample(1)];
  queue = [{...sample(3), id:'q3', day_number:3, position:1, created_at:'2026-09-11T08:00:00Z'}];
  library = [duplicate, {...sample(4), recipe_key: recipeKey(sample(4)), cooked_at: '2026-09-09T20:00:00Z'}];
  await render();
  const recipeLibrary = container.querySelector('#recipe-library');
  expect(recipeLibrary).not.toBeNull();
  expect(recipeLibrary.querySelectorAll('.recipeCard')).toHaveLength(4);
  expect([...recipeLibrary.querySelectorAll('.recipeCard')].filter(card => card.textContent.includes('Recipe 1'))).toHaveLength(1);
  expect(container.textContent).not.toContain('Past weeks');
  expect([...container.querySelectorAll('h2')].map(heading => heading.textContent)).not.toContain('Cooked recipes');
});

test('library cards show scheduled and queued day indicators', async () => {
  current = [sample(1)];
  queue = [{...sample(2), id:'q2', day_number:1, position:1, created_at:'2026-09-11T08:00:00Z'}];
  await render();
  const cards = [...container.querySelectorAll('#recipe-library .recipeCard')];
  const scheduled = cards.find(card => card.textContent.includes('Recipe 1'));
  const queued = cards.find(card => card.textContent.includes('Recipe 2'));
  expect(scheduled.textContent).toContain('Scheduled · Day 1');
  expect(scheduled.textContent).not.toContain('Queued ·');
  expect(queued.textContent).toContain('Queued · Day 1');
  expect(queued.textContent).not.toContain('Scheduled ·');
});

test('a library recipe can be sent to its matching queue and fills a blank day', async () => {
  const soup = {...sample(1), recipe_key:recipeKey(sample(1)), has_been_cooked:false, is_deleted:false};
  library = [soup];
  tagRows = [{recipe_key:soup.recipe_key, tags:['soup']}];
  await render();
  const card = container.querySelector('#recipe-library .recipeCard');
  await click(button('Send to queue', card));
  const queueWrite = writes.find(write => write.table === 'meal_recipe_queue' && write.insert);
  expect(queueWrite.insert).toMatchObject({day_number:6, position:1, title:'Recipe 1'});
  expect(container.querySelector('[aria-label="Day 6 meal title"]').value).toBe('Recipe 1');
  expect(card.textContent).toContain('Queued · Day 6');
  expect(button('Remove from queue', card).disabled).toBe(false);
});

test('rapid repeated Send to queue clicks create only one queue entry', async () => {
  const soup = {...sample(1), recipe_key:recipeKey(sample(1)), has_been_cooked:false, is_deleted:false};
  library = [soup];
  tagRows = [{recipe_key:soup.recipe_key, tags:['soup']}];
  await render();
  const send = button('Send to queue', container.querySelector('#recipe-library .recipeCard'));
  await act(async () => { send.click(); send.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(writes.filter(write => write.table === 'meal_recipe_queue' && write.insert)).toHaveLength(1);
});

test('queue membership recognises tracking variants of the same recipe URL', async () => {
  const recipe = {...sample(1), source_ref:'https://Example.com/recipe/', recipe_key:'stable-recipe', has_been_cooked:false, is_deleted:false};
  library = [recipe];
  queue = [{...recipe, source_ref:'https://example.com/recipe?utm_source=newsletter#method', id:'tracked-q1', day_number:2, position:1, created_at:'2026-09-27T08:00:00Z'}];
  tagRows = [{recipe_key:recipe.recipe_key, tags:[]}];
  await render();
  const card = container.querySelector('#recipe-library .recipeCard');
  expect(card.textContent).toContain('Queued · Day 2');
  expect(button('Remove from queue', card)).toBeTruthy();
  expect(container.querySelectorAll('#recipe-library .recipeCard')).toHaveLength(1);
});

test('legacy queue rows without a source still match their library recipe by title', async () => {
  const recipe = {...sample(1), source_ref:'Family notebook', recipe_key:'stable-manual-recipe', has_been_cooked:false, is_deleted:false};
  library = [recipe];
  queue = [{...recipe, source_ref:'', id:'legacy-q1', day_number:3, position:1, created_at:'2026-09-27T08:00:00Z'}];
  tagRows = [{recipe_key:recipe.recipe_key, tags:[]}];
  await render();
  const cards = container.querySelectorAll('#recipe-library .recipeCard');
  expect(cards).toHaveLength(1);
  expect(cards[0].textContent).toContain('Queued · Day 3');
  expect(button('Remove from queue', cards[0])).toBeTruthy();
});

test('a saved meal can be unscheduled and remains in the recipe library', async () => {
  current = [sample(1)];
  await render();
  await click(button('Unschedule', day(1)));
  expect(writes.find(write => write.table === 'meal_recipe_library').value).toMatchObject({
    title: 'Recipe 1', source_ref: 'Book 1', has_been_cooked: false, is_deleted: false,
  });
  expect(writes).toContainEqual({table: 'weekly_meals', delete: {field: 'id', value: 'meal-1', payload: undefined}});
  expect(container.querySelector('[aria-label="Day 1 meal title"]').value).toBe('');
  expect(container.querySelector('#recipe-library').textContent).toContain('Recipe 1');
});

test('dragging a scheduled meal to the library unschedules it', async () => {
  current = [sample(1)];
  await render();
  const transfer = { values: {}, setData(type, value) { this.values[type] = value; }, getData(type) { return this.values[type] || ''; }, effectAllowed: '', dropEffect: '' };
  const dragHandle = [...day(1).querySelectorAll('[draggable="true"]')].find(el => el.textContent === 'Drag to library');
  const recipeLibrary = container.querySelector('#recipe-library');
  await act(async () => { Simulate.dragStart(dragHandle, {dataTransfer: transfer}); });
  expect(recipeLibrary.className).toContain('libraryDropReady');
  await act(async () => { Simulate.dragOver(recipeLibrary, {dataTransfer: transfer}); Simulate.drop(recipeLibrary, {dataTransfer: transfer}); });
  expect(writes).toContainEqual({table: 'weekly_meals', delete: {field: 'id', value: 'meal-1', payload: undefined}});
  expect(container.querySelector('[aria-label="Day 1 meal title"]').value).toBe('');
  expect(recipeLibrary.textContent).toContain('Recipe 1');
});

test('unscheduling a queued meal removes it from the queue and fills the day with the next recipe', async () => {
  const first = {...sample(2), id:'q1', day_number:2, position:1, created_at:'2026-09-11T08:00:00Z'};
  const second = {...sample(3), id:'q2', day_number:2, position:2, created_at:'2026-09-11T09:00:00Z'};
  queue = [first, second];
  current = [{...first, id:'meal-2', meal_number:2, queue_item_id:'q1', is_override:false, override_type:null}];
  await render();
  await click(button('Unschedule', day(2)));
  expect(writes).toContainEqual({table: 'meal_recipe_queue', delete: {field: 'id', value: 'q1', payload: undefined}});
  expect(container.querySelector('[aria-label="Day 2 meal title"]').value).toBe('Recipe 3');
  expect(container.querySelector('#recipe-library').textContent).toContain('Recipe 2');
});

test('imports a URL with AI details, assigns a queue, and fills its blank day', async () => {
  mockInvoke.mockResolvedValue({data: {ok:true, destination:'queue', dayNumber:1, alreadyQueued:false, updatedExisting:false, recipe:{title:'Lemony Pasta'}}, error: null});
  await render();
  await change('Recipe URL to import', 'https://example.com/pasta');
  await click(button('Import & queue'));
  expect(mockInvoke).toHaveBeenCalledWith('meal-recipe-intake', {body: {url:'https://example.com/pasta', destination:'queue', weekOf:expect.stringMatching(/^\d{4}-W\d{2}$/), mealType:'dinner'}});
  expect(document.body.textContent).toContain('Lemony Pasta added to Monday queue');
  expect(writes.find(write => write.table === 'meal_recipe_queue' && write.insert)).toBeUndefined();
});

test('imports a URL directly to the library without scheduling it', async () => {
  mockInvoke.mockResolvedValue({data: {ok:true, destination:'library', updatedExisting:false, alreadyQueued:false, recipe:{title:'Library Pasta'}}, error: null});
  await render();
  await change('Recipe URL to import', 'https://example.com/library-pasta');
  await click(button('Save to library'));
  expect(mockInvoke).toHaveBeenCalledWith('meal-recipe-intake', {body: {url:'https://example.com/library-pasta', destination:'library', weekOf:expect.any(String), mealType:'dinner'}});
  expect(document.body.textContent).toContain('Library Pasta saved to your library');
  expect(writes.find(write => write.table === 'meal_recipe_library')).toBeUndefined();
  expect(writes.find(write => write.table === 'meal_recipe_queue' && write.insert)).toBeUndefined();
});

test('adds a manual recipe to the library from the recipe details modal', async () => {
  await render();
  await click(button('Add manually'));
  const modal = document.body.querySelector('[aria-label="Add a recipe manually"]');
  expect(modal).not.toBeNull();
  await change('Manual recipe title', 'Family Pie');
  await change('Manual recipe URL or source', 'Grandma’s notebook');
  await change('Manual recipe tags', 'pie, family');
  await change('Manual recipe servings', '6');
  await change('Manual recipe ingredients', '2 carrots\n500 g beef');
  await change('Manual recipe method', '1. Assemble.\n2. Bake.');
  await click(button('Save to library', modal));
  expect(writes.find(write => write.table === 'meal_recipe_library' && write.value.title === 'Family Pie')).toMatchObject({value:{source_ref:'Grandma’s notebook', servings:6, method:'1. Assemble.\n2. Bake.', ingredients:[{name:'2 carrots',qty:null,unit:''},{name:'500 g beef',qty:null,unit:''}]}});
  expect(document.body.querySelector('[aria-label="Add a recipe manually"]')).toBeNull();
});

test('adds a manual recipe to its matching queue', async () => {
  categories[0] = {...categories[0], name:'Pasta Thursday', accepted_tags:['pasta']};
  await render();
  await click(button('Add manually'));
  const modal = document.body.querySelector('[aria-label="Add a recipe manually"]');
  await change('Manual recipe title', 'Handwritten Pasta');
  await change('Manual recipe URL or source', 'Recipe card');
  await change('Manual recipe tags', 'pasta');
  await change('Manual recipe servings', '4');
  await change('Manual recipe ingredients', '200 g pasta');
  await change('Manual recipe method', 'Boil until tender.');
  await click(button('Save & queue', modal));
  expect(writes.find(write => write.table === 'meal_recipe_queue' && write.insert)).toMatchObject({insert:{day_number:1,title:'Handwritten Pasta',method:'Boil until tender.',servings:4}});
  expect(container.querySelector('[aria-label="Day 1 meal title"]').value).toBe('Handwritten Pasta');
});

test('library cards open a modal with editable ingredients, source and method, and can be removed', async () => {
  library = [{...sample(1), method:'1. Boil the carrots.', recipe_key:recipeKey(sample(1)), cooked_at:'2026-09-10T20:00:00Z', has_been_cooked:true, is_deleted:false}];
  tagRows = [{recipe_key:recipeKey(sample(1)), tags:['quick']}];
  await render();
  const recipeLibrary = container.querySelector('#recipe-library');
  expect(recipeLibrary.textContent).toContain('✓ Cooked');
  expect(recipeLibrary.textContent).not.toContain('View ingredients');
  expect(recipeLibrary.textContent).not.toContain('carrot · 1');
  await click(button('View recipe', recipeLibrary));
  const details = document.body.querySelector('[aria-label="Recipe details for Recipe 1"]');
  expect(details).not.toBeNull();
  expect(details.querySelector('[aria-label="Ingredient 1 name for Recipe 1"]').value).toBe('carrot');
  expect(details.querySelector('[aria-label="Ingredient 1 quantity for Recipe 1"]').value).toBe('1');
  expect(details.querySelector('[aria-label="Ingredient 1 unit for Recipe 1"]').value).toBe('item');
  expect(details.querySelector('[aria-label="URL or source for Recipe 1"]').value).toBe('Book 1');
  expect(details.querySelector('[aria-label="Method for Recipe 1"]').value).toBe('1. Boil the carrots.');
  expect(details.querySelector('[aria-label="Recipe yield for Recipe 1"]').value).toBe('');
  await change('Tags for Recipe 1 in details', 'quick, soup');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 700)); });
  await change('URL or source for Recipe 1', 'https://example.com/recipe-1');
  await change('Method for Recipe 1', '1. Roast the carrots.');
  await change('Recipe yield for Recipe 1', '5');
  await change('Ingredient 1 name for Recipe 1', 'chopped carrot');
  await change('Ingredient 1 quantity for Recipe 1', '2');
  await change('Ingredient 1 unit for Recipe 1', 'cups');
  await click(button('+ Add ingredient', details));
  await change('Ingredient 2 name for Recipe 1', 'salt');
  await click(details.querySelector('[aria-label="Delete ingredient 2 from Recipe 1"]'));
  await click(button('Save changes', details));
  expect(document.body.querySelector('[aria-label="Recipe details for Recipe 1"]')).toBeNull();
  const editedIngredients = [{name:'chopped carrot', qty:2, unit:'cups'}];
  expect(writes.find(write => write.table === 'meal_recipe_library' && write.value.method === '1. Roast the carrots.' && write.value.servings === 5 && write.value.source_ref === 'https://example.com/recipe-1' && JSON.stringify(write.value.ingredients) === JSON.stringify(editedIngredients))).toBeTruthy();
  expect(writes).toContainEqual({table:'meal_recipe_tags', value:{recipe_key:recipeKey(sample(1)), tags:['quick', 'soup']}});
  expect(writes).toContainEqual({table:'meal_recipe_queue', update:{field:'source_ref', value:'Book 1', payload:{title:'Recipe 1', source_ref:'https://example.com/recipe-1', ingredients:editedIngredients, method:'1. Roast the carrots.', servings:5}}});
  expect(writes).toContainEqual({table:'weekly_meals', update:{field:'source_ref', value:'Book 1', payload:{title:'Recipe 1', source_ref:'https://example.com/recipe-1', ingredients:editedIngredients, method:'1. Roast the carrots.'}}});
  await click(button('Delete', recipeLibrary));
  expect(window.confirm).toHaveBeenCalled();
  expect(writes.find(write => write.table === 'meal_recipe_library' && write.value?.is_deleted)).toBeTruthy();
  expect(recipeLibrary.textContent).not.toContain('Recipe 1');
  expect(writes.find(write => write.table === 'weekly_meals' && write.delete)).toBeUndefined();
});

test('deleting a saved recipe keeps legacy schedule copies out of the library', async () => {
  const source = 'https://example.com/recipe-to-delete';
  past = [{...sample(1), source_ref:`${source}?utm_source=old-plan`, recipe_key:'legacy-schedule-key'}];
  library = [{...sample(1), source_ref:source, recipe_key:'stored-library-key', has_been_cooked:false, is_deleted:false}];
  await render();
  const recipeLibrary = container.querySelector('#recipe-library');
  expect(recipeLibrary.querySelectorAll('.recipeCard')).toHaveLength(1);
  await click(button('Delete', recipeLibrary));
  expect(writes.find(write => write.table === 'meal_recipe_library' && write.value?.recipe_key === 'stored-library-key' && write.value?.is_deleted)).toBeTruthy();
  expect(recipeLibrary.textContent).not.toContain('Recipe 1');
});

test('modal edits recipe tags while showing cooked and schedule status', async () => {
  const recipe = {...sample(1), recipe_key:recipeKey(sample(1)), cooked_at:'2026-09-10T20:00:00Z', has_been_cooked:false, is_deleted:false};
  library = [recipe];
  current = [sample(1)];
  queue = [{...recipe, id:'q1', day_number:2, position:1, created_at:'2026-09-11T08:00:00Z'}];
  tagRows = [{recipe_key:recipe.recipe_key, tags:['pasta', 'vegetarian']}];
  await render();
  const card = container.querySelector('#recipe-library .recipeCard');
  expect(card.textContent).not.toContain('Tags save automatically');
  await click(card.querySelector('[aria-label="Mark as cooked: Recipe 1"]'));
  expect(writes.find(write => write.table === 'meal_recipe_library' && write.value?.has_been_cooked === true)).toBeTruthy();
  await click(button('View recipe', card));
  const modal = document.body.querySelector('[aria-label="Recipe details for Recipe 1"]');
  expect(modal.textContent).toContain('✓ Cooked');
  expect(modal.textContent).toContain('Scheduled · Days 1, 2');
  expect(modal.textContent).toContain('Queued · Day 2');
  expect(modal.querySelector('[aria-label="Tags for Recipe 1 in details"]').value).toBe('pasta, vegetarian');
  await change('Tags for Recipe 1 in details', 'pasta, vegetarian, dinner');
  expect(modal.querySelector('[aria-label="Close recipe details"]').disabled).toBe(true);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 700)); });
  expect(writes.find(write => write.table === 'meal_recipe_tags' && write.value?.tags?.includes('dinner'))).toBeTruthy();
  expect(modal.textContent).toContain('Tags saved');
  expect(card.querySelector('[aria-label="Tags for Recipe 1"]').value).toBe('pasta, vegetarian, dinner');
  expect(card.textContent).not.toContain('Saving soon');
  await click(modal.querySelector('[aria-label="Mark as not cooked yet: Recipe 1"]'));
  expect(writes.find(write => write.table === 'meal_recipe_library' && write.value?.has_been_cooked === false)).toBeTruthy();
  expect(modal.textContent).toContain('Not cooked yet');
  expect(card.textContent).toContain('Not cooked yet');
});

test('queue tags can be edited from queue management', async () => {
  queue = [{...sample(2), id:'q1', day_number:2, position:1, created_at:'2026-09-11T08:00:00Z'}];
  tagRows = [{recipe_key:recipeKey(queue[0]), tags:['quick']}];
  await render(); await click([...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Manage queues')));
  const manager = document.body.querySelector('[aria-label="Manage recipe queues"]');
  await act(async () => { Simulate.change(manager.querySelector('[aria-label="Queue tags for Recipe 2"]'), {target:{value:'quick, pasta'}}); });
  await click(button('Save tags', manager));
  expect(writes.find(write => write.table === 'meal_recipe_tags' && write.value.tags?.includes('pasta'))).toBeTruthy();
});

test('a temporary switch keeps the queued recipe at the front and restores it after cooking', async () => {
  const first = {...sample(2), id:'q1', day_number:2, position:1, created_at:'2026-09-11T08:00:00Z'};
  const second = {...sample(3), id:'q2', day_number:2, position:2, created_at:'2026-09-11T09:00:00Z'};
  queue = [first, second];
  current = [{...first, id:'meal-2', meal_number:2, queue_item_id:'q1', is_override:false, override_type:null}];
  tagRows = [{recipe_key:recipeKey(first), tags:['quick']}, {recipe_key:recipeKey(second), tags:['quick']}];
  await render(); await click(button('Switch', day(2)));
  await act(async () => {
    Simulate.change(document.body.querySelector('[aria-label="Library recipe for switch"]'), {target:{value:recipeKey(second)}});
  });
  await click(button('Switch meal', document.body));
  expect(writes.filter(write => write.table === 'meal_recipe_queue' && write.delete)).toHaveLength(0);
  expect(container.querySelector('[aria-label="Day 2 meal title"]').value).toBe('Recipe 3');
  await click(button('Mark cooked', day(2)));
  expect(container.querySelector('[aria-label="Day 2 meal title"]').value).toBe('Recipe 2');
  expect(writes.filter(write => write.table === 'meal_recipe_queue' && write.delete)).toHaveLength(0);
});

test('Meal Planner landing page shows today at a glance before all five planners', async () => {
  await act(async () => { root.render(<MealPlanner/>); });
  expect(container.querySelector('.todayFood')).not.toBeNull();
  expect(container.querySelector('.todayFood').textContent).toContain('at a glance');
  expect([...container.querySelectorAll('.plannerChoiceTitle')].map(node => node.textContent)).toHaveLength(5);
});

test('day at a glance only shows capsule meals scheduled for the selected calendar date', async () => {
  const today = new Date();
  const nextWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7, 12);
  const iso = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const dayName = nextWeek.toLocaleDateString('en-GB', { weekday: 'long' });
  const slot = BREAKFAST_SLOTS.find(item => item.day_name === dayName);
  breakfastCurrent = [{ ...sample(slot.day_number), title: 'Breakfast for next week', week_of: 'breakfast-capsule', scheduled_for: iso(nextWeek) }];
  breakfastPast = [...breakfastCurrent];
  await act(async () => { root.render(<MealPlanner/>); });
  expect(container.querySelector('.todayFood').textContent).not.toContain('Breakfast for next week');
  await change('Choose date for meal overview', iso(nextWeek));
  expect(container.querySelector('.todayFood').textContent).toContain('Breakfast for next week');
});

test('Dinners uses seven named weekday slots', async () => {
  await render('dinner');
  expect(container.querySelectorAll('[aria-label$=" meal title"]')).toHaveLength(7);
  expect([...container.querySelectorAll('.meal > .mealSummary .dayHeading')].map(node => node.textContent)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
});

test('Dinner queues can be paused without changing their recipes', async () => {
  const queued = {...sample(1), id:'dinner-q1', day_number:1, position:1, created_at:'2026-09-26T08:00:00Z'};
  queue = [queued]; current = [{...queued, id:'dinner-meal-1', meal_number:1, queue_item_id:'dinner-q1'}];
  await render('dinner');
  await click(button('Pause queue', day(1)));
  expect(writes).toContainEqual({table:'meal_day_categories', update:{field:'day_number', value:1, payload:{is_paused:true}}});
  expect(writes.find(write => write.table === 'meal_recipe_queue' && write.delete)).toBeUndefined();
  expect([...container.querySelectorAll('.meal')].find(card => card.querySelector('.dayHeading')?.textContent === 'Monday').textContent).toContain('Queue paused');
});

test('queued library buttons remove and restore queue membership', async () => {
  const recipe = {...sample(1), recipe_key:recipeKey(sample(1)), has_been_cooked:false, is_deleted:false};
  library = [recipe]; queue = [{...recipe, id:'dinner-q1', day_number:1, position:1, created_at:'2026-09-26T08:00:00Z'}];
  await render('dinner');
  const card = container.querySelector('#recipe-library .recipeCard');
  await click(button('Remove from queue', card));
  expect(writes).toContainEqual({table:'meal_recipe_queue', delete:{field:'id', value:'dinner-q1', payload:undefined}});
  expect(card.textContent).toContain('Send to queue');
});

test('recipe titles are editable in View recipe and propagate to scheduled and queued copies', async () => {
  const recipe = {...sample(1), recipe_key:recipeKey(sample(1)), has_been_cooked:false, is_deleted:false, method:''};
  library = [recipe]; queue = [{...recipe, id:'dinner-q1', day_number:1, position:1, created_at:'2026-09-26T08:00:00Z'}]; current = [{...recipe, id:'dinner-meal-1', meal_number:1, queue_item_id:'dinner-q1'}];
  await render('dinner');
  await click(button('View recipe', container.querySelector('#recipe-library')));
  await change('Title for Recipe 1', 'Carrot Supper');
  await click(button('Save changes', document.body));
  expect(writes.find(write => write.table === 'meal_recipe_library' && write.value?.title === 'Carrot Supper')).toBeTruthy();
  expect(writes.find(write => write.table === 'meal_recipe_queue' && write.update?.payload?.title === 'Carrot Supper')).toBeTruthy();
  expect(writes.find(write => write.table === 'weekly_meals' && write.update?.payload?.title === 'Carrot Supper')).toBeTruthy();
});

test('Side Dishes and Treats use the selection-based Prep List framework', async () => {
  await render('sides');
  expect(container.querySelector('.brand').textContent).toContain('Side Dishes & Supporting Acts');
  expect(container.querySelector('.prepRibbon')).not.toBeNull();
  expect(container.querySelector('[aria-label="Filter library by tag"]')).not.toBeNull();
  await render('treats');
  expect(container.querySelector('.brand').textContent).toContain('Treats & Snacks');
  expect(container.querySelector('.prepRibbon')).not.toBeNull();
});

test('a switched library recipe contributes ingredients to the grocery list', async () => {
  const queued = {...sample(1), id:'dinner-q1', day_number:1, position:1, created_at:'2026-09-26T08:00:00Z'};
  const alternative = {...sample(2), recipe_key:recipeKey(sample(2)), ingredients:[{name:'tomato', qty:3, unit:'item'}], has_been_cooked:false, is_deleted:false};
  queue = [queued]; current = [{...queued, id:'dinner-meal-1', meal_number:1, queue_item_id:'dinner-q1'}]; library = [alternative];
  await render('dinner');
  await click(button('Switch', day(1)));
  await act(async () => { Simulate.change(document.body.querySelector('[aria-label="Library recipe for switch"]'), {target:{value:recipeKey(alternative)}}); });
  await click(button('Switch meal', document.body));
  expect(button('Generate grocery list').disabled).toBe(false);
  await click(button('Generate grocery list'));
  expect(container.querySelector('#grocery').textContent).toContain('tomato, 3');
});
