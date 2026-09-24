import { MEAL_TYPES, sendRecipe, successMessage } from './api.js';

const titleNode = document.querySelector('#page-title');
const urlNode = document.querySelector('#page-url');
const statusNode = document.querySelector('#status');
const buttons = [...document.querySelectorAll('button')];
const initialActions = document.querySelector('#initial-actions');
const review = document.querySelector('#tag-review');
const reviewTitle = document.querySelector('#review-title');
const tagsInput = document.querySelector('#recipe-tags');
const confirmButton = document.querySelector('#confirm-import');
const importQueueButton = document.querySelector('#import-queue');
const importOnlyButton = document.querySelector('#import-only');
const mealTypeInputs = [...document.querySelectorAll('input[name="meal-type"]')];
const plannerHelp = document.querySelector('#planner-help');
let pageUrl = '';
let preview = null;
let pendingDestination = '';
let pendingMealType = '';

function setStatus(message, state = '') {
  statusNode.textContent = message;
  statusNode.className = `status ${state}`.trim();
}

function setBusy(value) {
  buttons.forEach(button => { button.disabled = value; });
  mealTypeInputs.forEach(input => { input.disabled = value; });
}

function selectedMealType() {
  return mealTypeInputs.find(input => input.checked)?.value || 'dinner';
}

function syncPlannerActions() {
  const mealType = selectedMealType();
  const rotating = MEAL_TYPES[mealType].rotating;
  importQueueButton.textContent = rotating ? 'Import recipe' : 'Import & queue';
  importOnlyButton.hidden = rotating;
  initialActions.classList.toggle('single', rotating);
  plannerHelp.textContent = rotating
    ? `${MEAL_TYPES[mealType].label} recipes are saved to their library and queued automatically.`
    : 'Choose whether to queue the recipe now or save it only to the Dinner library.';
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
  const mealType = selectedMealType();
  setBusy(true);
  setStatus(`Extracting the recipe for ${MEAL_TYPES[mealType].label} and suggesting tags…`, 'working');
  try {
    const result = await sendRecipe({ url: pageUrl, destination, mealType, dryRun: true });
    preview = result.recipe;
    pendingDestination = destination;
    pendingMealType = mealType;
    reviewTitle.textContent = preview.title;
    tagsInput.value = Array.isArray(preview.tags) ? preview.tags.join(', ') : '';
    confirmButton.textContent = destination === 'queue' ? 'Save & queue' : 'Save to library';
    initialActions.hidden = true;
    review.hidden = false;
    setStatus(`Review the suggested tags, then save to ${MEAL_TYPES[mealType].label}.`, 'success');
    setBusy(false);
    mealTypeInputs.forEach(input => { input.disabled = true; });
    tagsInput.focus();
  } catch (error) {
    setStatus(error.message || 'Could not extract this recipe. Please try again.', 'error');
    setBusy(false);
  }
}

async function saveRecipe() {
  setBusy(true);
  setStatus(pendingDestination === 'queue' ? `Saving recipe and choosing its ${pendingMealType} queue…` : `Saving recipe to the ${MEAL_TYPES[pendingMealType].label} library…`, 'working');
  try {
    const tags = [...new Set(tagsInput.value.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean))];
    const result = await sendRecipe({ url: pageUrl, destination: pendingDestination, mealType: pendingMealType, recipe: preview, tags });
    setStatus(successMessage(result), 'success');
    window.setTimeout(() => window.close(), 1400);
  } catch (error) {
    setStatus(error.message || 'Could not import this recipe. Please try again.', 'error');
    setBusy(false);
  }
}

mealTypeInputs.forEach(input => input.addEventListener('change', syncPlannerActions));
importQueueButton.addEventListener('click', () => reviewTags('queue'));
importOnlyButton.addEventListener('click', () => reviewTags('library'));
confirmButton.addEventListener('click', saveRecipe);
document.querySelector('#cancel-review').addEventListener('click', () => {
  preview = null;
  pendingDestination = '';
  pendingMealType = '';
  review.hidden = true;
  initialActions.hidden = false;
  mealTypeInputs.forEach(input => { input.disabled = false; });
  syncPlannerActions();
  setStatus('');
});
syncPlannerActions();
initialize().catch(() => {
  setBusy(true);
  setStatus('Chrome could not read this tab. Open a recipe website and try again.', 'error');
});
