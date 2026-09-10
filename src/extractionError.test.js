import { extractionErrorMessage } from './extractionError';

test('shows the missing-key response instead of the generic non-2xx error', async () => {
  const message = 'AI backend not configured: OPENAI_API_KEY is missing in Supabase Edge Function secrets.';
  expect(await extractionErrorMessage({ message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({error: message}) } })).toBe(message);
});
test('retains URL failure details and text-paste fallback', async () => {
  const message = 'That page could not be fetched (403). Paste the recipe text instead.';
  expect(await extractionErrorMessage({context: {json: async () => ({error: message})}})).toBe(message);
});
test('handles gateway messages and non-JSON responses', async () => {
  expect(await extractionErrorMessage({context: {json: async () => ({message: 'Invalid JWT'})}})).toBe('Invalid JWT');
  expect(await extractionErrorMessage({context: {status: 502, json: async () => { throw new Error('Invalid JSON'); }}})).toContain('HTTP 502');
});
test('network failures provide a connection instruction', async () => {
  expect(await extractionErrorMessage({name:'FunctionsFetchError'})).toContain('Check your connection');
});
