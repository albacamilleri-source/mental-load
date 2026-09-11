import { sendRecipe, successMessage } from './api.js';

const titleNode = document.querySelector('#page-title');
const urlNode = document.querySelector('#page-url');
const statusNode = document.querySelector('#status');
const buttons = [...document.querySelectorAll('button')];
const initialActions = document.querySelector('#initial-actions');
const review = document.querySelector('#tag-review');
const reviewTitle = document.querySelector('#review-title');
const tagsInput = document.querySelector('#recipe-tags');
const confirmButton = document.querySelector('#confirm-import');
let pageUrl = '';
let preview = null;
let pendingDestination = '';

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

async function reviewTags(destination) {
  setBusy(true);
  setStatus('Extracting the recipe and suggesting tags…', 'working');
  try {
    const result = await sendRecipe({ url: pageUrl, destination, dryRun: true });
    preview = result.recipe;
    pendingDestination = destination;
    reviewTitle.textContent = preview.title;
    tagsInput.value = Array.isArray(preview.tags) ? preview.tags.join(', ') : '';
    confirmButton.textContent = destination === 'queue' ? 'Save & queue' : 'Save to library';
    initialActions.hidden = true;
    review.hidden = false;
    setStatus('Review the suggested tags, then save.', 'success');
    setBusy(false);
    tagsInput.focus();
  } catch (error) {
    setStatus(error.message || 'Could not extract this recipe. Please try again.', 'error');
    setBusy(false);
  }
}

async function saveRecipe() {
  setBusy(true);
  setStatus(pendingDestination === 'queue' ? 'Saving recipe and choosing its queue…' : 'Saving recipe to your library…', 'working');
  try {
    const tags = [...new Set(tagsInput.value.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean))];
    const result = await sendRecipe({ url: pageUrl, destination: pendingDestination, recipe: preview, tags });
    setStatus(successMessage(result), 'success');
    window.setTimeout(() => window.close(), 1400);
  } catch (error) {
    setStatus(error.message || 'Could not import this recipe. Please try again.', 'error');
    setBusy(false);
  }
}

document.querySelector('#import-queue').addEventListener('click', () => reviewTags('queue'));
document.querySelector('#import-only').addEventListener('click', () => reviewTags('library'));
confirmButton.addEventListener('click', saveRecipe);
document.querySelector('#cancel-review').addEventListener('click', () => {
  preview = null;
  pendingDestination = '';
  review.hidden = true;
  initialActions.hidden = false;
  setStatus('');
});
initialize().catch(() => {
  setBusy(true);
  setStatus('Chrome could not read this tab. Open a recipe website and try again.', 'error');
});
