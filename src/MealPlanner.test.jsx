import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import MealPlanner from './MealPlanner';
import { DEFAULT_CATEGORIES, recipeKey } from './mealPlanning';

const mockFrom = jest.fn();
const mockInvoke = jest.fn();
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (...args) => mockFrom(...args), functions: { invoke: (...args) => mockInvoke(...args) } }) }));
let container, root, current, past, library, queue, tagRows, categories, writes, failure;
const sample = (n, tags = []) => ({ id: `meal-${n}`, meal_number: n, title: `Recipe ${n}`, source_ref: `Book ${n}`, week_of: '2026-W36', ingredients: [{name: 'carrot', qty: 1, unit: 'item'}], extracted_at: null, tags });
function setupQueries() {
  let weeklyReadCount = 0;
  mockFrom.mockImplementation(table => {
    if (table === 'weekly_meals') weeklyReadCount += 1;
    let isPast = table === 'weekly_meals' && weeklyReadCount === 2, payload, action = '';
    const query = {
      select: () => query,
      eq: (field, value) => { if (action) writes.push({ table, [action]: { field, value, payload } }); return query; },
      lt: () => { isPast = true; return query; }, order: () => query,
      upsert: value => { payload = value; writes.push({ table, value }); return query; },
      insert: value => { payload = value; action = 'insert'; writes.push({ table, insert: value }); return query; },
      update: value => { payload = value; action = 'update'; return query; },
      delete: () => { action = 'delete'; return query; },
      single: () => query,
      then: (resolve, reject) => {
        if (failure) return Promise.resolve({ error: {message: failure} }).then(resolve, reject);
        let data = table === 'weekly_meals' ? (isPast ? past : current) : table === 'meal_recipe_tags' ? tagRows : table === 'meal_day_categories' ? categories : table === 'meal_recipe_library' ? library : queue;
        if (payload && table === 'weekly_meals') data = { id: 'saved', ...payload };
        if (payload && table === 'meal_recipe_library') data = payload;
        if (payload && table === 'meal_recipe_queue' && action === 'insert') data = { id: `queue-${writes.length}`, created_at: '2026-09-11T08:00:00Z', ...payload };
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
}
async function render() { await act(async () => { root.render(<MealPlanner/>); }); }
async function change(label, value) {
  await act(async () => { Simulate.change(document.body.querySelector(`[aria-label="${label}"]`), { target: { value } }); });
}
function button(text, parent = document.body) { return [...parent.querySelectorAll('button')].find(b => b.textContent === text); }
function day(n) { return [...container.querySelectorAll('.meal')].find(el => el.querySelector('h3').textContent === `Day ${n}`); }
async function click(el) { await act(async () => { el.click(); }); }
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.confirm = jest.fn(() => true);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  current = []; past = []; library = []; queue = []; tagRows = []; categories = DEFAULT_CATEGORIES.map(c => ({...c})); writes = []; failure = ''; mockInvoke.mockReset(); setupQueries();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

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

test('grocery generation requires all saved recipes to match, including after category edits', async () => {
  current = Array.from({length:6}, (_,i) => sample(i+1));
  tagRows = [current[3], current[5]].map(m => ({recipe_key: recipeKey(m), tags: m.meal_number === 4 ? ['instant pot'] : ['soup']}));
  await render();
  expect(button('Generate grocery list').disabled).toBe(false);
  await click(button('Edit categories'));
  await change('Day 1 accepted tags', 'soup');
  await click(button('Save day categories'));
  expect(button('Generate grocery list').disabled).toBe(true);
  expect(day(1).textContent).toContain('Add a recipe tagged soup');
});

test('day categories are edited in a modal instead of taking space on the planner', async () => {
  await render();
  expect(container.querySelector('#day-categories')).toBeNull();
  expect(container.textContent).not.toContain('Day 1 · Pasta Thursday');
  await click(button('Edit categories'));
  const modal = document.body.querySelector('[aria-label="Edit day categories"]');
  expect(modal).not.toBeNull();
  expect(modal.querySelectorAll('.categoryCard')).toHaveLength(6);
  await click(modal.querySelector('[aria-label="Close categories"]'));
  expect(document.body.querySelector('[aria-label="Edit day categories"]')).toBeNull();
});

test('past recipes offer only matching empty days; saving tags enables soup day and reuse preserves tags', async () => {
  past = [sample(1)];
  await render();
  let select = container.querySelector('select');
  expect([...select.options].map(o => o.value)).not.toContain('6');
  await change('Tags for Recipe 1', 'soup');
  expect(button('Use recipe').disabled).toBe(true);
  expect(button('Save tags')).toBeUndefined();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 700)); });
  select = container.querySelector('select');
  expect([...select.options].map(o => o.value)).toContain('6');
  expect([...select.options].map(o => o.value)).not.toContain('4');
  expect(container.querySelector('#recipe-library').textContent).toContain('Tags saved');
  await change('Destination for Recipe 1', '6'); await click(button('Use recipe'));
  expect(writes[writes.length - 1].value).toMatchObject({meal_number: 6, title: 'Recipe 1'});
  expect(container.querySelector('[aria-label="Day 6 recipe tags"]').value).toBe('soup');
});

test('week days are collapsed summaries with the recipe name visible', async () => {
  current = [sample(1)];
  await render();
  expect(day(1).tagName).toBe('DETAILS');
  expect(day(1).open).toBe(false);
  expect(day(1).querySelector('summary').textContent).toContain('Recipe 1');
  expect(day(2).querySelector('summary').textContent).toContain('Empty');
  await click(day(1).querySelector('summary'));
  expect(day(1).open).toBe(true);
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


test('URL extraction displays the function error in the review modal', async () => {
  const message = 'AI backend not configured: OPENAI_API_KEY is missing in Supabase Edge Function secrets.';
  mockInvoke.mockResolvedValue({error: {message: 'Edge Function returned a non-2xx status code', context: {json: async () => ({error: message})}}});
  await render(); await change('Day 2 meal title', 'Chicken'); await change('Day 2 source', 'https://example.com/recipe');
  await click(button('Extract ingredients', day(2)));
  const modal = document.body.querySelector('.modal');
  await click(button('URL', modal));
  await click(button('Extract ingredients', modal));
  expect(modal.textContent).toContain(message);
  expect(modal.textContent).not.toContain('non-2xx');
  expect(mockInvoke).toHaveBeenCalledWith('meal-ingredients', {body: {mode: 'url', url: 'https://example.com/recipe'}});
});

test('marking a saved meal cooked banks the recipe and clears its day', async () => {
  current = [sample(1, ['pasta'])];
  tagRows = [{recipe_key: recipeKey(current[0]), tags: ['pasta']}];
  await render();
  await click(button('Mark cooked', day(1)));
  expect(writes.find(write => write.table === 'meal_recipe_library').value).toMatchObject({title: 'Recipe 1', source_ref: 'Book 1', has_been_cooked: true, is_deleted: false});
  expect(writes).toContainEqual({table: 'weekly_meals', delete: {field: 'id', value: 'meal-1', payload: undefined}});
  expect(container.querySelector('[aria-label="Day 1 meal title"]').value).toBe('');
  expect(container.querySelector('#recipe-library').textContent).toContain('Recipe 1');
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
  expect(button('Queued', card).disabled).toBe(true);
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
  expect(mockInvoke).toHaveBeenCalledWith('meal-recipe-intake', {body: {url:'https://example.com/pasta', destination:'queue', weekOf:expect.stringMatching(/^\d{4}-W\d{2}$/)}});
  expect(document.body.textContent).toContain('Lemony Pasta added to Day 1 queue');
  expect(writes.find(write => write.table === 'meal_recipe_queue' && write.insert)).toBeUndefined();
});

test('imports a URL directly to the library without scheduling it', async () => {
  mockInvoke.mockResolvedValue({data: {ok:true, destination:'library', updatedExisting:false, alreadyQueued:false, recipe:{title:'Library Pasta'}}, error: null});
  await render();
  await change('Recipe URL to import', 'https://example.com/library-pasta');
  await click(button('Save to library'));
  expect(mockInvoke).toHaveBeenCalledWith('meal-recipe-intake', {body: {url:'https://example.com/library-pasta', destination:'library', weekOf:expect.any(String)}});
  expect(document.body.textContent).toContain('Library Pasta saved to your library');
  expect(writes.find(write => write.table === 'meal_recipe_library')).toBeUndefined();
  expect(writes.find(write => write.table === 'meal_recipe_queue' && write.insert)).toBeUndefined();
});

test('library cards expand to show ingredients and an editable method, and can be removed', async () => {
  library = [{...sample(1), method:'1. Boil the carrots.', recipe_key:recipeKey(sample(1)), cooked_at:'2026-09-10T20:00:00Z', has_been_cooked:true, is_deleted:false}];
  await render();
  const recipeLibrary = container.querySelector('#recipe-library');
  expect(recipeLibrary.textContent).toContain('✓ Cooked');
  expect(recipeLibrary.textContent).not.toContain('View ingredients');
  expect(recipeLibrary.textContent).not.toContain('carrot · 1');
  await click(button('View recipe', recipeLibrary));
  expect(recipeLibrary.textContent).toContain('carrot · 1');
  expect(recipeLibrary.querySelector('[aria-label="Method for Recipe 1"]').value).toBe('1. Boil the carrots.');
  await change('Method for Recipe 1', '1. Roast the carrots.');
  await click(button('Save method', recipeLibrary));
  expect(writes.find(write => write.table === 'meal_recipe_library' && write.value.method === '1. Roast the carrots.')).toBeTruthy();
  expect(writes).toContainEqual({table:'meal_recipe_queue', update:{field:'source_ref', value:'Book 1', payload:{method:'1. Roast the carrots.'}}});
  expect(writes).toContainEqual({table:'weekly_meals', update:{field:'source_ref', value:'Book 1', payload:{method:'1. Roast the carrots.'}}});
  await click(button('Delete', recipeLibrary));
  expect(window.confirm).toHaveBeenCalled();
  expect(writes.find(write => write.table === 'meal_recipe_library' && write.value.is_deleted)).toBeTruthy();
  expect(recipeLibrary.textContent).not.toContain('Recipe 1');
  expect(writes.find(write => write.table === 'weekly_meals' && write.delete)).toBeUndefined();
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
    Simulate.change(document.body.querySelector('[aria-label="Switch recipe title"]'), {target:{value:'Cookbook Risotto'}});
    Simulate.change(document.body.querySelector('[aria-label="Switch recipe source"]'), {target:{value:'Cookbook p.40'}});
  });
  await click(button('Switch meal', document.body));
  expect(writes.filter(write => write.table === 'meal_recipe_queue' && write.delete)).toHaveLength(0);
  expect(container.querySelector('[aria-label="Day 2 meal title"]').value).toBe('Cookbook Risotto');
  await click(button('Mark cooked', day(2)));
  expect(container.querySelector('[aria-label="Day 2 meal title"]').value).toBe('Recipe 2');
  expect(writes.filter(write => write.table === 'meal_recipe_queue' && write.delete)).toHaveLength(0);
});
