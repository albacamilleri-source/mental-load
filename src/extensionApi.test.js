import { INTAKE_ENDPOINT, planningPeriod, sendRecipe, successMessage } from '../chrome-extension/api';

test('Import & queue sends the shared intake request and reports a new queue entry', async () => {
  const fetcher = jest.fn().mockResolvedValue({ok:true, json:async () => ({ok:true,destination:'queue',dayNumber:4,alreadyQueued:false})});
  const result = await sendRecipe({url:'https://example.com/recipe',destination:'queue'}, fetcher);
  expect(fetcher).toHaveBeenCalledWith(INTAKE_ENDPOINT, expect.objectContaining({method:'POST'}));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({url:'https://example.com/recipe',destination:'queue',mealType:'dinner',weekOf:expect.stringMatching(/^\d{4}-W\d{2}$/),dryRun:false});
  expect(successMessage(result)).toBe('Recipe added to the Day 4 queue.');
});

test('Import only sends the library destination', async () => {
  const fetcher = jest.fn().mockResolvedValue({ok:true, json:async () => ({ok:true,destination:'library',updatedExisting:false})});
  const result = await sendRecipe({url:'https://example.com/recipe',destination:'library'}, fetcher);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).destination).toBe('library');
  expect(successMessage(result)).toBe('Recipe saved to the Dinner library.');
});

test.each([
  ['breakfast', 'breakfast-capsule', 'Monday · Kids', 'breakfast'],
  ['lunch', 'lunch-capsule', 'Friday · Kids', 'lunch'],
])('%s imports select its isolated planner and capsule queue', async (mealType, weekOf, day, queueName) => {
  const dayNumber = mealType === 'breakfast' ? 2 : 10;
  const fetcher = jest.fn().mockResolvedValue({ok:true, json:async () => ({ok:true,destination:'queue',dayNumber,alreadyQueued:false})});
  const result = await sendRecipe({url:'https://example.com/recipe',destination:'queue',mealType}, fetcher);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({mealType,weekOf,destination:'queue'});
  expect(successMessage(result)).toBe(`Recipe added to the ${day} ${queueName} queue.`);
});

test('planning periods keep Dinner weekly while Breakfast and Lunch remain rotating capsules', () => {
  expect(planningPeriod('breakfast')).toBe('breakfast-capsule');
  expect(planningPeriod('lunch')).toBe('lunch-capsule');
  expect(planningPeriod('dinner', new Date(2026, 8, 24))).toMatch(/^2026-W\d{2}$/);
});

test('reviewed tags and extracted recipe are sent with the confirmed save', async () => {
  const fetcher = jest.fn().mockResolvedValue({ok:true, json:async () => ({ok:true,destination:'library',updatedExisting:true})});
  const recipe = {title:'Soup',source_ref:'https://example.com/soup',ingredients:[{name:'stock',qty:1,unit:'l'}],servings:4,tags:['soup']};
  await sendRecipe({url:recipe.source_ref,destination:'library',recipe,tags:['soup','family']}, fetcher);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({recipe,tags:['soup','family'],dryRun:false});
});

test('duplicate queue imports are reported without claiming a second entry', () => {
  expect(successMessage({destination:'queue',mealType:'dinner',dayNumber:2,alreadyQueued:true,updatedExisting:true})).toBe('Recipe updated. It is already in the Day 2 queue.');
});

test('backend failure details are shown to the extension user', async () => {
  const fetcher = jest.fn().mockResolvedValue({ok:false,status:422,json:async () => ({error:'No readable recipe was found.'})});
  await expect(sendRecipe({url:'https://example.com/not-a-recipe',destination:'library'}, fetcher)).rejects.toThrow('No readable recipe was found.');
});
