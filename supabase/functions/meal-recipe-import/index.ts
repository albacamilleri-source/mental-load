import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const recipeSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    source_ref: { type: "string" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          qty: { type: ["number", "null"] },
          unit: { type: "string" },
        },
        required: ["name", "qty", "unit"],
        additionalProperties: false,
      },
    },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["title", "source_ref", "ingredients", "tags"],
  additionalProperties: false,
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function getOutputText(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120000);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const url = String(body?.url || "").trim();
    if (!/^https?:\/\//i.test(url)) return json({ error: "Enter a valid http(s) URL." }, 400);

    let page: Response;
    try {
      page = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 MealPlannerRecipeReader/1.0" } });
    } catch {
      return json({ error: "I couldn't fetch that URL. Try another recipe page.", code: "URL_FETCH_FAILED" }, 422);
    }
    if (!page.ok) return json({ error: `That page could not be fetched (${page.status}).`, code: "URL_FETCH_FAILED" }, 422);
    const pageText = cleanHtml(await page.text());
    if (!pageText) return json({ error: "No readable recipe text was found at that URL.", code: "URL_FETCH_FAILED" }, 422);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("AI backend not configured: OPENAI_API_KEY is missing in Supabase Edge Function secrets.");
    const categoryTags = Array.isArray(body?.categoryTags)
      ? body.categoryTags.map((tag: unknown) => String(tag).trim().toLowerCase()).filter(Boolean).slice(0, 30)
      : [];
    const instruction = [
      "Extract this recipe for a meal-planning queue.",
      "Return the recipe title, the supplied page URL as source_ref, all ingredients needed to cook it, and 2-6 concise lowercase tags.",
      "Normalize ingredient names, preserve stated quantities, use numeric quantities when stated, and use qty null for 'to taste' or 'as needed'.",
      "For countable items with no unit, use unit 'item'. Exclude equipment and method steps.",
      categoryTags.length ? `Prefer these existing category tags when they accurately apply: ${categoryTags.join(", ")}.` : "Use practical tags such as soup, pasta, instant pot, slow cooker, vegetarian, chicken, fish, or quick.",
      `The source_ref must be exactly: ${url}`,
      `Recipe page content:\n${pageText}`,
    ].join("\n\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        reasoning: { effort: "none" },
        store: false,
        input: instruction,
        text: { format: { type: "json_schema", name: "imported_recipe", strict: true, schema: recipeSchema } },
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `OpenAI request failed (${response.status})`);
    const output = getOutputText(data);
    if (!output) throw new Error("The AI returned no recipe data.");
    const recipe = JSON.parse(output);
    recipe.source_ref = url;
    return json(recipe);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
