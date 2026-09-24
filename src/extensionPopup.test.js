const mockSendRecipe = jest.fn();

jest.mock('../chrome-extension/api', () => ({
  MEAL_TYPES: {
    breakfast: { label: 'Breakfasts', rotating: true },
    lunch: { label: 'Lunches', rotating: true },
    dinner: { label: 'Dinners', rotating: false },
  },
  sendRecipe: (...args) => mockSendRecipe(...args),
  successMessage: () => 'Saved',
}));

function popupMarkup() {
  return `
    <div id="page-title"></div><div id="page-url"></div>
    <fieldset><input type="radio" name="meal-type" value="breakfast"><input type="radio" name="meal-type" value="lunch"><input type="radio" name="meal-type" value="dinner" checked></fieldset>
    <div id="planner-help"></div>
    <div id="initial-actions" class="actions"><button id="import-queue">Import & queue</button><button id="import-only">Import only</button></div>
    <section id="tag-review" hidden><div id="review-title"></div><input id="recipe-tags"><button id="confirm-import"></button><button id="cancel-review"></button></section>
    <div id="status"></div>`;
}

beforeEach(async () => {
  jest.resetModules();
  mockSendRecipe.mockReset().mockResolvedValue({ recipe: { title: 'Toast', tags: ['quick'] } });
  document.body.innerHTML = popupMarkup();
  global.chrome = { tabs: { query: jest.fn().mockResolvedValue([{ title: 'Toast recipe', url: 'https://example.com/toast' }]) } };
  require('../chrome-extension/popup');
  await Promise.resolve();
});

afterEach(() => { delete global.chrome; });

test('Breakfast selection switches to the automatic library-and-queue action', async () => {
  const breakfast = document.querySelector('input[value="breakfast"]');
  breakfast.checked = true;
  breakfast.dispatchEvent(new Event('change'));
  expect(document.querySelector('#import-queue').textContent).toBe('Import recipe');
  expect(document.querySelector('#import-only').hidden).toBe(true);
  expect(document.querySelector('#planner-help').textContent).toContain('queued automatically');

  document.querySelector('#import-queue').click();
  await Promise.resolve();
  expect(mockSendRecipe).toHaveBeenCalledWith(expect.objectContaining({ mealType: 'breakfast', destination: 'queue', dryRun: true }));
});

test('Dinner selection keeps both queue and library-only choices', () => {
  expect(document.querySelector('#import-queue').textContent).toBe('Import & queue');
  expect(document.querySelector('#import-only').hidden).toBe(false);
  expect(document.querySelector('#planner-help').textContent).toContain('Dinner library');
});
