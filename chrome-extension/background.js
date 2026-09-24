import { sendRecipe, successMessage } from './api.js';

const ROOT = 'mental-load-root';
const ACTIONS = {
  'mental-load-breakfast': { mealType: 'breakfast', destination: 'queue', title: 'Breakfast · Import recipe' },
  'mental-load-lunch': { mealType: 'lunch', destination: 'queue', title: 'Lunch · Import recipe' },
  'mental-load-dinner-queue': { mealType: 'dinner', destination: 'queue', title: 'Dinner · Import & queue' },
  'mental-load-dinner-library': { mealType: 'dinner', destination: 'library', title: 'Dinner · Import only' },
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: ROOT, title: 'Send to Mental Load', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'mental-load-breakfast', parentId: ROOT, title: ACTIONS['mental-load-breakfast'].title, contexts: ['page'] });
    chrome.contextMenus.create({ id: 'mental-load-lunch', parentId: ROOT, title: ACTIONS['mental-load-lunch'].title, contexts: ['page'] });
    chrome.contextMenus.create({ id: 'mental-load-separator', parentId: ROOT, type: 'separator', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'mental-load-dinner-queue', parentId: ROOT, title: ACTIONS['mental-load-dinner-queue'].title, contexts: ['page'] });
    chrome.contextMenus.create({ id: 'mental-load-dinner-library', parentId: ROOT, title: ACTIONS['mental-load-dinner-library'].title, contexts: ['page'] });
  });
});

async function showBadge(text, color, title) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const action = ACTIONS[info.menuItemId];
  if (!action) return;
  const url = info.pageUrl || tab?.url || '';
  await showBadge('…', '#98785f', 'Sending recipe to Mental Load…');
  try {
    const result = await sendRecipe({ url, destination: action.destination, mealType: action.mealType });
    await showBadge('✓', '#6f927c', successMessage(result));
  } catch (error) {
    await showBadge('!', '#b95d52', error.message || 'Recipe import failed');
  }
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'Send to Mental Load' });
  }, 5000);
});
