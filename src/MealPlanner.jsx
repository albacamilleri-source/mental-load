import { createPortal } from 'react-dom';
import './MealPlanner.css';
import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_CATEGORIES, parseTags, recipeKey, matchesCategory, mealValidation, matchingDays } from "./mealPlanning";
import { extractionErrorMessage } from "./extractionError";


const SUPABASE_URL = "https://qvibdnrfywisvfsqgqux.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2aWJkbnJmeXdpc3Zmc3FncXV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTE5MTcsImV4cCI6MjA5NDQ2NzkxN30.qPNjcpQpHPV5_SVz3U-JC18CcZ6vxio9vImA3CKg5jk";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

const emptyMeal = (meal_number) => ({
  id: null,
  meal_number,
  title: "",
  source_ref: "",
  ingredients: null,
  extracted_at: null,
  rating: null,
  notes: "",
});


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

function ExtractionModal({ meal, onClose, onSaved, category, tags }) {
  const [tab, setTab] = useState("photo");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState(meal.source_ref?.startsWith("http") ? meal.source_ref : "");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ingredients, setIngredients] = useState(Array.isArray(meal.ingredients) ? meal.ingredients : null);
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
      extracted_at: new Date().toISOString(),
    };
    const { data, error: dbError } = await sb.from("weekly_meals").upsert(payload, { onConflict:"week_of,meal_number" }).select().single();
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
function CategoryEditor({ categories, onSave, busy }) {
  const [draft, setDraft] = useState(() => categories.map(c => ({ ...c, tagsText: c.accepted_tags.join(', ') })));
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    const next = draft.map(({ tagsText, ...c }) => ({ ...c, name: c.name.trim(), accepted_tags: parseTags(tagsText) }));
    const message = await onSave(next);
    setError(message || '');
  }
  return <form onSubmit={submit}>
    <p className="categoryIntro">Name any day and add its required recipe tags, separated by commas. A recipe must match at least one accepted tag. Leave tags empty to allow any recipe. These categories repeat every week.</p>
    <div className="categoryGrid">{draft.map((c, i) => <div className="categoryCard" key={c.day_number}>
      <h3>Day {c.day_number}</h3>
      <label className="tagField">Category name<input className="input" aria-label={`Day ${c.day_number} category name`} value={c.name} disabled={busy} placeholder="e.g. Soup Sunday" onChange={e => setDraft(prev => prev.map((x, j) => i === j ? { ...x, name: e.target.value } : x))}/></label>
      <label className="tagField">Accepted tags (any one)<input className="input" aria-label={`Day ${c.day_number} accepted tags`} value={c.tagsText} disabled={busy} placeholder="e.g. instant pot, slow cooker" onChange={e => setDraft(prev => prev.map((x, j) => i === j ? { ...x, tagsText: e.target.value } : x))}/></label>
    </div>)}</div>
    {error && <div className="saveError" role="alert">{error}</div>}
    <div className="actions"><button className="btn" disabled={busy}>Save day categories</button></div>
  </form>;
}

function PastRecipe({ meal, tags, categories, meals, onTagsSaved, onUse, busy }) {
  const [draft, setDraft] = useState(tags.join(', '));
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setDraft(tags.join(', ')), [tags]);
  const available = matchingDays(tags, categories).filter(c => !meals[c.day_number - 1].title.trim() && !meals[c.day_number - 1].source_ref.trim());
  const selected = available.some(c => String(c.day_number) === target) ? target : String(available[0]?.day_number || '');
  const changed = JSON.stringify(parseTags(draft)) !== JSON.stringify(parseTags(tags));
  return <div className="recipeCard">
    <h4>{meal.title}</h4><div className="small">{meal.source_ref}</div>
    <label className="tagField">Recipe tags<input className="input" aria-label={`Tags for ${meal.title}`} value={draft} disabled={busy} onChange={e => setDraft(e.target.value)} placeholder="e.g. soup, vegetarian"/></label>
    <div className="dayActions">
      <button className="btn ghost" disabled={busy || !changed} onClick={async () => setError(await onTagsSaved(meal, parseTags(draft)) || '')}>Save tags</button>
      <select className="input" aria-label={`Destination for ${meal.title}`} value={selected} disabled={busy || !available.length || changed} onChange={e => setTarget(e.target.value)}>
        {!available.length && <option value="">No matching empty day</option>}
        {available.map(c => <option key={c.day_number} value={c.day_number}>Day {c.day_number}{c.name ? ` · ${c.name}` : ''}</option>)}
      </select>
      <button className="btn" disabled={busy || !selected || changed} onClick={async () => setError(await onUse(meal, Number(selected)) || '')}>Use recipe</button>
    </div>
    <div className="hint">{changed ? 'Save tags before choosing a day.' : 'Only empty days with a matching category are available.'}</div>
    {error && <div className="saveError" role="alert">{error}</div>}
  </div>;
}

export default function MealPlanner({ onDirtyChange } = {}) {
  const [week, setWeek] = useState(isoWeek(new Date()));
  const [meals, setMeals] = useState([]);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [reload, setReload] = useState(0);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [recipeTags, setRecipeTags] = useState({});
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mealErrors, setMealErrors] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modalMeal, setModalMeal] = useState(null);
  const [groceryGenerated, setGroceryGenerated] = useState(false);
  const [mergeSuggestions, setMergeSuggestions] = useState([]);
  const [pastOpen, setPastOpen] = useState(false);
  const [pastRows, setPastRows] = useState([]);
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const dirty = meals.some(m => m.dirty);
  useEffect(() => {
    onDirtyChange?.(dirty || busy || !!modalMeal || settingsOpen);
    return () => onDirtyChange?.(false);
  }, [dirty, busy, modalMeal, settingsOpen, onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    setLoadingWeek(true); setLoadError(''); setGroceryGenerated(false); setMealErrors({}); setSettingsOpen(false);
    async function load() {
      try {
        const responses = await Promise.all([
          sb.from('weekly_meals').select('*').eq('week_of', week).order('meal_number'),
          sb.from('weekly_meals').select('*').lt('week_of', week).order('week_of', { ascending: false }).order('meal_number'),
          sb.from('meal_recipe_tags').select('*'),
          sb.from('meal_day_categories').select('*').order('day_number'),
        ]);
        if (cancelled) return;
        const failed = responses.find(r => r.error);
        if (failed) throw failed.error;
        const [current, past, tagRows, dayRows] = responses.map(r => r.data || []);
        if (dayRows.length !== 6) throw new Error('Day categories could not be loaded. Please retry.');
        const tags = Object.fromEntries(tagRows.map(r => [r.recipe_key, parseTags(r.tags)]));
        const next = Array.from({ length: 6 }, (_, i) => ({ ...emptyMeal(i + 1), week_of: week, tagsText: '', dirty: false }));
        current.forEach(row => {
          if (row.meal_number >= 1 && row.meal_number <= 6) next[row.meal_number - 1] = { ...row, tagsText: (tags[recipeKey(row)] || []).join(', '), dirty: false };
        });
        setMeals(next); setPastRows(past); setRecipeTags(tags); setCategories(dayRows);
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
  async function persistMeal(meal, tags) {
    const validation = mealValidation(meal, tags, categoryFor(meal.meal_number));
    if (validation) throw new Error(validation);
    const key = recipeKey(meal);
    const { error: tagError } = await sb.from('meal_recipe_tags').upsert({ recipe_key: key, tags });
    if (tagError) throw tagError;
    applyTags(key, tags, meal.meal_number - 1);
    const payload = {
      week_of: week, meal_number: meal.meal_number, title: meal.title.trim(), source_ref: meal.source_ref.trim(),
      ingredients: meal.ingredients, extracted_at: meal.extracted_at, rating: meal.rating, notes: meal.notes || '',
    };
    const { data, error } = await sb.from('weekly_meals').upsert(payload, { onConflict: 'week_of,meal_number' }).select().single();
    if (error) throw error;
    const saved = { ...data, tagsText: tags.join(', '), dirty: false };
    setMeals(prev => prev.map(m => m.meal_number === saved.meal_number ? saved : m));
    return saved;
  }
  async function saveMeal(index, extractAfter = false) {
    if (busy || loadingWeek || loadError) return;
    setBusy(true); setMealErrors(prev => ({ ...prev, [index]: '' }));
    try {
      const saved = await persistMeal(meals[index], parseTags(meals[index].tagsText));
      if (extractAfter) setModalMeal(saved);
      else setToast(`Day ${saved.meal_number} saved`);
    } catch (e) { setMealErrors(prev => ({ ...prev, [index]: e.message || 'Could not save this meal. Please retry.' })); }
    finally { setBusy(false); }
  }
  async function saveCategories(next) {
    setBusy(true);
    try {
      const { error } = await sb.from('meal_day_categories').upsert(next);
      if (error) throw error;
      setCategories(next); setSettingsOpen(false); setGroceryGenerated(false); setToast('Day categories saved');
      return '';
    } catch (e) { return e.message || 'Could not save categories. Please retry.'; }
    finally { setBusy(false); }
  }
  async function savePastTags(meal, tags) {
    setBusy(true);
    try {
      const key = recipeKey(meal);
      const { error } = await sb.from('meal_recipe_tags').upsert({ recipe_key: key, tags });
      if (error) throw error;
      applyTags(key, tags); setToast('Recipe tags saved');
      return '';
    } catch (e) { return e.message || 'Could not save tags. Please retry.'; }
    finally { setBusy(false); }
  }
  async function duplicateMeal(pastMeal, day) {
    if (busy) return 'Please wait for the current save.';
    const slot = meals[day - 1];
    if (!slot || slot.title.trim() || slot.source_ref.trim()) return 'Choose an empty day.';
    setBusy(true);
    try {
      await persistMeal({ ...pastMeal, meal_number: day, rating: null }, recipeTags[recipeKey(pastMeal)] || []);
      setToast(`Added ${pastMeal.title} to Day ${day}`); return '';
    } catch (e) { return e.message || 'Could not use this recipe. Please retry.'; }
    finally { setBusy(false); }
  }

  const allIngredients = useMemo(() => meals.flatMap(m => Array.isArray(m.ingredients) ? m.ingredients : []), [meals]);
  const ready = !loadingWeek && !loadError && !busy && meals.length === 6 && meals.every(m => !m.dirty && !mealValidation(m, parseTags(m.tagsText), categoryFor(m.meal_number)) && Array.isArray(m.ingredients) && m.ingredients.length > 0);
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
  const pastByWeek = useMemo(() => {
    const map = {};
    const q = search.trim().toLowerCase();
    pastRows.forEach(r => {
      const tags = recipeTags[recipeKey(r)] || [];
      if (q && !`${r.title} ${tags.join(' ')}`.toLowerCase().includes(q)) return;
      (map[r.week_of] ||= []).push(r);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [pastRows, search, recipeTags]);

  return <div className="meal-planner"><div className="app"><div className="shell">
    <header className="plannerHeader">
      <div className="plannerMonth">{new Date().toLocaleDateString('en-GB', {month:'long', year:'numeric'})}</div>
      <div className="plannerTitleRow">
        <h1 className="brand">Meal Planner<span className="brandDot">.</span></h1>
        <button className="categoryToggle" disabled={busy || loadingWeek || !!loadError} aria-expanded={settingsOpen} aria-controls="day-categories" onClick={() => setSettingsOpen(v => !v)}>{settingsOpen ? 'Close categories' : 'Edit categories'}</button>
      </div>
      <div className="sub">Six meals, your day categories, one grocery list.</div>
    </header>
    {loadError && <div className="plannerNotice" role="alert">{loadError} <button className="btn secondary" onClick={() => setReload(n => n + 1)}>Retry</button></div>}
    <section className="card" id="day-categories">
      <h2 className="sectionTitle">Day categories</h2>
      {!settingsOpen && <div className="tagChips">{categories.map(c => <span className="tagChip" key={c.day_number}>Day {c.day_number} · {c.name || (c.accepted_tags.length ? c.accepted_tags.join(' or ') : 'Any recipe')}</span>)}</div>}
      {settingsOpen && <CategoryEditor categories={categories} onSave={saveCategories} busy={busy}/>}
    </section>
    <section className="card">
      <div className="sectionHead"><h2 className="sectionTitle">This week's meals</h2><div className="weekNav"><button className="iconBtn" aria-label="Previous week" disabled={busy || loadingWeek} onClick={() => changeWeek(-1)}>‹</button><div className="weekLabel">{formatWeekLabel(week)}</div><button className="iconBtn" aria-label="Next week" disabled={busy || loadingWeek} onClick={() => changeWeek(1)}>›</button></div></div>
      {loadingWeek ? <div className="empty">Loading week…</div> : !loadError && meals.map((meal, index) => {
        const category = categoryFor(meal.meal_number);
        const tags = parseTags(meal.tagsText);
        const match = matchesCategory(tags, category);
        return <div className="meal" key={meal.meal_number}>
          <h3 className="dayHeading">Day {meal.meal_number}</h3>
          <div className="dayCategory">{category?.name || 'Any recipe'}{category?.accepted_tags.length > 0 && <> · Requires {category.accepted_tags.join(' or ')}</>}</div>
          <div className="fields">
            <input className="input" aria-label={`Day ${meal.meal_number} meal title`} value={meal.title} disabled={busy} onChange={e => updateMealField(index, 'title', e.target.value)} placeholder="Meal title"/>
            <input className="input" aria-label={`Day ${meal.meal_number} source`} value={meal.source_ref} disabled={busy} onChange={e => updateMealField(index, 'source_ref', e.target.value)} placeholder="Source — e.g. Cookish p.47 or URL"/>
          </div>
          <label className="tagField">Recipe tags (comma-separated)<input className="input" aria-label={`Day ${meal.meal_number} recipe tags`} value={meal.tagsText} disabled={busy} onChange={e => updateMealField(index, 'tagsText', e.target.value)} placeholder="e.g. soup, instant pot, vegetarian"/></label>
          {tags.length > 0 && <div className="tagChips">{tags.map(tag => <span className="tagChip" key={tag}>{tag}</span>)}</div>}
          {!match && <div className="saveError">Add a recipe tagged {category.accepted_tags.join(' or ')} for this day.</div>}
          {mealErrors[index] && <div className="saveError" role="alert">{mealErrors[index]}</div>}
          <div className="dayActions"><span className="small">{meal.dirty ? 'Unsaved changes' : meal.id ? 'Saved' : 'Add a title, source and any required tags.'}{meal.ingredients?.length > 0 && ` · ✓ ${meal.ingredients.length} ingredients loaded`}</span>
            <button className="btn ghost" disabled={busy || !match || !meal.title.trim() || !meal.source_ref.trim() || (!meal.dirty && !!meal.id)} onClick={() => saveMeal(index)}>Save meal</button>
            <button className="btn secondary" disabled={busy || !match || !meal.title.trim() || !meal.source_ref.trim()} onClick={() => saveMeal(index, true)}>{meal.ingredients ? 'Review ingredients' : 'Extract ingredients'}</button>
          </div>
        </div>;
      })}
      <button className="btn generate" onClick={generate} disabled={!ready}>Generate grocery list</button>
      {!ready && <div className="hint">Save all six meals with ingredients and matching day tags to generate your list.</div>}
    </section>
    {groceryGenerated && ready && <section className="card" id="grocery">
      <div className="rowBetween"><div><h2 className="sectionTitle">Grocery list</h2><div className="small">Plain text, ready for iOS Reminders.</div></div><button className="btn copyBtn" onClick={copyList}>Copy</button></div>
      {mergeSuggestions.length > 0 && <div className="mergeBox"><div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Suggested merges — confirm these</div>{mergeSuggestions.map(s => <label className="mergeRow" key={s.id}><span><b>{s.variants.join(' + ')}</b> → {s.canonical}</span><input className="toggle" type="checkbox" checked={s.enabled} onChange={() => setMergeSuggestions(prev => prev.map(x => x.id === s.id ? { ...x, enabled: !x.enabled } : x))}/></label>)}</div>}
      <div className="groceryBox">{groceryText}</div>
    </section>}
    <section className="card">
      <div className="rowBetween"><div><h2 className="sectionTitle">Past weeks</h2><div className="small">Tag saved recipes and reuse them on a matching day.</div></div><button className="btn ghost" aria-expanded={pastOpen} disabled={loadingWeek || !!loadError} onClick={() => setPastOpen(v => !v)}>{pastOpen ? 'Hide recipes' : 'Browse recipes'}</button></div>
      {pastOpen && !loadingWeek && !loadError && <div style={{ marginTop: 14 }}><input className="input search" aria-label="Search past recipes" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by meal title or tag…"/>{pastByWeek.length === 0 ? <div className="empty">No matching past meals yet.</div> : pastByWeek.map(([wk, rows]) => <div className="pastWeek" key={wk}>
        <button className="btn secondary" aria-expanded={!!expandedWeeks[wk]} onClick={() => setExpandedWeeks(p => ({ ...p, [wk]: !p[wk] }))}>{formatWeekLabel(wk)} · {rows.length} meals {expandedWeeks[wk] ? '−' : '+'}</button>
        {expandedWeeks[wk] && <div className="pastMeals">{rows.map(r => <PastRecipe key={r.id} meal={r} tags={recipeTags[recipeKey(r)] || EMPTY_TAGS} categories={categories} meals={meals} onTagsSaved={savePastTags} onUse={duplicateMeal} busy={busy}/>)}</div>}
      </div>)}</div>}
    </section>
  </div></div>{(modalMeal || toast) && createPortal(<div className="meal-planner">{modalMeal && <ExtractionModal meal={modalMeal} tags={parseTags(modalMeal.tagsText)} category={categoryFor(modalMeal.meal_number)} onClose={() => setModalMeal(null)} onSaved={onIngredientSaved}/>} {toast && <div className="toast" role="status">{toast}</div>}</div>, document.body)}</div>;
}
const EMPTY_TAGS = [];
