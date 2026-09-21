import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { chooseQueueDay, nextQueuePosition, normalizeRecipeUrl, parseTags, queueMealPayload, recipeKey } from "./intake-core.js";

const plannerTables = {
  dinner: { categories: "meal_day_categories", meals: "weekly_meals", queue: "meal_recipe_queue", library: "meal_recipe_library", tags: "meal_recipe_tags" },
  breakfast: { categories: "breakfast_day_categories", meals: "breakfast_weekly_meals", queue: "breakfast_recipe_queue", library: "breakfast_recipe_library", tags: "breakfast_recipe_tags" },
} as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const sourceUrl = normalizeRecipeUrl(body?.url);
    const destination = body?.destination === "library" ? "library" : body?.destination === "queue" ? "queue" : "";
    const mealType = body?.mealType === undefined || body?.mealType === "dinner" ? "dinner" : body?.mealType === "breakfast" ? "breakfast" : "";
    const weekOf = String(body?.weekOf || "").trim();
    const dryRun = body?.dryRun === true;
    if (!destination) return json({ error: "Choose Import & queue or Import only." }, 400);
    if (!mealType) return json({ error: "Choose Dinners or Breakfasts." }, 400);
    if (destination === "queue" && !(mealType === "breakfast" ? weekOf === "breakfast-capsule" : /^\d{4}-W\d{2}$/.test(weekOf))) return json({ error: "The current planning period is missing." }, 400);
    const tables = plannerTables[mealType];

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) throw new Error("The Mental Load backend is not configured.");
    const authorization = req.headers.get("Authorization") || `Bearer ${anonKey}`;
    const apikey = req.headers.get("apikey") || anonKey;
    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });

    const [categoriesResult, mealsResult, queueResult, existingLibraryResult] = await Promise.all([
      client.from(tables.categories).select("*").order("day_number"),
      destination === "queue" ? client.from(tables.meals).select("*").eq("week_of", weekOf).order("meal_number") : Promise.resolve({ data: [], error: null }),
      destination === "queue" ? client.from(tables.queue).select("*").order("day_number").order("position").order("created_at") : Promise.resolve({ data: [], error: null }),
      client.from(tables.library).select("*").eq("source_ref", sourceUrl).maybeSingle(),
    ]);
    const loadError = [categoriesResult, mealsResult, queueResult, existingLibraryResult].find(result => result.error)?.error;
    if (loadError) throw loadError;
    const categories = categoriesResult.data || [];
    if (categories.length !== (mealType === "breakfast" ? 4 : 6)) throw new Error("Day categories could not be loaded.");
    const categoryTags = [...new Set(categories.flatMap(category => parseTags(category.accepted_tags)))];

    let extraction = body?.recipe;
    if (extraction) {
      let suppliedUrl = "";
      try { suppliedUrl = normalizeRecipeUrl(extraction.source_ref); } catch { /* handled below */ }
      if (suppliedUrl !== sourceUrl) return json({ error: "The reviewed recipe does not match this page." }, 400);
    } else {
      const extractionResponse = await fetch(`${supabaseUrl}/functions/v1/meal-recipe-import`, {
        method: "POST",
        headers: { Authorization: authorization, apikey, "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl, categoryTags, mealType }),
      });
      extraction = await extractionResponse.json().catch(() => ({}));
      if (!extractionResponse.ok) return json({ error: extraction?.error || "The recipe could not be extracted.", code: extraction?.code || "EXTRACTION_FAILED" }, extractionResponse.status);
    }

    const title = String(extraction?.title || "").trim();
    const ingredients = Array.isArray(extraction?.ingredients) ? extraction.ingredients : [];
    const method = String(extraction?.method || existingLibraryResult.data?.method || "").trim();
    const extractedServings = Number(extraction?.servings);
    const servings = Number.isInteger(extractedServings) && extractedServings > 0 ? extractedServings : existingLibraryResult.data?.servings ?? null;
    const tags = body?.tags === undefined ? parseTags(extraction?.tags) : parseTags(body.tags);
    if (!title || !ingredients.length) return json({ error: "The importer could not find a complete recipe on that page.", code: "INCOMPLETE_RECIPE" }, 422);
    const now = new Date().toISOString();
    const existingLibrary = existingLibraryResult.data;
    const key = existingLibrary?.recipe_key || recipeKey({ title, source_ref: sourceUrl });
    const recipe = { recipe_key: key, title, source_ref: sourceUrl, ingredients, method, servings, extracted_at: now, rating: existingLibrary?.rating ?? null, notes: existingLibrary?.notes || "", tags };

    let dayNumber: number | null = null;
    const queueRows = queueResult.data || [];
    const existingQueue = destination === "queue" ? queueRows.find(row => row.source_ref === sourceUrl) : null;
    if (destination === "queue") {
      if (mealType === "breakfast" && !categories.some(category => {
        const accepted = parseTags(category.accepted_tags);
        return !accepted.length || accepted.some(tag => tags.includes(tag));
      })) return json({ error: "Add a tag that matches a breakfast category before sending this recipe to a queue." }, 422);
      dayNumber = Number(existingQueue?.day_number || chooseQueueDay(tags, categories, mealsResult.data || []));
    }
    if (dryRun) return json({ ok: true, dryRun: true, destination, recipe, dayNumber, updatedExisting: !!existingLibrary, alreadyQueued: !!existingQueue });

    const { error: tagError } = await client.from(tables.tags).upsert({ recipe_key: key, tags });
    if (tagError) throw tagError;
    const libraryPayload = {
      recipe_key: key, title, source_ref: sourceUrl, ingredients, method, servings, extracted_at: now,
      rating: existingLibrary?.rating ?? null, notes: existingLibrary?.notes || "",
      cooked_at: existingLibrary?.cooked_at || now,
      has_been_cooked: existingLibrary?.has_been_cooked === true,
      is_deleted: false,
    };
    const libraryWrite = existingLibrary
      ? await client.from(tables.library).update(libraryPayload).eq("recipe_key", key).select().single()
      : await client.from(tables.library).insert(libraryPayload).select().single();
    if (libraryWrite.error) {
      if (libraryWrite.error.code !== "23505") throw libraryWrite.error;
      const recovered = await client.from(tables.library).select("*").eq("source_ref", sourceUrl).single();
      if (recovered.error) throw recovered.error;
    }

    if (destination === "library") return json({ ok: true, destination, recipe, updatedExisting: !!existingLibrary, alreadyQueued: false });
    if (existingQueue) {
      const refreshed = { title, source_ref: sourceUrl, ingredients, method, servings, extracted_at: now, rating: existingLibrary?.rating ?? null, notes: existingLibrary?.notes || "" };
      const queueUpdate = await client.from(tables.queue).update(refreshed).eq("id", existingQueue.id);
      if (queueUpdate.error) throw queueUpdate.error;
      const scheduleUpdate = await client.from(tables.meals).update(refreshed).eq("queue_item_id", existingQueue.id);
      if (scheduleUpdate.error) throw scheduleUpdate.error;
      return json({ ok: true, destination, recipe, dayNumber, updatedExisting: !!existingLibrary, alreadyQueued: true });
    }

    const queuePayload = {
      day_number: dayNumber, position: nextQueuePosition(queueRows, dayNumber), title, source_ref: sourceUrl,
      ingredients, method, servings, extracted_at: now, rating: existingLibrary?.rating ?? null, notes: existingLibrary?.notes || "",
    };
    const queueWrite = await client.from(tables.queue).insert(queuePayload).select().single();
    if (queueWrite.error) {
      if (queueWrite.error.code === "23505") return json({ ok: true, destination, recipe, dayNumber, updatedExisting: !!existingLibrary, alreadyQueued: true });
      throw queueWrite.error;
    }
    const queued = queueWrite.data;
    const slot = (mealsResult.data || []).find(meal => Number(meal.meal_number) === dayNumber);
    const blank = !slot || (!String(slot.title || "").trim() && !String(slot.source_ref || "").trim());
    const isFront = !queueRows.some(row => Number(row.day_number) === dayNumber && Number(row.position) < Number(queued.position));
    if (blank && isFront) {
      const scheduled = await client.from(tables.meals).upsert(queueMealPayload(queued, weekOf, dayNumber), { onConflict: "week_of,meal_number" });
      if (scheduled.error) throw scheduled.error;
    }
    return json({ ok: true, destination, recipe, dayNumber, updatedExisting: !!existingLibrary, alreadyQueued: false });
  } catch (error) {
    console.error(error);
    const detail = message(error);
    const status = /valid http/i.test(detail) ? 400 : 500;
    return json({ error: detail || "Could not import this recipe. Please retry." }, status);
  }
});
