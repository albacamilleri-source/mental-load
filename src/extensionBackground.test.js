const mockSendRecipe = jest.fn();

jest.mock('../chrome-extension/api', () => ({
  sendRecipe: (...args) => mockSendRecipe(...args),
  successMessage: () => 'Saved',
}));

let installedListener;
let clickedListener;

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  mockSendRecipe.mockReset().mockResolvedValue({destination:'library', mealType:'sides'});
  installedListener = null;
  clickedListener = null;
  global.chrome = {
    runtime: { onInstalled: { addListener: jest.fn(listener => { installedListener = listener; }) } },
    contextMenus: {
      removeAll: jest.fn(callback => callback()),
      create: jest.fn(),
      onClicked: { addListener: jest.fn(listener => { clickedListener = listener; }) },
    },
    action: {
      setBadgeBackgroundColor: jest.fn().mockResolvedValue(),
      setBadgeText: jest.fn().mockResolvedValue(),
      setTitle: jest.fn().mockResolvedValue(),
    },
  };
  require('../chrome-extension/background');
});

afterEach(() => {
  jest.useRealTimers();
  delete global.chrome;
});

test('right-click menu includes Side Dishes and Treats & Snacks imports', () => {
  installedListener();
  const items = chrome.contextMenus.create.mock.calls.map(([item]) => item);
  expect(items).toEqual(expect.arrayContaining([
    expect.objectContaining({id:'mental-load-sides', title:'Side Dishes · Import recipe'}),
    expect.objectContaining({id:'mental-load-treats', title:'Treats & Snacks · Import recipe'}),
  ]));
});

test('Side Dishes right-click action imports directly to its library', async () => {
  await clickedListener({menuItemId:'mental-load-sides', pageUrl:'https://example.com/side'}, {});
  expect(mockSendRecipe).toHaveBeenCalledWith({url:'https://example.com/side', destination:'library', mealType:'sides'});
});
