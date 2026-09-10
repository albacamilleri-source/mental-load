import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import MealPlanner from './MealPlanner';
import { DEFAULT_CATEGORIES, recipeKey } from './mealPlanning';

const mockFrom = jest.fn();
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (...args) => mockFrom(...args) }) }));
let container, root, current, past, tagRows, categories, writes, failure;
const sample = (n, tags = []) => ({ id: `meal-${n}`, meal_number: n, title: `Recipe ${n}`, source_ref: `Book ${n}`, week_of: '2026-W36', ingredients: [{name: 'carrot', qty: 1, unit: 'item'}], extracted_at: null, tags });
function setupQueries() {
  mockFrom.mockImplementation(table => {
    let isPast = false, payload;
    const query = {
      select: () => query, eq: () => query, lt: () => { isPast = true; return query; }, order: () => query,
      upsert: value => { payload = value; writes.push({ table, value }); return query; },
      single: () => query,
      then: (resolve, reject) => {
        if (failure) return Promise.resolve({ error: {message: failure} }).then(resolve, reject);
        let data = table === 'weekly_meals' ? (isPast ? past : current) : table === 'meal_recipe_tags' ? tagRows : categories;
        if (payload && table === 'weekly_meals') data = { id: 'saved', ...payload };
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
}
async function render() { await act(async () => { root.render(<MealPlanner/>); }); }
async function change(label, value) {
  await act(async () => { Simulate.change(container.querySelector(`[aria-label="${label}"]`), { target: { value } }); });
}
function button(text, parent = container) { return [...parent.querySelectorAll('button')].find(b => b.textContent === text); }
function day(n) { return [...container.querySelectorAll('.meal')].find(el => el.querySelector('h3').textContent === `Day ${n}`); }
async function click(el) { await act(async () => { el.click(); }); }
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  current = []; past = []; tagRows = []; categories = DEFAULT_CATEGORIES.map(c => ({...c})); writes = []; failure = ''; setupQueries();
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

test('past recipes offer only matching empty days; saving tags enables soup day and reuse preserves tags', async () => {
  past = [sample(1)];
  await render(); await click(button('Browse recipes'));
  await click(container.querySelector('.pastWeek > button'));
  let select = container.querySelector('select');
  expect([...select.options].map(o => o.value)).not.toContain('6');
  await change('Tags for Recipe 1', 'soup');
  expect(button('Use recipe').disabled).toBe(true);
  await click(button('Save tags'));
  select = container.querySelector('select');
  expect([...select.options].map(o => o.value)).toContain('6');
  expect([...select.options].map(o => o.value)).not.toContain('4');
  await change('Destination for Recipe 1', '6'); await click(button('Use recipe'));
  expect(writes[writes.length - 1].value).toMatchObject({meal_number: 6, title: 'Recipe 1'});
  expect(container.querySelector('[aria-label="Day 6 recipe tags"]').value).toBe('soup');
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
