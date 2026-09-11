import { sendRecipe, successMessage } from './api.js';

const titleNode = document.querySelector('#page-title');
const urlNode = document.querySelector('#page-url');
const statusNode = document.querySelector('#status');
const buttons = [...document.querySelectorAll('button')];
let pageUrl = '';

function setStatus(message, state = '') {
  statusNode.textContent = message;
  statusNode.className = `status ${state}`.trim();
}

function setBusy(value) {
  buttons.forEach(button => { button.disabled = value; });
}

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pageUrl = tab?.url || '';
  titleNode.textContent = tab?.title || 'Untitled page';
  urlNode.textContent = pageUrl;
  if (!/^https?:\/\//i.test(pageUrl)) {
    setBusy(true);
    setStatus('Open a recipe website, then try again.', 'error');
  }
}

async function run(destination) {
  setBusy(true);
  setStatus(destination === 'queue' ? 'Extracting recipe and choosing its queue…' : 'Extracting recipe and saving it…', 'working');
  try {
    const result = await sendRecipe({ url: pageUrl, destination });
    setStatus(successMessage(result), 'success');
    window.setTimeout(() => window.close(), 1400);
  } catch (error) {
    setStatus(error.message || 'Could not import this recipe. Please try again.', 'error');
    setBusy(false);
  }
}

document.querySelector('#import-queue').addEventListener('click', () => run('queue'));
document.querySelector('#import-only').addEventListener('click', () => run('library'));
initialize().catch(() => {
  setBusy(true);
  setStatus('Chrome could not read this tab. Open a recipe website and try again.', 'error');
});
