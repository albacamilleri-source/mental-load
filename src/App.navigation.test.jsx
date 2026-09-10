import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
jest.mock('./MealPlanner', () => ({ __esModule: true, default: ({ onDirtyChange }) => <section data-testid="planner">Meal planner content<button onClick={() => onDirtyChange(true)}>Edit recipe draft</button></section> }));
jest.mock('@supabase/supabase-js', () => ({ createClient: () => {
  const chain = new Proxy({}, { get: (_, key) => key === 'then' ? resolve => Promise.resolve({data: [], error: null}).then(resolve) : () => chain });
  return { from: () => chain, channel: () => chain, removeChannel: jest.fn() };
}}));
let container, root;
const sidebarButton = name => [...container.querySelectorAll('.app-sidebar button')].find(b => b.querySelector('span:last-child')?.textContent === name);
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('hb_who', 'alba');
  window.history.replaceState({}, '', '/mental-load/#meal-planner');
  window.scrollTo = jest.fn(); window.matchMedia = () => ({matches: false});
  global.fetch = jest.fn().mockRejectedValue(new Error('Offline test'));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); jest.restoreAllMocks(); });
test('deep link renders inside the app sidebar and menu navigation keeps the same shell', async () => {
  await act(async () => root.render(<App/>));
  const sidebar = container.querySelector('.app-sidebar');
  expect(container.querySelector('[data-testid="planner"]')).not.toBeNull();
  expect(sidebarButton('Meal Planner')).toBeDefined();
  await act(async () => sidebarButton('Plan').click());
  expect(container.querySelector('.app-sidebar')).toBe(sidebar);
  expect(container.querySelector('[data-testid="planner"]')).toBeNull();
  expect(window.location.hash).toBe('');
  await act(async () => sidebarButton('Meal Planner').click());
  expect(container.querySelector('.app-sidebar')).toBe(sidebar);
  expect(container.querySelector('[data-testid="planner"]')).not.toBeNull();
  expect(window.location.hash).toBe('#meal-planner');
});
test('declining to discard a recipe draft keeps the planner open', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(false);
  await act(async () => root.render(<App/>));
  await act(async () => container.querySelector('[data-testid="planner"] button').click());
  await act(async () => sidebarButton('Plan').click());
  expect(window.confirm).toHaveBeenCalled();
  expect(container.querySelector('[data-testid="planner"]')).not.toBeNull();
  expect(window.location.hash).toBe('#meal-planner');
});
