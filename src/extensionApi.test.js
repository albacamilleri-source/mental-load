import { INTAKE_ENDPOINT, sendRecipe, successMessage } from '../chrome-extension/api';

test('Import & queue sends the shared intake request and reports a new queue entry', async () => {
  const fetcher = jest.fn().mockResolvedValue({ok:true, json:async () => ({ok:true,destination:'queue',dayNumber:4,alreadyQueued:false})});
  const result = await sendRecipe({url:'https://example.com/recipe',destination:'queue'}, fetcher);
  expect(fetcher).toHaveBeenCalledWith(INTAKE_ENDPOINT, expect.objectContaining({method:'POST'}));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({url:'https://example.com/recipe',destination:'queue',dryRun:false});
  expect(successMessage(result)).toBe('Recipe added to the Day 4 queue.');
});

test('Import only sends the library destination', async () => {
  const fetcher = jest.fn().mockResolvedValue({ok:true, json:async () => ({ok:true,destination:'library',updatedExisting:false})});
  const result = await sendRecipe({url:'https://example.com/recipe',destination:'library'}, fetcher);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).destination).toBe('library');
  expect(successMessage(result)).toBe('Recipe saved to your library.');
});

test('reviewed tags and extracted recipe are sent with the confirmed save', async () => {
  const fetcher = jest.fn().mockResolvedValue({ok:true, json:async () => ({ok:true,destination:'library',updatedExisting:true})});
  const recipe = {title:'Soup',source_ref:'https://example.com/soup',ingredients:[{name:'stock',qty:1,unit:'l'}],servings:4,tags:['soup']};
  await sendRecipe({url:recipe.source_ref,destination:'library',recipe,tags:['soup','family']}, fetcher);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({recipe,tags:['soup','family'],dryRun:false});
});

test('duplicate queue imports are reported without claiming a second entry', () => {
  expect(successMessage({destination:'queue',dayNumber:2,alreadyQueued:true,updatedExisting:true})).toBe('Recipe updated. It is already in the Day 2 queue.');
});

test('backend failure details are shown to the extension user', async () => {
  const fetcher = jest.fn().mockResolvedValue({ok:false,status:422,json:async () => ({error:'No readable recipe was found.'})});
  await expect(sendRecipe({url:'https://example.com/not-a-recipe',destination:'library'}, fetcher)).rejects.toThrow('No readable recipe was found.');
});
