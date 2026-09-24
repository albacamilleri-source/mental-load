export const INTAKE_ENDPOINT = 'https://qvibdnrfywisvfsqgqux.supabase.co/functions/v1/meal-recipe-intake';
export const PUBLIC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2aWJkbnJmeXdpc3Zmc3FncXV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTE5MTcsImV4cCI6MjA5NDQ2NzkxN30.qPNjcpQpHPV5_SVz3U-JC18CcZ6vxio9vImA3CKg5jk';

export const MEAL_TYPES = {
  breakfast: { label: 'Breakfasts', library: 'Breakfast', period: 'breakfast-capsule', rotating: true, days: ['Monday · Adults', 'Monday · Kids', 'Tuesday · Adults', 'Tuesday · Kids', 'Wednesday · Adults', 'Wednesday · Kids', 'Thursday · Adults', 'Thursday · Kids', 'Friday · Adults', 'Saturday', 'Sunday'] },
  lunch: { label: 'Lunches', library: 'Lunch', period: 'lunch-capsule', rotating: true, days: ['Monday · Adults', 'Monday · Kids', 'Tuesday · Adults', 'Tuesday · Kids', 'Wednesday · Adults', 'Wednesday · Kids', 'Thursday · Adults', 'Thursday · Kids', 'Friday · Adults', 'Friday · Kids', 'Saturday', 'Sunday'] },
  dinner: { label: 'Dinners', library: 'Dinner', rotating: false, days: [] },
};

export function currentIsoWeek(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay() || 7;
  local.setDate(local.getDate() + 4 - day);
  const yearStart = new Date(local.getFullYear(), 0, 1);
  const week = Math.ceil((((local - yearStart) / 86400000) + 1) / 7);
  return `${local.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function planningPeriod(mealType, date = new Date()) {
  return MEAL_TYPES[mealType]?.period || currentIsoWeek(date);
}

export async function sendRecipe({ url, destination, mealType = 'dinner', dryRun = false, recipe, tags }, fetcher = fetch) {
  if (!/^https?:\/\//i.test(String(url || '').trim())) throw new Error('This tab does not have a recipe website URL.');
  if (!MEAL_TYPES[mealType]) throw new Error('Choose Breakfasts, Lunches or Dinners.');
  const response = await fetcher(INTAKE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PUBLIC_ANON_KEY}`,
      apikey: PUBLIC_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, destination, mealType, weekOf: planningPeriod(mealType), dryRun, ...(recipe ? { recipe, tags } : {}) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || `Mental Load could not import this recipe (${response.status}).`);
  return { ...data, mealType };
}

export function successMessage(result) {
  const type = MEAL_TYPES[result.mealType] || MEAL_TYPES.dinner;
  if (result.destination === 'library') return result.updatedExisting ? `Recipe updated in the ${type.library} library.` : `Recipe saved to the ${type.library} library.`;
  const day = type.days[Number(result.dayNumber) - 1] || `Day ${result.dayNumber}`;
  const queue = `${day} ${result.mealType === 'dinner' || !result.mealType ? '' : `${result.mealType} `}queue`;
  if (result.alreadyQueued) return `Recipe updated. It is already in the ${queue}.`;
  return `Recipe added to the ${queue}.`;
}
