export const INTAKE_ENDPOINT = 'https://qvibdnrfywisvfsqgqux.supabase.co/functions/v1/meal-recipe-intake';
export const PUBLIC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2aWJkbnJmeXdpc3Zmc3FncXV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTE5MTcsImV4cCI6MjA5NDQ2NzkxN30.qPNjcpQpHPV5_SVz3U-JC18CcZ6vxio9vImA3CKg5jk';

export function currentIsoWeek(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay() || 7;
  local.setDate(local.getDate() + 4 - day);
  const yearStart = new Date(local.getFullYear(), 0, 1);
  const week = Math.ceil((((local - yearStart) / 86400000) + 1) / 7);
  return `${local.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function sendRecipe({ url, destination, dryRun = false }, fetcher = fetch) {
  if (!/^https?:\/\//i.test(String(url || '').trim())) throw new Error('This tab does not have a recipe website URL.');
  const response = await fetcher(INTAKE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PUBLIC_ANON_KEY}`,
      apikey: PUBLIC_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, destination, weekOf: currentIsoWeek(), dryRun }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || `Mental Load could not import this recipe (${response.status}).`);
  return data;
}

export function successMessage(result) {
  if (result.destination === 'library') return result.updatedExisting ? 'Recipe updated in your library.' : 'Recipe saved to your library.';
  if (result.alreadyQueued) return `Recipe updated. It is already in the Day ${result.dayNumber} queue.`;
  return `Recipe added to the Day ${result.dayNumber} queue.`;
}
