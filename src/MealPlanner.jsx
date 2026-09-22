import { createPortal } from 'react-dom';
import './MealPlanner.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { parseTags, recipeKey, matchesCategory, mealValidation } from "./mealPlanning";
import { PLANNER_CONFIG } from './plannerConfig';
import { extractionErrorMessage } from "./extractionError";
import { chooseQueueDay, frontQueuePosition, nextQueuePosition, queueForDay, queueInsertionBeforeTail, recipeTagsFor } from "./mealQueue";


const SUPABASE_URL = "https://qvibdnrfywisvfsqgqux.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2aWJkbnJmeXdpc3Zmc3FncXV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTE5MTcsImV4cCI6MjA5NDQ2NzkxN30.qPNjcpQpHPV5_SVz3U-JC18CcZ6vxio9vImA3CKg5jk";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

const emptyMeal = (meal_number) => ({
  id: null,
  meal_number,
  title: "",
  source_ref: "",
  ingredients: null,
  method: "",
  servings: null,
  extracted_at: null,
  rating: null,
  notes: "",
  queue_item_id: null,
  is_override: false,
  override_type: null,
});

function queueMealPayload(item, week, day) {
  return {
    week_of: week, meal_number: day, title: item.title.trim(), source_ref: item.source_ref.trim(),
    ingredients: item.ingredients, method: item.method || '', servings: item.servings ?? null, extracted_at: item.extracted_at, rating: item.rating, notes: item.notes || '',
    queue_item_id: item.id, is_override: false, override_type: null,
  };
}

function recipeDays(rows, recipe, dayField) {
  const key = recipeKey(recipe);
  return [...new Set(rows.filter(row => row?.title?.trim() && row?.source_ref?.trim() && recipeKey(row) === key).map(row => row[dayField]).filter(Boolean))].sort((a, b) => a - b);
}


function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function mondayForISOWeek(weekString) {
  const [yearStr, weekStr] = weekString.split("-W");
  const year = Number(yearStr), week = Number(weekStr);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const monday = new Date(year, 0, 4 - jan4Day + 1);
  monday.setDate(monday.getDate() + (week - 1) * 7);
  monday.setHours(0,0,0,0);
  return monday;
}

function shiftWeek(weekString, delta) {
  const d = mondayForISOWeek(weekString);
  d.setDate(d.getDate() + delta * 7);
  return isoWeek(d);
}

function formatWeekLabel(weekString) {
  const start = mondayForISOWeek(weekString);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const fmt = (d, withMonth = true) => d.toLocaleDateString("en-GB", withMonth ? { month:"short", day:"numeric" } : { day:"numeric" });
  const sameMonth = start.getMonth() === end.getMonth();
  return `Week of ${fmt(start)}–${sameMonth ? fmt(end,false) : fmt(end)}`;
}

function normalizeName(name) {
  return String(name || "").toLowerCase().trim().replace(/\s+/g, " ").replace(/^(fresh|frozen|boneless|skinless)\s+/g, "");
}

function canonicalHint(name) {
  const n = normalizeName(name);
  if (/\b(chicken|poultry)\b/.test(n)) return "chicken";
  if (/\bscallions?\b|\bspring onions?\b/.test(n)) return "spring onion";
  if (/\bcoriander\b|\bcilantro\b/.test(n)) return "coriander";
  if (/\bgarlic cloves?\b/.test(n)) return "garlic";
  return n;
}

function buildMergeSuggestions(ingredients) {
  const names = [...new Set(ingredients.map(i => normalizeName(i.name)).filter(Boolean))];
  const groups = new Map();
  for (const n of names) {
    const hint = canonicalHint(n);
    if (!groups.has(hint)) groups.set(hint, []);
    groups.get(hint).push(n);
  }
  for (let i=0;i<names.length;i++) for (let j=i+1;j<names.length;j++) {
    const a=names[i], b=names[j];
    if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) {
      const key = a.length < b.length ? a : b;
      const arr = groups.get(key) || [];
      for (const n of [a,b]) if (!arr.includes(n)) arr.push(n);
      groups.set(key, arr);
    }
  }
  return [...groups.entries()].filter(([, variants]) => variants.length > 1).map(([canonical, variants], idx) => ({ id:`m${idx}`, canonical, variants, enabled:true }));
}

function convertQty(qty, unit) {
  const q = Number(qty);
  if (!Number.isFinite(q)) return { qty:null, unit:String(unit||"").trim() };
  const u = String(unit||"").trim().toLowerCase();
  if (["kg","kilogram","kilograms"].includes(u)) return { qty:q*1000, unit:"g" };
  if (["g","gram","grams"].includes(u)) return { qty:q, unit:"g" };
  if (["l","litre","litres","liter","liters"].includes(u)) return { qty:q*1000, unit:"ml" };
  if (["ml","millilitre","millilitres","milliliter","milliliters"].includes(u)) return { qty:q, unit:"ml" };
  if (["tbsp","tablespoon","tablespoons"].includes(u)) return { qty:q, unit:"tbsp" };
  if (["tsp","teaspoon","teaspoons"].includes(u)) return { qty:q, unit:"tsp" };
  if (["item","items","","piece","pieces"].includes(u)) return { qty:q, unit:"item" };
  return { qty:q, unit:u };
}

function fmtNumber(n) {
  if (n == null) return "";
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/,'').replace(/\.$/,'');
}

function displayQty(qty, unit) {
  if (qty == null) return unit || "as needed";
  if (unit === "g" && qty >= 1000) return `${fmtNumber(qty/1000)} kg`;
  if (unit === "ml" && qty >= 1000) return `${fmtNumber(qty/1000)} L`;
  if (unit === "item") return `${fmtNumber(qty)}`;
  return `${fmtNumber(qty)} ${unit}`.trim();
}

function normalizeServings(value) {
  if (value === '' || value == null) return null;
  const servings = Number(value);
  return Number.isInteger(servings) && servings > 0 ? servings : null;
}

function aggregateIngredients(ingredients, suggestions) {
  const enabled = suggestions.filter(s => s.enabled);
  const alias = new Map();
  enabled.forEach(s => s.variants.forEach(v => alias.set(v, s.canonical)));
  const map = new Map();
  for (const ing of ingredients) {
    const raw = normalizeName(ing.name);
    const name = alias.get(raw) || raw;
    const { qty, unit } = convertQty(ing.qty, ing.unit);
    const key = `${name}|||${unit}`;
    if (!map.has(key)) map.set(key, { name, qty: qty == null ? null : 0, unit, textUnits: [] });
    const item = map.get(key);
    if (qty == null) item.textUnits.push(unit || "as needed"); else item.qty += qty;
  }
  const groupedByName = new Map();
  for (const item of map.values()) {
    if (!groupedByName.has(item.name)) groupedByName.set(item.name, []);
    groupedByName.get(item.name).push(item);
  }
  return [...groupedByName.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([name, parts]) => {
    const amounts = parts.map(p => p.qty == null ? [...new Set(p.textUnits)].join(" / ") : displayQty(p.qty,p.unit)).filter(Boolean);
    return `${name}, ${amounts.join(" + ")}`;
  });
}

function ExtractionModal({ meal, onClose, onSaved, category, tags, weeklyMealsTable }) {
  const [tab, setTab] = useState("photo");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState(meal.source_ref?.startsWith("http") ? meal.source_ref : "");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ingredients, setIngredients] = useState(Array.isArray(meal.ingredients) ? meal.ingredients : null);
  const [servings, setServings] = useState(meal.servings ?? '');
  const [rawJson, setRawJson] = useState(Array.isArray(meal.ingredients) ? JSON.stringify(meal.ingredients, null, 2) : "");

  useEffect(() => { if (ingredients) setRawJson(JSON.stringify(ingredients,null,2)); }, [ingredients]);

  async function extract() {
    setError(""); setLoading(true);
    try {
      let body;
      if (tab === "photo") {
        if (!file) throw new Error("Choose a recipe photo first.");
        const dataUrl = await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); });
        body = { mode:"photo", dataUrl };
      } else if (tab === "url") {
        if (!url.trim()) throw new Error("Paste a recipe URL first.");
        body = { mode:"url", url:url.trim() };
      } else {
        if (!text.trim()) throw new Error("Paste recipe text first.");
        body = { mode:"text", text:text.trim() };
      }
      const { data, error: fnError } = await sb.functions.invoke("meal-ingredients", { body });
      if (fnError) throw new Error(await extractionErrorMessage(fnError));
      if (data?.error) throw new Error(data.error);
      if (!Array.isArray(data?.ingredients)) throw new Error("The AI returned an unexpected response.");
      setIngredients(data.ingredients);
      if (normalizeServings(data.servings)) setServings(normalizeServings(data.servings));
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
    } finally { setLoading(false); }
  }

  function updateRow(idx, field, value) {
    setIngredients(prev => prev.map((x,i)=>i===idx ? { ...x, [field]: field === "qty" ? (value === "" ? null : Number(value)) : value } : x));
  }
  function syncRaw() {
    try {
      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed)) throw new Error();
      setIngredients(parsed.map(x=>({ name:String(x.name||""), qty:x.qty==null?null:Number(x.qty), unit:String(x.unit||"") })));
      setError("");
    } catch { setError("That JSON isn't a valid ingredient array yet."); }
  }
  async function save() {
    setError("");
    const validation = mealValidation(meal, tags, category);
    if (validation) { setError(validation); return; }
    if (!meal.title.trim() || !meal.source_ref.trim()) { setError("Add the meal title and source before saving ingredients."); return; }
    if (!Array.isArray(ingredients) || !ingredients.length) { setError("There are no ingredients to save."); return; }
    const clean = ingredients.map(x=>({ name:String(x.name||"").trim(), qty:x.qty==null?null:Number(x.qty), unit:String(x.unit||"").trim() })).filter(x=>x.name);
    const payload = {
      week_of: meal.week_of,
      meal_number: meal.meal_number,
      title: meal.title.trim(),
      source_ref: meal.source_ref.trim(),
      ingredients: clean,
      servings: normalizeServings(servings),
      extracted_at: new Date().toISOString(),
    };
    const { data, error: dbError } = await sb.from(weeklyMealsTable).upsert(payload, { onConflict:"week_of,meal_number" }).select().single();
    if (dbError) { setError(dbError.message); return; }
    onSaved(data); onClose();
  }

  return <div className="modalBack" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal">
      <div className="modalHead"><div><h3 className="sectionTitle" style={{fontSize:22}}>Load ingredients</h3><div className="small">Day {meal.meal_number}: {meal.title || "Untitled"}</div></div><button className="iconBtn" aria-label="Close ingredients" onClick={onClose}>×</button></div>
      <div className="tabs">
        {[["photo","Photo"],["url","URL"],["text","Text"]].map(([id,label])=><button key={id} className={`tab ${tab===id?"active":""}`} onClick={()=>{setTab(id);setError("")}}>{label}</button>)}
      </div>
      {!ingredients && <>
        {tab === "photo" && <label className="upload">{file ? `✓ ${file.name}` : "Tap to choose or take a photo of the recipe page"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" capture="environment" onChange={e=>setFile(e.target.files?.[0]||null)} /></label>}
        {tab === "url" && <><input className="input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."/><div className="hint">The backend fetches the page server-side, so browser CORS usually won't matter. Paywalled/private Raindrop pages may still fail.</div></>}
        {tab === "text" && <textarea className="textarea" value={text} onChange={e=>setText(e.target.value)} placeholder="Paste the recipe or ingredient list here…"/>}
        {error && <div className="status error" style={{marginLeft:0}}>{error}</div>}
        <div className="actions"><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={extract} disabled={loading}>{loading&&<span className="spinner"/>}{loading?"Extracting…":"Extract ingredients"}</button></div>
      </>}
      {ingredients && <>
        <label className="tagField">Servings yielded<input className="input" type="number" min="1" step="1" aria-label="Recipe servings" value={servings} onChange={e=>setServings(e.target.value)} placeholder="Not specified"/></label>
        <div className="reviewTable">
          {ingredients.map((ing,idx)=><div className="ingredientRow" key={idx}>
            <input className="input" value={ing.name} onChange={e=>updateRow(idx,"name",e.target.value)} placeholder="ingredient"/>
            <input className="input" type="number" step="any" value={ing.qty ?? ""} onChange={e=>updateRow(idx,"qty",e.target.value)} placeholder="qty"/>
            <input className="input" value={ing.unit} onChange={e=>updateRow(idx,"unit",e.target.value)} placeholder="unit"/>
            <button className="dangerBtn" onClick={()=>setIngredients(prev=>prev.filter((_,i)=>i!==idx))}>×</button>
          </div>)}
          <button className="btn ghost" onClick={()=>setIngredients(prev=>[...prev,{name:"",qty:null,unit:""}])}>+ Add ingredient</button>
        </div>
        <details className="jsonBox"><summary>Advanced: edit raw JSON</summary><textarea className="textarea jsonText" value={rawJson} onChange={e=>setRawJson(e.target.value)} onBlur={syncRaw}/></details>
        {error && <div className="status error" style={{marginLeft:0}}>{error}</div>}
        <div className="actions"><button className="btn secondary" onClick={()=>{setIngredients(null);setError("")}}>Start over</button><button className="btn" onClick={save}>Save ingredients</button></div>
      </>}
    </div>
  </div>;
}
function CategoryEditor({ categories, onSave, busy, dayNames }) {
  const [draft, setDraft] = useState(() => categories.map(c => ({ ...c, tagsText: c.accepted_tags.join(', ') })));
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    const next = draft.map(({ tagsText, ...c }) => ({ ...c, name: c.name.trim(), accepted_tags: parseTags(tagsText) }));
    const message = await onSave(next);
    setError(message || '');
  }
  return <form onSubmit={submit}>
    <p className="categoryIntro">Name any day and add its required recipe tags, separated by commas. A recipe must match at least one accepted tag. Leave tags empty to allow any recipe. {dayNames ? 'These categories stay in place as the queue rotates.' : 'These categories repeat every week.'}</p>
    <div className="categoryGrid">{draft.map((c, i) => <div className="categoryCard" key={c.day_number}>
      <h3>{dayNames?.[c.day_number - 1] || `Day ${c.day_number}`}</h3>
      <label className="tagField">Category name<input className="input" aria-label={`Day ${c.day_number} category name`} value={c.name} disabled={busy} placeholder="e.g. Soup Sunday" onChange={e => setDraft(prev => prev.map((x, j) => i === j ? { ...x, name: e.target.value } : x))}/></label>
      <label className="tagField">Accepted tags (any one)<input className="input" aria-label={`Day ${c.day_number} accepted tags`} value={c.tagsText} disabled={busy} placeholder="e.g. instant pot, slow cooker" onChange={e => setDraft(prev => prev.map((x, j) => i === j ? { ...x, tagsText: e.target.value } : x))}/></label>
    </div>)}</div>
    {error && <div className="saveError" role="alert">{error}</div>}
    <div className="actions"><button className="btn" disabled={busy}>Save day categories</button></div>
  </form>;
}

function RecipeImporter({ categories, onImport, onManual, busy, dayNames, autoQueue = false }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  async function importTo(destination) {
    setError('');
    const message = await onImport(url.trim(), destination);
    if (message) setError(message); else setUrl('');
  }
  return <form className="importForm" onSubmit={e => { e.preventDefault(); importTo('queue'); }}>
    <div className="rowBetween"><div><h2 className="sectionTitle">Add a recipe</h2><div className="small">Paste a recipe URL to extract its details, or enter a recipe yourself.</div></div><button type="button" className="btn ghost" disabled={busy} onClick={onManual}>Add manually</button></div>
    <div className="importRow"><input className="input" aria-label="Recipe URL to import" type="url" value={url} disabled={busy} required placeholder="https://…" onChange={e => setUrl(e.target.value)}/><div className="importActions">{!autoQueue && <button type="button" className="btn secondary" disabled={busy || !url.trim()} onClick={() => importTo('library')}>{busy ? 'Importing…' : 'Save to library'}</button>}<button className="btn" disabled={busy || !url.trim()}>{busy ? 'Importing…' : autoQueue ? 'Import recipe' : 'Import & queue'}</button></div></div>
    {error && <div className="saveError" role="alert">{error}</div>}
    {!autoQueue && <div className="hint">Queue choices follow your day categories: {categories.filter(c => c.accepted_tags?.length).map(c => `${dayNames?.[c.day_number - 1] || `Day ${c.day_number}`} · ${c.name || c.accepted_tags.join(' or ')}`).join('; ') || 'all days currently accept any recipe'}.</div>}
  </form>;
}

function ManualRecipeModal({ busy, onClose, onSave, autoQueue = false }) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');
  const [method, setMethod] = useState('');
  const [servings, setServings] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [error, setError] = useState('');
  async function save(destination) {
    setError('');
    const ingredients = ingredientsText.split('\n').map(line => line.trim()).filter(Boolean).map(name => ({ name, qty: null, unit: '' }));
    if (!title.trim()) { setError('Add a recipe title.'); return; }
    if (!source.trim()) { setError('Add a recipe URL or source.'); return; }
    if (!ingredients.length) { setError('Add at least one ingredient.'); return; }
    if (servings !== '' && !normalizeServings(servings)) { setError('Servings must be a positive whole number.'); return; }
    const message = await onSave({ title: title.trim(), source_ref: source.trim(), ingredients, method: method.trim(), servings: normalizeServings(servings), tags: parseTags(tagsText) }, destination);
    if (message) setError(message);
  }
  return <div className="modalBack" role="dialog" aria-modal="true" aria-label="Add a recipe manually" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><div className="modal recipeDetailsModal">
    <div className="modalHead"><div><h2 className="sectionTitle">Add a recipe</h2><div className="small">Enter recipe details manually</div></div><button type="button" className="iconBtn" aria-label="Close manual recipe" disabled={busy} onClick={onClose}>×</button></div>
    <label className="tagField">Recipe title<input className="input" aria-label="Manual recipe title" value={title} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder="Recipe name"/></label>
    <label className="tagField">Recipe URL or source<input className="input" aria-label="Manual recipe URL or source" value={source} disabled={busy} onChange={event => setSource(event.target.value)} placeholder="Recipe URL, cookbook and page, or note"/></label>
    <label className="tagField">Recipe tags<input className="input" aria-label="Manual recipe tags" value={tagsText} disabled={busy} onChange={event => setTagsText(event.target.value)} placeholder="e.g. soup, vegetarian"/></label>
    <label className="tagField">Servings yielded<input className="input" type="number" min="1" step="1" aria-label="Manual recipe servings" value={servings} disabled={busy} onChange={event => setServings(event.target.value)} placeholder="Not specified"/></label>
    <label className="tagField recipeMethod">Ingredients<textarea className="input" aria-label="Manual recipe ingredients" value={ingredientsText} disabled={busy} onChange={event => setIngredientsText(event.target.value)} rows="8" placeholder={'Enter one ingredient per line\ne.g. 2 carrots\n1 tbsp olive oil'}/></label>
    <label className="tagField recipeMethod">Method<textarea className="input" aria-label="Manual recipe method" value={method} disabled={busy} onChange={event => setMethod(event.target.value)} rows="10" placeholder="Type or paste the cooking method here…"/></label>
    {error && <div className="saveError" role="alert">{error}</div>}
    <div className="actions"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Cancel</button>{!autoQueue && <button type="button" className="btn secondary" disabled={busy} onClick={() => save('library')}>{busy ? 'Saving…' : 'Save to library'}</button>}<button type="button" className="btn" disabled={busy} onClick={() => save('queue')}>{busy ? 'Saving…' : autoQueue ? 'Save recipe' : 'Save & queue'}</button></div>
  </div></div>;
}

function QueueRecipe({ item, index, count, tags, categories, busy, onTagsSaved, onMove, onBump, dayNames, current }) {
  const [draft, setDraft] = useState(tags.join(', '));
  const [error, setError] = useState('');
  useEffect(() => setDraft(tags.join(', ')), [tags]);
  const changed = JSON.stringify(parseTags(draft)) !== JSON.stringify(parseTags(tags));
  return <div className="queueRecipe">
    <div className="queuePosition">{index + 1}</div>
    <div className="queueRecipeBody"><h4>{item.title}{current ? ' · Current' : ''}</h4><div className="small">{item.source_ref}</div>
      <label className="tagField">Recipe tags<input className="input" aria-label={`Queue tags for ${item.title}`} value={draft} disabled={busy} onChange={e => setDraft(e.target.value)}/></label>
      <div className="queueActions">
        <button className="btn ghost" disabled={busy || !changed} onClick={async () => setError(await onTagsSaved(item, parseTags(draft)) || '')}>Save tags</button>
        <label className="queueAssign">Assign to<select className="input" aria-label={`Queue day for ${item.title}`} value={item.day_number} disabled={busy || changed || current} onChange={e => onMove(item.id, Number(e.target.value))}>{categories.map(c => <option key={c.day_number} value={c.day_number} disabled={c.day_number !== item.day_number && !matchesCategory(tags, c)}>{dayNames?.[c.day_number - 1] || `Day ${c.day_number}`}{c.name ? ` · ${c.name}` : ''}</option>)}</select></label>
        <button className="iconQueueBtn" aria-label={`Move ${item.title} earlier`} disabled={busy || changed || current || index === 0} onClick={() => onBump(item.id, -1)}>↑</button>
        <button className="iconQueueBtn" aria-label={`Move ${item.title} later`} disabled={busy || changed || current || index === count - 1} onClick={() => onBump(item.id, 1)}>↓</button>
      </div>
      {error && <div className="saveError" role="alert">{error}</div>}
    </div>
  </div>;
}

function QueueManager({ queue, categories, tagMap, busy, onClose, onTagsSaved, onMove, onBump, dayNames, meals, rotating }) {
  const currentIds = new Set(meals.map(meal => meal.queue_item_id).filter(Boolean));
  return <div className="modalBack" role="dialog" aria-modal="true" aria-label="Manage recipe queues"><div className="modal queueModal">
    <div className="modalHead"><div><h2 className="sectionTitle">Recipe queues</h2><div className="small">{rotating ? 'The current breakfast stays scheduled until you mark it made. It then moves to the back and the first waiting recipe takes its place.' : 'The first recipe in each queue fills that day. Reorder recipes or move them to another day.'}</div></div><button className="iconBtn" aria-label="Close recipe queues" onClick={onClose}>×</button></div>
    <div className="queueColumns">{categories.map(category => { const rows = queueForDay(queue, category.day_number); return <section className="queueDay" key={category.day_number}>
      <h3>{dayNames?.[category.day_number - 1] || `Day ${category.day_number}`}{category.name ? ` · ${category.name}` : ''}</h3><div className="small">{category.accepted_tags?.length ? `Accepts ${category.accepted_tags.join(' or ')}` : 'No required tag'}</div>
      {rows.length ? rows.map((item, index) => <QueueRecipe key={item.id} item={item} index={index} count={rows.length} tags={recipeTagsFor(item, tagMap)} categories={categories} busy={busy} onTagsSaved={onTagsSaved} onMove={onMove} onBump={onBump} dayNames={dayNames} current={rotating && currentIds.has(item.id)}/>) : <div className="empty queueEmpty">Queue empty</div>}
    </section>; })}</div>
  </div></div>;
}

function SwitchMealModal({ day, library, tagMap, busy, onClose, onSave, rotating = false }) {
  const [type, setType] = useState('manual');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('Manual recipe');
  const [tagsText, setTagsText] = useState('');
  const [servings, setServings] = useState('');
  const [libraryKey, setLibraryKey] = useState('');
  const [error, setError] = useState('');
  function changeType(next) {
    setType(next); setError('');
    if (next === 'manual') setSource('Manual recipe');
    if (next === 'cookbook') setSource('Cookbook');
    if (next === 'printed') setSource('Printed recipe');
  }
  async function submit(e) {
    e.preventDefault();
    let recipe = { title: title.trim(), source_ref: source.trim(), ingredients: null, method: '', servings: normalizeServings(servings), extracted_at: null, rating: null, notes: '' };
    let tags = parseTags(tagsText);
    if (type === 'library') {
      recipe = library.find(row => recipeKey(row) === libraryKey);
      if (!recipe) { setError('Choose a recipe first.'); return; }
      tags = recipeTagsFor(recipe, tagMap);
    }
    if (!recipe.title || !recipe.source_ref) { setError('Add the recipe title and source.'); return; }
    if (type !== 'library' && servings !== '' && !normalizeServings(servings)) { setError('Servings must be a positive whole number.'); return; }
    const message = await onSave(recipe, type, tags);
    if (message) setError(message); else onClose();
  }
  return <div className="modalBack" role="dialog" aria-modal="true" aria-label={`Switch Day ${day}`}><form className="modal switchModal" onSubmit={submit}>
    <div className="modalHead"><div><h2 className="sectionTitle">Switch Day {day}</h2><div className="small">The queued recipe stays first in line until this temporary meal is {rotating ? 'marked made' : 'cooked'}.</div></div><button type="button" className="iconBtn" aria-label="Close switch meal" onClick={onClose}>×</button></div>
    <div className="tabs switchTabs">{['manual','cookbook','printed','library'].map(value => <button type="button" key={value} className={`tab ${type === value ? 'active' : ''}`} onClick={() => changeType(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
    {type === 'library' ? <label className="tagField">Library recipe<select className="input" aria-label="Library recipe for switch" value={libraryKey} onChange={e => setLibraryKey(e.target.value)}><option value="">Choose a recipe…</option>{library.map(row => <option key={row.recipe_key} value={recipeKey(row)}>{row.title}</option>)}</select></label> : <>
      <label className="tagField">Recipe title<input className="input" aria-label="Switch recipe title" value={title} onChange={e => setTitle(e.target.value)}/></label>
      <label className="tagField">Source<input className="input" aria-label="Switch recipe source" value={source} onChange={e => setSource(e.target.value)} placeholder="Cookbook and page, printed recipe, or note"/></label>
      <label className="tagField">Recipe tags<input className="input" aria-label="Switch recipe tags" value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="e.g. pasta, soup"/></label>
      <label className="tagField">Servings yielded<input className="input" type="number" min="1" step="1" aria-label="Switch recipe servings" value={servings} onChange={e => setServings(e.target.value)} placeholder="Not specified"/></label>
    </>}
    {error && <div className="saveError" role="alert">{error}</div>}
    <div className="actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>Switch meal</button></div>
  </form></div>;
}

function RecipeDetailsModal({ recipe, tags, scheduledDays, queuedDays, busy, cookedBusy, onTagsSaved, onToggleCooked, onClose, onSave, showCookedStatus = true, statusMode = 'cooked' }) {
  const [source, setSource] = useState(recipe.source_ref || '');
  const [method, setMethod] = useState(recipe.method || '');
  const [servings, setServings] = useState(recipe.servings ?? '');
  const [tagsText, setTagsText] = useState(tags.join(', '));
  const [tagSaveState, setTagSaveState] = useState('idle');
  const [error, setError] = useState('');
  const onTagsSavedRef = useRef(onTagsSaved);
  const recipeRef = useRef(recipe);
  useEffect(() => { onTagsSavedRef.current = onTagsSaved; }, [onTagsSaved]);
  useEffect(() => { recipeRef.current = recipe; }, [recipe]);
  useEffect(() => setTagsText(tags.join(', ')), [tags]);
  const tagsChanged = JSON.stringify(parseTags(tagsText)) !== JSON.stringify(parseTags(tags));
  useEffect(() => {
    if (!tagsChanged) {
      setTagSaveState(current => current === 'pending' ? 'idle' : current);
      return;
    }
    setTagSaveState('pending'); setError('');
    const timer = window.setTimeout(async () => {
      setTagSaveState('saving');
      const message = await onTagsSavedRef.current(recipeRef.current, parseTags(tagsText), { quiet: true });
      if (message) { setError(message); setTagSaveState('error'); }
      else setTagSaveState('saved');
    }, 650);
    return () => window.clearTimeout(timer);
  }, [tagsText, tagsChanged]);
  useEffect(() => {
    if (tagSaveState !== 'saved') return;
    const timer = window.setTimeout(() => setTagSaveState('idle'), 1600);
    return () => window.clearTimeout(timer);
  }, [tagSaveState]);
  const tagsSaving = (tagsChanged && tagSaveState !== 'error') || tagSaveState === 'saving';
  const changed = source.trim() !== String(recipe.source_ref || '').trim() || method !== (recipe.method || '') || normalizeServings(servings) !== (recipe.servings ?? null);
  async function submit(event) {
    event.preventDefault(); setError('');
    if (tagsChanged || tagSaveState === 'saving') { setError('Wait for recipe tags to save before saving other changes.'); return; }
    if (!source.trim()) { setError('Add a recipe URL or source.'); return; }
    if (servings !== '' && !normalizeServings(servings)) { setError('Servings must be a positive whole number.'); return; }
    const message = await onSave(recipe, { source_ref: source.trim(), method, servings: normalizeServings(servings) });
    if (message) setError(message);
  }
  return <div className="modalBack" role="dialog" aria-modal="true" aria-label={`Recipe details for ${recipe.title}`} onMouseDown={event => { if (event.target === event.currentTarget && !busy && !tagsSaving) onClose(); }}><form className="modal recipeDetailsModal" onSubmit={submit}>
    <div className="modalHead"><div><h2 className="sectionTitle">{recipe.title}</h2><div className="small">Recipe details</div></div><button type="button" className="iconBtn" aria-label="Close recipe details" disabled={busy || tagsSaving} onClick={onClose}>×</button></div>
    <div className="recipeDetailStatuses">{recipe.servings && <span className="recipeStatus">Serves {recipe.servings}</span>}{showCookedStatus && <button type="button" className={`recipeStatus statusButton ${recipe.has_been_cooked ? 'isCooked' : ''}`} disabled={busy || cookedBusy} aria-label={`${recipe.has_been_cooked ? `Mark as not ${statusMode === 'tried' ? 'tried' : 'cooked yet'}` : `Mark as ${statusMode === 'tried' ? 'tried' : 'cooked'}`}: ${recipe.title}`} onClick={async () => { const message = await onToggleCooked(recipe); if (message) setError(message); else setError(''); }}>{cookedBusy ? 'Updating…' : recipe.has_been_cooked ? statusMode === 'tried' ? '✓ Tried' : '✓ Cooked' : statusMode === 'tried' ? 'Not tried yet' : 'Not cooked yet'}</button>}{scheduledDays.length > 0 && <span className="recipeStatus isScheduled">Scheduled · {scheduledDays.length === 1 ? 'Day' : 'Days'} {scheduledDays.join(', ')}</span>}{queuedDays.length > 0 && <span className="recipeStatus isQueued">Queued · {queuedDays.length === 1 ? 'Day' : 'Days'} {queuedDays.join(', ')}</span>}</div>
    <label className="tagField recipeDetailTags">Recipe tags<input className="input" aria-label={`Tags for ${recipe.title} in details`} value={tagsText} disabled={busy || tagSaveState === 'saving'} onChange={event => setTagsText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="e.g. soup, vegetarian"/></label>
    {tagSaveState !== 'idle' && <div className={`tagSaveState ${tagSaveState}`} role="status">{tagSaveState === 'pending' ? 'Saving soon…' : tagSaveState === 'saving' ? 'Saving…' : tagSaveState === 'saved' ? '✓ Tags saved' : 'Tag save failed'}</div>}
    <label className="tagField">Recipe URL or source<input className="input" aria-label={`URL or source for ${recipe.title}`} value={source} disabled={busy} onChange={event => setSource(event.target.value)} placeholder="Recipe URL, cookbook and page, or note"/></label>
    <label className="tagField">Servings yielded<input className="input" type="number" min="1" step="1" aria-label={`Servings for ${recipe.title}`} value={servings} disabled={busy} onChange={event => setServings(event.target.value)} placeholder="Not specified"/></label>
    <div className="recipeDetailSection"><h3>Ingredients</h3>{recipe.ingredients?.length > 0 ? <ul>{recipe.ingredients.map((ingredient, index) => <li key={`${ingredient.name}-${index}`}>{ingredient.name}{(ingredient.qty != null || ingredient.unit) ? ` · ${displayQty(ingredient.qty, ingredient.unit)}` : ''}</li>)}</ul> : <div className="small">No ingredients saved yet.</div>}</div>
    <label className="tagField recipeMethod">Method<textarea className="input" aria-label={`Method for ${recipe.title}`} value={method} disabled={busy} onChange={event => setMethod(event.target.value)} rows="10" placeholder="Type or paste the cooking method here…"/></label>
    {error && <div className="saveError" role="alert">{error}</div>}
    <div className="actions"><button type="button" className="btn secondary" disabled={busy || tagsSaving} onClick={onClose}>Cancel</button><button className="btn" disabled={busy || tagsChanged || tagSaveState === 'saving' || !changed}>{busy ? 'Saving…' : 'Save changes'}</button></div>
  </form></div>;
}

function RecipeCard({ meal, tags, scheduledDays = [], queuedDays = [], onTagsSaved, onToggleCooked, cookedBusy, onOpenDetails, onUse, onQueue, onDelete, busy, draggable = false, onDragStart, onDragEnd, showCookedStatus = true, statusMode = 'cooked' }) {
  const [draft, setDraft] = useState(tags.join(', '));
  const [error, setError] = useState('');
  const [using, setUsing] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const onTagsSavedRef = useRef(onTagsSaved);
  const mealRef = useRef(meal);
  useEffect(() => { onTagsSavedRef.current = onTagsSaved; }, [onTagsSaved]);
  useEffect(() => { mealRef.current = meal; }, [meal]);
  useEffect(() => setDraft(tags.join(', ')), [tags]);
  const draftTags = parseTags(draft);
  const changed = JSON.stringify(draftTags) !== JSON.stringify(parseTags(tags));
  useEffect(() => {
    if (!changed) {
      setSaveState(current => current === 'pending' ? 'idle' : current);
      return;
    }
    setSaveState('pending'); setError('');
    const timer = window.setTimeout(async () => {
      setSaveState('saving');
      const message = await onTagsSavedRef.current(mealRef.current, parseTags(draft), { quiet: true });
      if (message) { setError(message); setSaveState('error'); }
      else setSaveState('saved');
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draft, changed]);
  useEffect(() => {
    if (saveState !== 'saved') return;
    const timer = window.setTimeout(() => setSaveState('idle'), 1600);
    return () => window.clearTimeout(timer);
  }, [saveState]);
  const tagsSaving = changed || saveState === 'saving';
  return <div className={`recipeCard${draggable ? ' draggableRecipe' : ''}`} draggable={draggable && !busy && !changed} onDragStart={e => onDragStart?.(e, meal)} onDragEnd={onDragEnd}>
    <div className="recipeCardHead"><div><h4>{meal.title}</h4><div className="small">{meal.source_ref}</div></div><div className="recipeCardMeta">{meal.servings && <span className="recipeStatus">Serves {meal.servings}</span>}{showCookedStatus && <button type="button" className={`recipeStatus statusButton ${meal.has_been_cooked ? 'isCooked' : ''}`} disabled={busy || cookedBusy || using} aria-label={`${meal.has_been_cooked ? `Mark as not ${statusMode === 'tried' ? 'tried' : 'cooked yet'}` : `Mark as ${statusMode === 'tried' ? 'tried' : 'cooked'}`}: ${meal.title}`} onClick={async () => setError(await onToggleCooked(meal) || '')}>{cookedBusy ? 'Updating…' : meal.has_been_cooked ? statusMode === 'tried' ? '✓ Tried' : '✓ Cooked' : statusMode === 'tried' ? 'Not tried yet' : 'Not cooked yet'}</button>}{scheduledDays.length > 0 && <span className="recipeStatus isScheduled">Scheduled · {scheduledDays.length === 1 ? 'Day' : 'Days'} {scheduledDays.join(', ')}</span>}{queuedDays.length > 0 && <span className="recipeStatus isQueued">Queued · {queuedDays.length === 1 ? 'Day' : 'Days'} {queuedDays.join(', ')}</span>}{draggable && <span className="dragHint" aria-hidden="true">Drag to a day</span>}</div></div>
    <label className="tagField">Recipe tags<input className="input" aria-label={`Tags for ${meal.title}`} value={draft} disabled={busy || saveState === 'saving'} onChange={e => setDraft(e.target.value)} placeholder="e.g. soup, vegetarian"/></label>
    <div className="dayActions">
      {saveState !== 'idle' && <span className={`tagSaveState ${saveState}`}>{saveState === 'pending' ? 'Saving soon…' : saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Tags saved' : 'Save failed'}</span>}
      <button className="btn" disabled={busy || tagsSaving || using || cookedBusy} onClick={async () => { setUsing(true); try { setError(await onUse(meal) || ''); } finally { setUsing(false); } }}>{using ? 'Adding…' : 'Use recipe'}</button>
      <button className="btn secondary" disabled={busy || tagsSaving || using || queuedDays.length > 0} onClick={async () => setError(await onQueue(meal) || '')}>{queuedDays.length > 0 ? 'Queued' : 'Send to queue'}</button>
      <button type="button" className="btn secondary" disabled={busy || tagsSaving || using} onClick={() => onOpenDetails(meal)}>View recipe</button>
      {onDelete && <button className="btn dangerOutline" disabled={busy || tagsSaving || using} onClick={() => onDelete(meal)}>Delete</button>}
    </div>
    {error && <div className="saveError" role="alert">{error}</div>}
  </div>;
}

export function MealPlannerWorkspace({ mealType = 'dinner', onDirtyChange, onBack } = {}) {
  const config = PLANNER_CONFIG[mealType] || PLANNER_CONFIG.dinner;
  const from = table => sb.from(config.tables[table]);
  const dayName = day => config.dayNames?.[day - 1] || `Day ${day}`;
  function queueDayFor(tags) {
    if (config.capsule && !categories.some(category => matchesCategory(tags, category))) {
      throw new Error('Add a tag that matches a breakfast category before sending this recipe to a queue.');
    }
    return chooseQueueDay(tags, categories, meals);
  }
  async function insertQueuedRecipe(payload, day) {
    let baseQueue = queueRows;
    let position = nextQueuePosition(queueRows, day);
    if (config.capsule) {
      const insertion = queueInsertionBeforeTail(queueRows, day);
      position = insertion.position;
      if (insertion.tail) {
        const shiftedPosition = Number(insertion.tail.position) + 1;
        const { error: shiftError } = await from('meal_recipe_queue').update({ position: shiftedPosition }).eq('id', insertion.tail.id);
        if (shiftError) throw shiftError;
        baseQueue = queueRows.map(row => row.id === insertion.tail.id ? { ...row, position: shiftedPosition } : row);
      }
    }
    const { data: queued, error } = await from('meal_recipe_queue').insert({ ...payload, day_number: day, position }).select().single();
    if (error) throw error;
    return { queued, nextQueue: [...baseQueue, queued] };
  }
  const [week, setWeek] = useState(config.capsule ? 'breakfast-capsule' : isoWeek(new Date()));
  const [meals, setMeals] = useState([]);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [reload, setReload] = useState(0);
  const [categories, setCategories] = useState(config.defaultCategories);
  const [recipeTags, setRecipeTags] = useState({});
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mealErrors, setMealErrors] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modalMeal, setModalMeal] = useState(null);
  const [groceryGenerated, setGroceryGenerated] = useState(false);
  const [mergeSuggestions, setMergeSuggestions] = useState([]);
  const [pastRows, setPastRows] = useState([]);
  const [libraryRecords, setLibraryRecords] = useState([]);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [librarySearch, setLibrarySearch] = useState('');
  const [draggedRecipeKey, setDraggedRecipeKey] = useState('');
  const [dropTarget, setDropTarget] = useState(null);
  const [draggedMealNumber, setDraggedMealNumber] = useState(null);
  const [libraryDropActive, setLibraryDropActive] = useState(false);
  const [queueRows, setQueueRows] = useState([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [switchDay, setSwitchDay] = useState(null);
  const [detailsRecipe, setDetailsRecipe] = useState(null);
  const [cookedUpdatingKey, setCookedUpdatingKey] = useState('');
  const useInFlight = useRef(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [toast, setToast] = useState('');
  const dirty = meals.some(m => m.dirty);
  useEffect(() => {
    onDirtyChange?.(dirty || busy || !!modalMeal || settingsOpen || queueOpen || switchDay !== null || !!detailsRecipe || manualOpen);
    return () => onDirtyChange?.(false);
  }, [dirty, busy, modalMeal, settingsOpen, queueOpen, switchDay, detailsRecipe, manualOpen, onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    setLoadingWeek(true); setLoadError(''); setGroceryGenerated(false); setMealErrors({}); setSettingsOpen(false);
    async function load() {
      try {
        const responses = await Promise.all([
          from('weekly_meals').select('*').eq('week_of', week).order('meal_number'),
          from('weekly_meals').select('*').order('week_of', { ascending: false }).order('meal_number'),
          from('meal_recipe_tags').select('*'),
          from('meal_day_categories').select('*').order('day_number'),
          from('meal_recipe_library').select('*').order('cooked_at', { ascending: false }),
          from('meal_recipe_queue').select('*').order('day_number').order('position').order('created_at'),
        ]);
        if (cancelled) return;
        const failed = responses.find(r => r.error);
        if (failed) throw failed.error;
        const [current, past, tagRows, dayRows, libraryRows, queuedRows] = responses.map(r => r.data || []);
        if (dayRows.length !== config.slotCount) throw new Error('Day categories could not be loaded. Please retry.');
        const tags = Object.fromEntries(tagRows.map(r => [r.recipe_key, parseTags(r.tags)]));
        const next = Array.from({ length: config.slotCount }, (_, i) => ({ ...emptyMeal(i + 1), week_of: week, tagsText: '', dirty: false }));
        current.forEach(row => {
          if (row.meal_number >= 1 && row.meal_number <= config.slotCount) next[row.meal_number - 1] = { ...row, tagsText: (tags[recipeKey(row)] || []).join(', '), dirty: false };
        });
        if (config.capsule || week === isoWeek(new Date())) {
          for (let day = 1; day <= config.slotCount; day += 1) {
            const slot = next[day - 1];
            const front = queueForDay(queuedRows, day)[0];
            if ((!slot.title.trim() && !slot.source_ref.trim()) && front) {
              const { data: saved, error } = await from('weekly_meals').upsert(queueMealPayload(front, week, day), { onConflict: 'week_of,meal_number' }).select().single();
              if (error) throw error;
              next[day - 1] = { ...saved, tagsText: recipeTagsFor(front, tags).join(', '), dirty: false };
            }
          }
        }
        setMeals(next); setPastRows(past); setLibraryRecords(libraryRows); setQueueRows(queuedRows); setRecipeTags(tags); setCategories(dayRows);
      } catch (e) { if (!cancelled) setLoadError(e.message || 'Could not load the meal planner.'); }
      finally { if (!cancelled) setLoadingWeek(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [week, reload]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const categoryFor = day => categories.find(c => c.day_number === day);
  function changeWeek(delta) {
    if (dirty && !window.confirm('Discard unsaved meal changes and switch weeks?')) return;
    setWeek(shiftWeek(week, delta));
  }
  function updateMealField(index, field, value) {
    setMeals(prev => prev.map((m, i) => i === index ? { ...m, [field]: value, dirty: true } : m));
    setMealErrors(prev => ({ ...prev, [index]: '' }));
    setGroceryGenerated(false);
  }
  function applyTags(key, tags, savedIndex = -1) {
    setRecipeTags(prev => ({ ...prev, [key]: tags }));
    setMeals(prev => prev.map((m, i) => recipeKey(m) === key && (i === savedIndex || !m.dirty) ? { ...m, tagsText: tags.join(', ') } : m));
    setGroceryGenerated(false);
  }
  async function persistMeal(meal, tags, allowCategoryOverride = false) {
    const validation = allowCategoryOverride
      ? (!meal.title.trim() || !meal.source_ref.trim() ? 'Add a meal title and source first.' : '')
      : mealValidation(meal, tags, categoryFor(meal.meal_number));
    if (validation) throw new Error(validation);
    const key = recipeKey(meal);
    const { error: tagError } = await from('meal_recipe_tags').upsert({ recipe_key: key, tags });
    if (tagError) throw tagError;
    applyTags(key, tags, meal.meal_number - 1);
    const payload = {
      week_of: week, meal_number: meal.meal_number, title: meal.title.trim(), source_ref: meal.source_ref.trim(),
      ingredients: meal.ingredients, method: meal.method || '', servings: meal.servings ?? null, extracted_at: meal.extracted_at, rating: meal.rating, notes: meal.notes || '',
      queue_item_id: meal.queue_item_id || null, is_override: !!meal.is_override, override_type: meal.override_type || null,
    };
    const { data, error } = await from('weekly_meals').upsert(payload, { onConflict: 'week_of,meal_number' }).select().single();
    if (error) throw error;
    const saved = { ...data, tagsText: tags.join(', '), dirty: false };
    setMeals(prev => prev.map(m => m.meal_number === saved.meal_number ? saved : m));
    return saved;
  }
  async function saveMeal(index, extractAfter = false) {
    if (busy || loadingWeek || loadError) return;
    setBusy(true); setMealErrors(prev => ({ ...prev, [index]: '' }));
    try {
      const saved = await persistMeal(meals[index], parseTags(meals[index].tagsText), meals[index].is_override);
      if (extractAfter) setModalMeal(saved);
      else setToast(`Day ${saved.meal_number} saved`);
    } catch (e) { setMealErrors(prev => ({ ...prev, [index]: e.message || 'Could not save this meal. Please retry.' })); }
    finally { setBusy(false); }
  }
  async function saveCategories(next) {
    setBusy(true);
    try {
      const { error } = await from('meal_day_categories').upsert(next);
      if (error) throw error;
      setCategories(next); setSettingsOpen(false); setGroceryGenerated(false); setToast('Day categories saved');
      return '';
    } catch (e) { return e.message || 'Could not save categories. Please retry.'; }
    finally { setBusy(false); }
  }
  async function savePastTags(meal, tags, { quiet = false } = {}) {
    if (!quiet) setBusy(true);
    try {
      const key = recipeKey(meal);
      const { error } = await from('meal_recipe_tags').upsert({ recipe_key: key, tags });
      if (error) throw error;
      applyTags(key, tags);
      if (!quiet) setToast('Recipe tags saved');
      return '';
    } catch (e) { return e.message || 'Could not save tags. Please retry.'; }
    finally { if (!quiet) setBusy(false); }
  }
  async function saveRecipeDetails(recipe, details) {
    if (busy) return 'Please wait for the current save.';
    setBusy(true);
    try {
      const oldKey = recipeKey(recipe);
      const source = String(details.source_ref || '').trim();
      const key = recipeKey({ ...recipe, source_ref: source });
      const collision = libraryRecords.find(row => !row.is_deleted && row.recipe_key !== oldKey && String(row.source_ref || '').trim() === source);
      if (collision) throw new Error(`That source is already used by ${collision.title}.`);
      const existing = libraryRecords.find(row => row.recipe_key === oldKey);
      const tags = recipeTags[oldKey] || [];
      const payload = {
        recipe_key: key, title: recipe.title.trim(), source_ref: source, ingredients: recipe.ingredients,
        method: String(details.method || '').trim(), servings: details.servings ?? null, extracted_at: recipe.extracted_at, rating: recipe.rating, notes: recipe.notes || '',
        cooked_at: existing?.cooked_at || recipe.cooked_at || new Date().toISOString(),
        has_been_cooked: !!(existing?.has_been_cooked || recipe.has_been_cooked), is_deleted: false,
      };
      if (key !== oldKey) {
        const { error: tagError } = await from('meal_recipe_tags').upsert({ recipe_key: key, tags });
        if (tagError) throw tagError;
      }
      const { data: saved, error } = await from('meal_recipe_library').upsert(payload, { onConflict: 'recipe_key' }).select().single();
      if (error) throw error;
      if (key !== oldKey && existing) {
        const { error: oldRecordError } = await from('meal_recipe_library').update({ is_deleted: true }).eq('recipe_key', oldKey);
        if (oldRecordError) throw oldRecordError;
      }
      const { error: queueError } = await from('meal_recipe_queue').update({ source_ref: source, method: payload.method, servings: payload.servings }).eq('source_ref', recipe.source_ref);
      if (queueError) throw queueError;
      const { error: scheduleError } = await from('weekly_meals').update({ source_ref: source, method: payload.method, servings: payload.servings }).eq('source_ref', recipe.source_ref);
      if (scheduleError) throw scheduleError;
      if (key !== oldKey) setRecipeTags(prev => ({ ...prev, [key]: tags }));
      setLibraryRecords(prev => [saved, ...prev.filter(row => row.recipe_key !== oldKey && row.recipe_key !== key)]);
      setQueueRows(prev => prev.map(row => recipeKey(row) === oldKey ? { ...row, source_ref: source, method: payload.method, servings: payload.servings } : row));
      setMeals(prev => prev.map(row => recipeKey(row) === oldKey ? { ...row, source_ref: source, method: payload.method, servings: payload.servings } : row));
      setDetailsRecipe(null);
      setToast('Recipe details saved');
      return '';
    } catch (e) { return e.message || 'Could not save the recipe details. Please retry.'; }
    finally { setBusy(false); }
  }
  async function toggleCookedStatus(recipe) {
    const key = recipeKey(recipe);
    if (busy || cookedUpdatingKey === key) return 'Please wait for the current save.';
    setCookedUpdatingKey(key);
    try {
      const existing = libraryRecords.find(row => row.recipe_key === key);
      const cooked = !recipe.has_been_cooked;
      const payload = {
        recipe_key: key, title: recipe.title.trim(), source_ref: recipe.source_ref.trim(),
        ingredients: recipe.ingredients || [], method: recipe.method || '', servings: recipe.servings ?? null, extracted_at: recipe.extracted_at || null,
        rating: recipe.rating ?? null, notes: recipe.notes || '',
        cooked_at: cooked ? new Date().toISOString() : existing?.cooked_at || recipe.cooked_at || new Date().toISOString(),
        has_been_cooked: cooked, is_deleted: false,
      };
      const { data: saved, error } = await from('meal_recipe_library').upsert(payload, { onConflict: 'recipe_key' }).select().single();
      if (error) throw error;
      setLibraryRecords(prev => [saved, ...prev.filter(row => row.recipe_key !== key)]);
      return '';
    } catch (e) { return e.message || 'Could not update the cooked status. Please retry.'; }
    finally { setCookedUpdatingKey(''); }
  }
  async function reconcileQueues(nextQueue) {
    const nextMeals = [...meals];
    for (let day = 1; day <= config.slotCount; day += 1) {
      const current = nextMeals[day - 1];
      if (current.is_override) continue;
      const front = queueForDay(nextQueue, day)[0];
      const empty = !current.title.trim() && !current.source_ref.trim();
      if (config.capsule && current.queue_item_id && !empty) continue;
      if (!current.queue_item_id && !empty) continue;
      if (current.queue_item_id && current.queue_item_id === front?.id) continue;
      if (front) {
        const { data: saved, error } = await from('weekly_meals').upsert(queueMealPayload(front, week, day), { onConflict: 'week_of,meal_number' }).select().single();
        if (error) throw error;
        nextMeals[day - 1] = { ...saved, tagsText: recipeTagsFor(front, recipeTags).join(', '), dirty: false };
      } else if (current.id && current.queue_item_id) {
        const { error } = await from('weekly_meals').delete().eq('id', current.id);
        if (error) throw error;
        nextMeals[day - 1] = { ...emptyMeal(day), week_of: week, tagsText: '', dirty: false };
      }
    }
    setQueueRows(nextQueue); setMeals(nextMeals); setGroceryGenerated(false);
  }
  async function importRecipe(url, destination = 'queue') {
    if (busy) return 'Please wait for the current save.';
    setBusy(true);
    try {
      const { data, error: importError } = await sb.functions.invoke('meal-recipe-intake', { body: { url, destination, weekOf: week, mealType } });
      if (importError) throw new Error(await extractionErrorMessage(importError));
      if (!data?.ok || !data?.recipe?.title) throw new Error(data?.error || 'The importer returned an incomplete response.');
      const title = data.recipe.title;
      setReload(value => value + 1);
      setGroceryGenerated(false);
      if (destination === 'library') {
        setToast(data.updatedExisting ? `${title} updated in your library` : `${title} saved to your library`);
        return '';
      }
      setToast(data.alreadyQueued ? `${title} is already in the ${dayName(data.dayNumber)} queue` : `${title} added to ${dayName(data.dayNumber)} queue`);
      return '';
    } catch (e) { return e.message || 'Could not import this recipe. Please retry.'; }
    finally { setBusy(false); }
  }
  async function saveManualRecipe(recipe, destination) {
    if (busy) return 'Please wait for the current save.';
    setBusy(true);
    try {
      const key = recipeKey(recipe);
      const sourceCollision = libraryRecords.find(row => !row.is_deleted && row.recipe_key !== key && String(row.source_ref || '').trim() === recipe.source_ref);
      if (sourceCollision) throw new Error(`That source is already used by ${sourceCollision.title}.`);
      const existing = libraryRecords.find(row => row.recipe_key === key);
      const now = new Date().toISOString();
      const payload = {
        recipe_key: key, title: recipe.title, source_ref: recipe.source_ref, ingredients: recipe.ingredients, method: recipe.method || '', servings: recipe.servings ?? null,
        extracted_at: existing?.extracted_at || null, rating: existing?.rating ?? null, notes: existing?.notes || '',
        cooked_at: existing?.cooked_at || now, has_been_cooked: !!existing?.has_been_cooked, is_deleted: false,
      };
      const { error: tagError } = await from('meal_recipe_tags').upsert({ recipe_key: key, tags: recipe.tags });
      if (tagError) throw tagError;
      const { data: saved, error: libraryError } = await from('meal_recipe_library').upsert(payload, { onConflict: 'recipe_key' }).select().single();
      if (libraryError) throw libraryError;
      setRecipeTags(prev => ({ ...prev, [key]: recipe.tags }));
      setLibraryRecords(prev => [saved, ...prev.filter(row => row.recipe_key !== key)]);
      if (destination === 'queue') {
        const alreadyQueued = queueRows.find(row => recipeKey(row) === key);
        if (!alreadyQueued) {
          const day = queueDayFor(recipe.tags);
          const queuePayload = {
            title: recipe.title, source_ref: recipe.source_ref,
            ingredients: recipe.ingredients, method: recipe.method || '', servings: recipe.servings ?? null, extracted_at: null, rating: null, notes: '',
          };
          const { queued, nextQueue } = await insertQueuedRecipe(queuePayload, day);
          const slot = meals[day - 1];
          if (!slot.title.trim() && !slot.source_ref.trim() && queueForDay(nextQueue, day)[0]?.id === queued.id) {
            const { data: scheduled, error: scheduleError } = await from('weekly_meals').upsert(queueMealPayload(queued, week, day), { onConflict: 'week_of,meal_number' }).select().single();
            if (scheduleError) throw scheduleError;
            setMeals(prev => prev.map((row, index) => index === day - 1 ? { ...scheduled, tagsText: recipe.tags.join(', '), dirty: false } : row));
          }
          setQueueRows(nextQueue);
          setToast(`${recipe.title} added to ${dayName(day)} queue`);
        } else setToast(`${recipe.title} is already queued`);
      } else setToast(existing ? `${recipe.title} updated in your library` : `${recipe.title} saved to your library`);
      setManualOpen(false); setGroceryGenerated(false);
      return '';
    } catch (e) { return e.message || 'Could not save that recipe. Please retry.'; }
    finally { setBusy(false); }
  }
  async function queueLibraryRecipe(recipe) {
    if (busy) return 'Please wait for the current save.';
    const key = recipeKey(recipe);
    if (queueRows.some(row => recipeKey(row) === key)) return 'This recipe is already queued.';
    setBusy(true);
    try {
      const tags = recipeTags[key] || [];
      const day = queueDayFor(tags);
      const payload = {
        title: recipe.title.trim(), source_ref: recipe.source_ref.trim(),
        ingredients: recipe.ingredients, method: recipe.method || '', servings: recipe.servings ?? null, extracted_at: recipe.extracted_at, rating: recipe.rating, notes: recipe.notes || '',
      };
      const { queued, nextQueue } = await insertQueuedRecipe(payload, day);
      const slot = meals[day - 1];
      if (!slot.title.trim() && !slot.source_ref.trim() && queueForDay(nextQueue, day)[0]?.id === queued.id) {
        const { data: saved, error } = await from('weekly_meals').upsert(queueMealPayload(queued, week, day), { onConflict: 'week_of,meal_number' }).select().single();
        if (error) throw error;
        setMeals(prev => prev.map((meal, index) => index === day - 1 ? { ...saved, tagsText: tags.join(', '), dirty: false } : meal));
      }
      setQueueRows(nextQueue); setGroceryGenerated(false); setToast(`${recipe.title} added to ${dayName(day)} queue`);
      return '';
    } catch (e) { return e.message || 'Could not queue this recipe. Please retry.'; }
    finally { setBusy(false); }
  }
  async function moveQueueItem(id, day) {
    if (busy) return;
    const item = queueRows.find(row => row.id === id);
    if (!item || item.day_number === day) return;
    setBusy(true);
    try {
      const moved = { ...item, day_number: day, position: nextQueuePosition(queueRows, day) };
      const { error } = await from('meal_recipe_queue').update({ day_number: day, position: moved.position }).eq('id', id);
      if (error) throw error;
      await reconcileQueues(queueRows.map(row => row.id === id ? moved : row));
      setToast(`${item.title} moved to Day ${day}`);
    } catch (e) { setToast(e.message || 'Could not move that recipe.'); }
    finally { setBusy(false); }
  }
  async function bumpQueueItem(id, delta) {
    if (busy) return;
    const item = queueRows.find(row => row.id === id);
    if (!item) return;
    const rows = queueForDay(queueRows, item.day_number);
    const index = rows.findIndex(row => row.id === id);
    const other = rows[index + delta];
    if (!other) return;
    setBusy(true);
    try {
      const { error: firstError } = await from('meal_recipe_queue').update({ position: other.position }).eq('id', item.id);
      if (firstError) throw firstError;
      const { error: secondError } = await from('meal_recipe_queue').update({ position: item.position }).eq('id', other.id);
      if (secondError) throw secondError;
      await reconcileQueues(queueRows.map(row => row.id === item.id ? { ...row, position: other.position } : row.id === other.id ? { ...row, position: item.position } : row));
    } catch (e) { setToast(e.message || 'Could not reorder that queue.'); }
    finally { setBusy(false); }
  }
  async function switchMeal(recipe, type, tags) {
    const day = switchDay;
    const current = meals[day - 1];
    if (!day || busy || current?.dirty || current?.is_override) return 'Save the current meal before switching.';
    setBusy(true);
    try {
      let nextQueue = queueRows;
      if (current.id && !current.queue_item_id) {
        const currentTags = parseTags(current.tagsText);
        const key = recipeKey(current);
        const { error: tagError } = await from('meal_recipe_tags').upsert({ recipe_key: key, tags: currentTags });
        if (tagError) throw tagError;
        const payload = {
          day_number: day, position: frontQueuePosition(queueRows, day), title: current.title.trim(), source_ref: current.source_ref.trim(),
          ingredients: current.ingredients, method: current.method || '', servings: current.servings ?? null, extracted_at: current.extracted_at, rating: current.rating, notes: current.notes || '',
        };
        const { data: preserved, error } = await from('meal_recipe_queue').insert(payload).select().single();
        if (error) throw error;
        nextQueue = [...queueRows, preserved];
      }
      const override = { ...recipe, meal_number: day, queue_item_id: null, is_override: true, override_type: type };
      await persistMeal(override, tags, true);
      setQueueRows(nextQueue); setGroceryGenerated(false); setToast(`Day ${day} switched temporarily`);
      return '';
    } catch (e) { return e.message || 'Could not switch this meal. Please retry.'; }
    finally { setBusy(false); }
  }
  async function duplicateMeal(pastMeal, day, allowCategoryOverride = false, localOnly = false) {
    if (busy) return 'Please wait for the current save.';
    const slot = meals[day - 1];
    if (!slot || slot.title.trim() || slot.source_ref.trim()) return 'Choose an empty day.';
    if (!localOnly) setBusy(true);
    try {
      await persistMeal({ ...pastMeal, meal_number: day, rating: null, is_override: allowCategoryOverride, override_type: allowCategoryOverride ? 'library' : null }, recipeTags[recipeKey(pastMeal)] || [], allowCategoryOverride);
      setToast(`Added ${pastMeal.title} to Day ${day}`); return '';
    } catch (e) { return e.message || 'Could not use this recipe. Please retry.'; }
    finally { if (!localOnly) setBusy(false); }
  }
  async function useLibraryRecipe(recipe) {
    if (useInFlight.current) return 'Please wait for the current recipe to be added.';
    const emptyCategories = categories.filter(category => {
      const slot = meals[category.day_number - 1];
      return slot && !slot.title.trim() && !slot.source_ref.trim();
    });
    if (!emptyCategories.length) {
      setToast('All days already have an assigned meal. Clear a day if you want to use this recipe.');
      return '';
    }
    const tags = recipeTags[recipeKey(recipe)] || [];
    const matchingRules = emptyCategories.filter(category => parseTags(category.accepted_tags).length > 0 && matchesCategory(tags, category));
    const noRuleDays = emptyCategories.filter(category => parseTags(category.accepted_tags).length === 0);
    if (config.capsule && !matchingRules.length && !noRuleDays.length) return 'No empty breakfast day matches this recipe’s tags. Edit the tags or clear a matching day.';
    const candidates = matchingRules.length ? matchingRules : noRuleDays.length ? noRuleDays : emptyCategories;
    const category = candidates[Math.floor(Math.random() * candidates.length)];
    useInFlight.current = true;
    try { return await duplicateMeal(recipe, category.day_number, !matchesCategory(tags, category), true); }
    finally { useInFlight.current = false; }
  }
  async function unscheduleMeal(index) {
    if (busy || loadingWeek || loadError) return;
    const meal = meals[index];
    if (!meal?.id || meal.dirty) return;
    setBusy(true); setMealErrors(prev => ({ ...prev, [index]: '' }));
    try {
      const key = recipeKey(meal);
      const existing = libraryRecords.find(row => row.recipe_key === key);
      const payload = {
        recipe_key: key, title: meal.title.trim(), source_ref: meal.source_ref.trim(), ingredients: meal.ingredients, method: meal.method || '', servings: meal.servings ?? null,
        extracted_at: meal.extracted_at, rating: meal.rating, notes: meal.notes || '', cooked_at: existing?.cooked_at || new Date().toISOString(),
        has_been_cooked: !!existing?.has_been_cooked, is_deleted: false,
      };
      const { data: savedToLibrary, error: libraryError } = await from('meal_recipe_library').upsert(payload, { onConflict: 'recipe_key' }).select().single();
      if (libraryError) throw libraryError;
      const { error: deleteError } = await from('weekly_meals').delete().eq('id', meal.id);
      if (deleteError) throw deleteError;
      let nextQueue = queueRows;
      if (meal.queue_item_id) {
        const { error: queueError } = await from('meal_recipe_queue').delete().eq('id', meal.queue_item_id);
        if (queueError) throw queueError;
        nextQueue = queueRows.filter(row => row.id !== meal.queue_item_id);
      }
      const front = queueForDay(nextQueue, meal.meal_number)[0];
      let nextMeal = { ...emptyMeal(meal.meal_number), week_of: week, tagsText: '', dirty: false };
      if (front) {
        const { data: saved, error } = await from('weekly_meals').upsert(queueMealPayload(front, week, meal.meal_number), { onConflict: 'week_of,meal_number' }).select().single();
        if (error) throw error;
        nextMeal = { ...saved, tagsText: recipeTagsFor(front, recipeTags).join(', '), dirty: false };
      }
      setLibraryRecords(prev => [savedToLibrary, ...prev.filter(row => row.recipe_key !== key)]);
      setQueueRows(nextQueue);
      setMeals(prev => prev.map((row, mealIndex) => mealIndex === index ? nextMeal : row));
      setGroceryGenerated(false); setToast(`${meal.title} unscheduled and kept in your library`);
    } catch (e) { setMealErrors(prev => ({ ...prev, [index]: e.message || 'Could not unschedule this recipe. Please retry.' })); }
    finally { setBusy(false); }
  }
  async function markCooked(index, markAsTried = true) {
    if (busy || loadingWeek || loadError) return;
    const meal = meals[index];
    if (!meal?.id || meal.dirty) return;
    setBusy(true); setMealErrors(prev => ({ ...prev, [index]: '' }));
    try {
      const key = recipeKey(meal);
      const existing = libraryRecords.find(row => row.recipe_key === key);
      const payload = {
        recipe_key: key, title: meal.title.trim(), source_ref: meal.source_ref.trim(), ingredients: meal.ingredients, method: meal.method || '', servings: meal.servings ?? null,
        extracted_at: meal.extracted_at, rating: meal.rating, notes: meal.notes || '',
        cooked_at: markAsTried ? new Date().toISOString() : existing?.cooked_at || meal.cooked_at || new Date().toISOString(),
        has_been_cooked: config.capsule ? !!existing?.has_been_cooked || markAsTried : true, is_deleted: false,
      };
      const { data: banked, error: bankError } = await from('meal_recipe_library').upsert(payload, { onConflict: 'recipe_key' }).select().single();
      if (bankError) throw bankError;
      const { error: deleteError } = await from('weekly_meals').delete().eq('id', meal.id);
      if (deleteError) throw deleteError;
      let nextQueue = queueRows;
      if (meal.queue_item_id) {
        if (config.capsule) {
          const rotatedPosition = nextQueuePosition(queueRows, meal.meal_number);
          const { error: queueError } = await from('meal_recipe_queue').update({ position: rotatedPosition }).eq('id', meal.queue_item_id);
          if (queueError) throw queueError;
          nextQueue = queueRows.map(row => row.id === meal.queue_item_id ? { ...row, position: rotatedPosition } : row);
        } else {
          const { error: queueError } = await from('meal_recipe_queue').delete().eq('id', meal.queue_item_id);
          if (queueError) throw queueError;
          nextQueue = queueRows.filter(row => row.id !== meal.queue_item_id);
        }
      }
      const front = queueForDay(nextQueue, meal.meal_number)[0];
      let nextMeal = { ...emptyMeal(meal.meal_number), week_of: week, tagsText: '', dirty: false };
      if (front) {
        const { data: saved, error } = await from('weekly_meals').upsert(queueMealPayload(front, week, meal.meal_number), { onConflict: 'week_of,meal_number' }).select().single();
        if (error) throw error;
        nextMeal = { ...saved, tagsText: recipeTagsFor(front, recipeTags).join(', '), dirty: false };
      }
      setLibraryRecords(prev => [banked, ...prev.filter(r => r.recipe_key !== key)]);
      setQueueRows(nextQueue);
      setMeals(prev => prev.map((m, i) => i === index ? nextMeal : m));
      setGroceryGenerated(false); setToast(config.capsule ? markAsTried ? `${meal.title} made · next breakfast scheduled` : `${meal.title} skipped · next breakfast scheduled` : `${meal.title} marked as cooked`);
    } catch (e) { setMealErrors(prev => ({ ...prev, [index]: e.message || 'Could not mark this recipe as cooked. Please retry.' })); }
    finally { setBusy(false); }
  }
  function startRecipeDrag(event, meal) {
    const key = recipeKey(meal);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-meal-recipe', key);
    event.dataTransfer.setData('text/plain', meal.title);
    setDraggedRecipeKey(key);
  }
  function startScheduledMealDrag(event, meal) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-scheduled-meal', String(meal.meal_number));
    setDraggedMealNumber(meal.meal_number);
  }
  async function dropScheduledMeal(event) {
    event.preventDefault();
    const day = Number(event.dataTransfer.getData('application/x-scheduled-meal') || draggedMealNumber);
    setDraggedMealNumber(null); setLibraryDropActive(false);
    if (day >= 1 && day <= config.slotCount) await unscheduleMeal(day - 1);
  }
  function canDropRecipe(meal, tags, category) {
    return !meal.title.trim() && !meal.source_ref.trim() && matchesCategory(tags, category);
  }
  async function dropRecipe(event, day) {
    event.preventDefault();
    const key = event.dataTransfer.getData('application/x-meal-recipe') || draggedRecipeKey;
    const recipe = libraryRecipes.find(row => recipeKey(row) === key);
    setDraggedRecipeKey(''); setDropTarget(null);
    if (!recipe) return;
    const message = await duplicateMeal(recipe, day);
    if (message) setMealErrors(prev => ({ ...prev, [day - 1]: message }));
  }
  async function deleteLibraryRecipe(recipe) {
    if (busy || !window.confirm(`Delete ${recipe.title} from the recipe library? Scheduled meals and queues will stay unchanged.`)) return;
    setBusy(true);
    try {
      const key = recipeKey(recipe);
      const payload = {
        recipe_key: key, title: recipe.title.trim(), source_ref: recipe.source_ref.trim(), ingredients: recipe.ingredients, method: recipe.method || '', servings: recipe.servings ?? null,
        extracted_at: recipe.extracted_at, rating: recipe.rating, notes: recipe.notes || '', cooked_at: recipe.cooked_at || new Date().toISOString(), has_been_cooked: !!recipe.has_been_cooked, is_deleted: true,
      };
      const { data: deleted, error } = await from('meal_recipe_library').upsert(payload, { onConflict: 'recipe_key' }).select().single();
      if (error) throw error;
      setLibraryRecords(prev => [deleted, ...prev.filter(row => row.recipe_key !== key)]);
      setToast(`${recipe.title} removed from your library`);
    } catch (e) { setToast(e.message || 'Could not delete that recipe.'); }
    finally { setBusy(false); }
  }

  const groceryMeals = useMemo(() => config.capsule
    ? meals.filter(meal => !meal.dirty && !mealValidation(meal, parseTags(meal.tagsText), categories.find(category => category.day_number === meal.meal_number)) && Array.isArray(meal.ingredients) && meal.ingredients.length > 0)
    : meals,
  [meals, categories, config.capsule]);
  const allIngredients = useMemo(() => groceryMeals.flatMap(m => Array.isArray(m.ingredients) ? m.ingredients : []), [groceryMeals]);
  const ready = !loadingWeek && !loadError && !busy && meals.length === config.slotCount && (config.capsule || meals.every(m => !m.dirty && !mealValidation(m, parseTags(m.tagsText), categoryFor(m.meal_number)) && Array.isArray(m.ingredients) && m.ingredients.length > 0));
  const groceryLines = useMemo(() => aggregateIngredients(allIngredients, mergeSuggestions), [allIngredients, mergeSuggestions]);
  const groceryText = groceryLines.join('\n');
  function generate() {
    if (!ready) return;
    setMergeSuggestions(buildMergeSuggestions(allIngredients)); setGroceryGenerated(true);
    setTimeout(() => document.getElementById('grocery')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
  async function copyList() {
    try { await navigator.clipboard.writeText(groceryText); setToast('Copied to clipboard'); }
    catch { setToast("Couldn't copy automatically"); }
  }
  function onIngredientSaved(row) {
    setMeals(prev => prev.map(m => m.meal_number === row.meal_number ? { ...row, tagsText: m.tagsText, dirty: false } : m));
    setGroceryGenerated(false);
  }
  const libraryRecipes = useMemo(() => {
    const recipes = new Map();
    const deletedKeys = new Set(libraryRecords.filter(recipe => recipe.is_deleted).map(recipe => recipe.recipe_key));
    const savedMeals = meals.filter(meal => meal.id && !meal.dirty);
    [...pastRows, ...queueRows, ...savedMeals, ...libraryRecords.filter(recipe => !recipe.is_deleted)].forEach(recipe => {
      if (!recipe?.title?.trim() || !recipe?.source_ref?.trim()) return;
      const key = recipeKey(recipe);
      if (deletedKeys.has(key)) return;
      const previous = recipes.get(key);
      recipes.set(key, previous ? {
        ...previous,
        ...recipe,
        ingredients: recipe.ingredients?.length ? recipe.ingredients : previous.ingredients,
        method: recipe.method || previous.method || '',
        servings: recipe.servings ?? previous.servings ?? null,
        extracted_at: recipe.extracted_at || previous.extracted_at,
        notes: recipe.notes || previous.notes,
        rating: recipe.rating ?? previous.rating,
        has_been_cooked: recipe.has_been_cooked ?? previous.has_been_cooked ?? false,
        recipe_key: recipe.recipe_key || previous.recipe_key || key,
      } : { ...recipe, method: recipe.method || '', servings: recipe.servings ?? null, recipe_key: recipe.recipe_key || key });
    });
    return [...recipes.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [pastRows, queueRows, meals, libraryRecords]);
  const filteredLibraryRecipes = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return libraryRecipes.filter(recipe => {
      const tags = recipeTags[recipeKey(recipe)] || [];
      return !q || `${recipe.title} ${recipe.source_ref} ${tags.join(' ')}`.toLowerCase().includes(q);
    });
  }, [libraryRecipes, librarySearch, recipeTags]);
  const currentDetailsRecipe = detailsRecipe && (libraryRecipes.find(row => recipeKey(row) === recipeKey(detailsRecipe)) || detailsRecipe);

  function renderMealCard(meal, index, heading, nested = false) {
    const category = categoryFor(meal.meal_number);
    const tags = parseTags(meal.tagsText);
    const match = meal.is_override || matchesCategory(tags, category);
    const draggedTags = recipeTags[draggedRecipeKey] || EMPTY_TAGS;
    const canDrop = !!draggedRecipeKey && canDropRecipe(meal, draggedTags, category);
    return <details key={meal.meal_number} className={`meal${nested ? ' breakfastAudienceMeal' : ''}${canDrop ? ' dropReady' : ''}${dropTarget === meal.meal_number ? ' dropActive' : ''}`}
      onDragOver={e => { if (canDrop) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropTarget(meal.meal_number); } }}
      onDragLeave={() => setDropTarget(target => target === meal.meal_number ? null : target)}
      onDrop={e => canDrop && dropRecipe(e, meal.meal_number)}>
      <summary className="mealSummary"><div><h3 className="dayHeading">{heading || config.dayNames?.[meal.meal_number - 1] || `Day ${meal.meal_number}`}</h3><div className="dayCategory">{meal.is_override ? `Temporary ${meal.override_type || 'manual'} switch` : category?.name || 'Any recipe'}</div></div><div className={`mealSummaryValue${meal.title.trim() ? '' : ' isEmpty'}`}>{meal.title.trim() || 'Empty'}<span className="mealChevron" aria-hidden="true">⌄</span></div></summary>
      <div className="mealBody">
      {!meal.is_override && category?.accepted_tags.length > 0 && <div className="dayRequirement">Requires {category.accepted_tags.join(' or ')}</div>}
      <div className="fields">
        <input className="input" aria-label={`Day ${meal.meal_number} meal title`} value={meal.title} disabled={busy} onChange={e => updateMealField(index, 'title', e.target.value)} placeholder="Meal title"/>
        <input className="input" aria-label={`Day ${meal.meal_number} source`} value={meal.source_ref} disabled={busy} onChange={e => updateMealField(index, 'source_ref', e.target.value)} placeholder="Source — e.g. Cookish p.47 or URL"/>
        <input className="input" type="number" min="1" step="1" aria-label={`Day ${meal.meal_number} servings`} value={meal.servings ?? ''} disabled={busy} onChange={e => updateMealField(index, 'servings', normalizeServings(e.target.value))} placeholder="Servings"/>
      </div>
      <label className="tagField">Recipe tags (comma-separated)<input className="input" aria-label={`Day ${meal.meal_number} recipe tags`} value={meal.tagsText} disabled={busy} onChange={e => updateMealField(index, 'tagsText', e.target.value)} placeholder="e.g. soup, instant pot, vegetarian"/></label>
      {tags.length > 0 && <div className="tagChips">{tags.map(tag => <span className="tagChip" key={tag}>{tag}</span>)}</div>}
      {!match && <div className="saveError">Add a recipe tagged {category.accepted_tags.join(' or ')} for this day.</div>}
      {mealErrors[index] && <div className="saveError" role="alert">{mealErrors[index]}</div>}
      <div className="dayActions"><span className="small">{meal.dirty ? 'Unsaved changes' : meal.id ? 'Saved' : 'Add a title, source and any required tags.'}{meal.ingredients?.length > 0 && ` · ✓ ${meal.ingredients.length} ingredients loaded`}</span>
        <button className="btn ghost" disabled={busy || !match || !meal.title.trim() || !meal.source_ref.trim() || (!meal.dirty && !!meal.id)} onClick={() => saveMeal(index)}>Save meal</button>
        <button className="btn secondary" disabled={busy || !match || !meal.title.trim() || !meal.source_ref.trim()} onClick={() => saveMeal(index, true)}>{meal.ingredients ? 'Review ingredients' : 'Extract ingredients'}</button>
        <button className="btn secondary" disabled={busy || meal.dirty || meal.is_override} onClick={() => setSwitchDay(meal.meal_number)}>Switch</button>
        <button className="btn secondary" disabled={busy || !meal.id || meal.dirty} onClick={() => unscheduleMeal(index)}>Unschedule</button>
        {config.capsule && <button className="btn secondary" disabled={busy || !meal.id || meal.dirty} onClick={() => markCooked(index, false)}>Skip · rotate</button>}
        <button className="btn cookedBtn" disabled={busy || !meal.id || meal.dirty} onClick={() => markCooked(index)}>{config.capsule ? 'Made · rotate' : 'Mark cooked'}</button>
        {meal.id && !meal.dirty && <span className="dragHint scheduledDragHint" draggable={!busy} onDragStart={e => startScheduledMealDrag(e, meal)} onDragEnd={() => { setDraggedMealNumber(null); setLibraryDropActive(false); }}>Drag to library</span>}
      </div>
      </div>
    </details>;
  }

  function renderBreakfastDays() {
    const weekdays = [
      { name: 'Monday', slots: [1, 2] },
      { name: 'Tuesday', slots: [3, 4] },
      { name: 'Wednesday', slots: [5, 6] },
      { name: 'Thursday', slots: [7, 8] },
    ];
    const grouped = weekdays.map(day => {
      const adult = meals[day.slots[0] - 1];
      const kids = meals[day.slots[1] - 1];
      return <details className="breakfastDayGroup" key={day.name}>
        <summary className="mealSummary"><h3 className="dayHeading">{day.name}</h3><div className="breakfastDayPreview"><span>Adults · {adult.title.trim() || 'Empty'}</span><span>Kids · {kids.title.trim() || 'Empty'}</span><span className="mealChevron" aria-hidden="true">⌄</span></div></summary>
        <div className="breakfastDayBody">{renderMealCard(adult, day.slots[0] - 1, 'Adults', true)}{renderMealCard(kids, day.slots[1] - 1, 'Kids', true)}</div>
      </details>;
    });
    return <>{grouped}<div className="cerealDay" aria-label="Friday cereal day"><div><h3 className="dayHeading">Friday</h3><div className="dayCategory">Cereal</div></div><div className="cerealMessage">Enjoy the day off.</div></div>{renderMealCard(meals[8], 8, 'Saturday')}{renderMealCard(meals[9], 9, 'Sunday')}</>;
  }

  return <div className="meal-planner"><div className="app"><div className="shell">
    <header className="plannerHeader">
      {onBack && <button type="button" className="plannerBack" onClick={onBack} aria-label="Back to Meal Planner">‹ Meal Planner</button>}
      <div className="plannerMonth">{config.capsule ? 'The breakfast rotation' : new Date().toLocaleDateString('en-GB', {month:'long', year:'numeric'})}</div>
      <div className="plannerTitleRow">
        <h1 className="brand">{config.title}<span className="brandDot">.</span></h1>
        <div className="plannerHeaderActions"><button className="categoryToggle" disabled={busy || loadingWeek || !!loadError} aria-expanded={queueOpen} onClick={() => setQueueOpen(true)}>Manage queues{queueRows.length ? ` · ${queueRows.length}` : ''}</button><button className="categoryToggle" disabled={busy || loadingWeek || !!loadError} aria-expanded={settingsOpen} aria-controls="category-editor" onClick={() => setSettingsOpen(true)}>Edit categories</button></div>
      </div>
      {!config.capsule && <div className="sub">Six dinners, your day categories, one grocery list.</div>}
    </header>
    {loadError && <div className="plannerNotice" role="alert">{loadError} <button className="btn secondary" onClick={() => setReload(n => n + 1)}>Retry</button></div>}
    <section className="card"><RecipeImporter categories={categories} onImport={importRecipe} onManual={() => setManualOpen(true)} busy={busy} dayNames={config.dayNames} autoQueue={config.autoQueue}/></section>
    <section className="card">
      <div className="sectionHead"><h2 className="sectionTitle">{config.capsule ? 'Your breakfast rotation' : "This week's meals"}</h2>{!config.capsule && <div className="weekNav"><button className="iconBtn" aria-label="Previous week" disabled={busy || loadingWeek} onClick={() => changeWeek(-1)}>‹</button><div className="weekLabel">{formatWeekLabel(week)}</div><button className="iconBtn" aria-label="Next week" disabled={busy || loadingWeek} onClick={() => changeWeek(1)}>›</button></div>}</div>
      {loadingWeek ? <div className="empty">{config.capsule ? 'Loading breakfasts…' : 'Loading week…'}</div> : !loadError && (config.capsule ? renderBreakfastDays() : meals.map((meal, index) => renderMealCard(meal, index)))}
      <button className="btn generate" onClick={generate} disabled={!ready}>Generate grocery list</button>
      {!ready && <div className="hint">Save at least one breakfast with ingredients to generate your list.</div>}
    </section>
    {groceryGenerated && ready && <section className="card" id="grocery">
      <div className="rowBetween"><div><h2 className="sectionTitle">Grocery list</h2><div className="small">Plain text, ready for iOS Reminders.</div></div><button className="btn copyBtn" onClick={copyList}>Copy</button></div>
      {mergeSuggestions.length > 0 && <div className="mergeBox"><div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Suggested merges — confirm these</div>{mergeSuggestions.map(s => <label className="mergeRow" key={s.id}><span><b>{s.variants.join(' + ')}</b> → {s.canonical}</span><input className="toggle" type="checkbox" checked={s.enabled} onChange={() => setMergeSuggestions(prev => prev.map(x => x.id === s.id ? { ...x, enabled: !x.enabled } : x))}/></label>)}</div>}
      <div className="groceryBox">{groceryText || (config.capsule ? 'No ingredients are loaded for the scheduled breakfasts yet.' : '')}</div>
    </section>}
    <section className={`card${draggedMealNumber ? ' libraryDropReady' : ''}${libraryDropActive ? ' libraryDropActive' : ''}`} id="recipe-library" onDragOver={event => { if (draggedMealNumber) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setLibraryDropActive(true); } }} onDragLeave={() => setLibraryDropActive(false)} onDrop={event => draggedMealNumber && dropScheduledMeal(event)}>
      <div className="rowBetween"><h2 className="sectionTitle">Recipe library</h2><button className="btn ghost" aria-expanded={libraryOpen} disabled={loadingWeek || !!loadError} onClick={() => setLibraryOpen(v => !v)}>{libraryOpen ? 'Hide library' : 'Browse library'}</button></div>
      {libraryOpen && !loadingWeek && !loadError && <div className="recipeLibrary"><input className="input search" aria-label="Search recipe library" value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} placeholder="Search by recipe, source or tag…"/>{filteredLibraryRecipes.length === 0 ? <div className="empty">{librarySearch ? 'No recipes match your search.' : 'Recipes you save or import will appear here.'}</div> : <div className="pastMeals">{filteredLibraryRecipes.map(recipe => <RecipeCard key={recipe.recipe_key} meal={recipe} tags={recipeTags[recipeKey(recipe)] || EMPTY_TAGS} scheduledDays={recipeDays(meals, recipe, 'meal_number')} queuedDays={recipeDays(queueRows, recipe, 'day_number')} onTagsSaved={savePastTags} onToggleCooked={toggleCookedStatus} cookedBusy={cookedUpdatingKey === recipeKey(recipe)} onOpenDetails={setDetailsRecipe} onUse={useLibraryRecipe} onQueue={queueLibraryRecipe} onDelete={deleteLibraryRecipe} busy={busy} draggable onDragStart={startRecipeDrag} onDragEnd={() => { setDraggedRecipeKey(''); setDropTarget(null); }} statusMode={config.capsule ? 'tried' : 'cooked'}/>)}</div>}</div>}
    </section>
  </div></div>{(modalMeal || toast || queueOpen || settingsOpen || switchDay !== null || detailsRecipe || manualOpen) && createPortal(<div className="meal-planner">
    {modalMeal && <ExtractionModal meal={modalMeal} tags={parseTags(modalMeal.tagsText)} category={categoryFor(modalMeal.meal_number)} weeklyMealsTable={config.tables.weekly_meals} onClose={() => setModalMeal(null)} onSaved={onIngredientSaved}/>}
    {queueOpen && <QueueManager queue={queueRows} categories={categories} tagMap={recipeTags} busy={busy} onClose={() => setQueueOpen(false)} onTagsSaved={savePastTags} onMove={moveQueueItem} onBump={bumpQueueItem} dayNames={config.dayNames} meals={meals} rotating={config.capsule}/>}
    {settingsOpen && <div className="modalBack" role="dialog" aria-modal="true" aria-label="Edit day categories"><div className="modal categoryModal" id="category-editor"><div className="modalHead"><h2 className="sectionTitle">Day categories</h2><button type="button" className="iconBtn" aria-label="Close categories" onClick={() => setSettingsOpen(false)}>×</button></div><CategoryEditor categories={categories} onSave={saveCategories} busy={busy} dayNames={config.dayNames}/></div></div>}
    {switchDay !== null && <SwitchMealModal day={switchDay} library={libraryRecipes} tagMap={recipeTags} busy={busy} onClose={() => setSwitchDay(null)} onSave={switchMeal} rotating={config.capsule}/>}
    {currentDetailsRecipe && <RecipeDetailsModal recipe={currentDetailsRecipe} tags={recipeTags[recipeKey(currentDetailsRecipe)] || EMPTY_TAGS} scheduledDays={recipeDays(meals, currentDetailsRecipe, 'meal_number')} queuedDays={recipeDays(queueRows, currentDetailsRecipe, 'day_number')} busy={busy} cookedBusy={cookedUpdatingKey === recipeKey(currentDetailsRecipe)} onTagsSaved={savePastTags} onToggleCooked={toggleCookedStatus} onClose={() => setDetailsRecipe(null)} onSave={saveRecipeDetails} statusMode={config.capsule ? 'tried' : 'cooked'}/>}
    {manualOpen && <ManualRecipeModal busy={busy} onClose={() => setManualOpen(false)} onSave={saveManualRecipe} autoQueue={config.autoQueue}/>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>, document.body)}</div>;
}
const EMPTY_TAGS = [];

function viewFromHash() {
  if (window.location.hash === '#meal-planner/breakfasts') return 'breakfast';
  if (window.location.hash === '#meal-planner/dinners') return 'dinner';
  return null;
}

export default function MealPlanner({ onDirtyChange, onPathChange } = {}) {
  const [view, setView] = useState(viewFromHash);
  const [dirty, setDirty] = useState(false);
  const reportDirty = useCallback(value => { setDirty(value); onDirtyChange?.(value); }, [onDirtyChange]);
  useEffect(() => {
    const syncView = () => {
      if (!window.location.hash.startsWith('#meal-planner')) return;
      const next = viewFromHash();
      if (next === view) return;
      if (view && dirty && !window.confirm('Leave this plan? Any unsaved changes will be lost.')) {
        const previousHash = `#meal-planner/${view === 'breakfast' ? 'breakfasts' : 'dinners'}`;
        window.history.replaceState(window.history.state, '', previousHash);
        onPathChange?.(previousHash);
        return;
      }
      reportDirty(false); setView(next);
    };
    window.addEventListener('hashchange', syncView);
    window.addEventListener('popstate', syncView);
    return () => { window.removeEventListener('hashchange', syncView); window.removeEventListener('popstate', syncView); };
  }, [view, dirty, onPathChange, reportDirty]);
  function navigate(next) {
    if (view && dirty && !window.confirm('Leave this plan? Any unsaved changes will be lost.')) return;
    const url = new URL(window.location.href);
    url.hash = next ? `meal-planner/${next === 'breakfast' ? 'breakfasts' : 'dinners'}` : 'meal-planner';
    window.history.pushState(window.history.state, '', url);
    onPathChange?.(url.hash);
    setDirty(false); reportDirty(false); setView(next);
    window.scrollTo(0, 0);
  }
  if (view) return <div className="plannerTransition" key={view}><MealPlannerWorkspace mealType={view} onDirtyChange={reportDirty} onBack={() => navigate(null)}/></div>;
  return <div className="meal-planner plannerTransition"><div className="app"><div className="shell">
    <header className="plannerHeader plannerHomeHeader"><div className="plannerMonth">Make space for what matters</div><h1 className="brand">Meal Planner<span className="brandDot">.</span></h1><p className="plannerHomeIntro">What would you like to plan?</p></header>
    <div className="plannerChoices">
      <button type="button" className="plannerChoice" onClick={() => navigate('breakfast')} aria-label="Open Breakfasts planner"><span className="plannerChoiceNumber">01 / BREAKFASTS</span><span className="plannerChoiceTitle">Breakfasts <span aria-hidden="true">↗</span></span><span className="plannerChoiceDescription">Your ongoing breakfast rotation, recipes and queues.</span></button>
      <button type="button" className="plannerChoice" onClick={() => navigate('dinner')} aria-label="Open Dinners planner"><span className="plannerChoiceNumber">02 / DINNERS</span><span className="plannerChoiceTitle">Dinners <span aria-hidden="true">↗</span></span><span className="plannerChoiceDescription">Your current six-day plan, recipe library and queues.</span></button>
    </div>
  </div></div></div>;
}
