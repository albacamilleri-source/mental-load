import { sendRecipe } from './api.js';

const ROOT = 'mental-load-root';
const QUEUE = 'mental-load-import-queue';
const LIBRARY = 'mental-load-import-library';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: ROOT, title: 'Send to Mental Load', contexts: ['page'] });
    chrome.contextMenus.create({ id: QUEUE, parentId: ROOT, title: 'Import & queue', contexts: ['page'] });
    chrome.contextMenus.create({ id: LIBRARY, parentId: ROOT, title: 'Import only', contexts: ['page'] });
  });
});

async function showBadge(text, color, title) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (![QUEUE, LIBRARY].includes(info.menuItemId)) return;
  const destination = info.menuItemId === QUEUE ? 'queue' : 'library';
  const url = info.pageUrl || tab?.url || '';
  await showBadge('…', '#98785f', 'Sending recipe to Mental Load…');
  try {
    const result = await sendRecipe({ url, destination });
    await showBadge('✓', '#6f927c', result.destination === 'queue' ? `Saved to Day ${result.dayNumber} queue` : 'Saved to Recipe library');
  } catch (error) {
    await showBadge('!', '#b95d52', error.message || 'Recipe import failed');
  }
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'Send to Mental Load' });
  }, 5000);
});
