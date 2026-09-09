import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

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

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=Outfit:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');
:root{
  --bg:#F7F4F0; --surface:#FFFFFF; --surface2:#EFEAE0; --border:#E4DED6;
  --text:#1C1A18; --muted:#7A706A; --muted2:#B8B0A6;
  --sage:#7C9E8A; --planning:#C4A882; --rose:#D4A8A0; --danger:#C44A4A;
  --paper:#FAF8F5; --planning-dark:#9B7E5A;
  --shadow:0 1px 4px rgba(28,26,24,.04); --shadow-elev:0 4px 20px rgba(28,26,24,.08);
  --radius:14px;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent} body{margin:0;background:var(--bg);color:var(--text);font-family:Outfit,system-ui,sans-serif}
button,input,textarea{font:inherit}.app{min-height:100vh;padding:28px 16px 64px}.shell{max-width:840px;margin:0 auto}
.brand{font-family:Lora,Georgia,serif;font-size:40px;font-weight:400;letter-spacing:-.02em;margin:4px 0 4px}.brandDot{color:var(--sage)}.sub{color:var(--muted);font:10px 'DM Mono',monospace;letter-spacing:.22em;text-transform:uppercase;margin-bottom:24px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:18px;margin-bottom:16px}
.sectionTitle{font-family:Lora,Georgia,serif;font-size:24px;font-weight:400;letter-spacing:-.015em;margin:0}.sectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
.weekNav{display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:5px}.weekLabel{min-width:190px;text-align:center;font:500 11px 'DM Mono',monospace;letter-spacing:.08em}.iconBtn{border:0;background:transparent;width:34px;height:34px;border-radius:50%;cursor:pointer;color:var(--text);font-size:20px}.iconBtn:hover{background:var(--surface)}
.meal{border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;background:var(--surface)}.mealTop{display:flex;gap:12px;align-items:flex-start}.num{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:rgba(196,168,130,.16);color:var(--planning-dark);font:500 11px 'DM Mono',monospace;flex:0 0 auto}.fields{display:grid;grid-template-columns:1.15fr 1fr auto;gap:10px;flex:1}.input{width:100%;border:1px solid var(--border);background:var(--paper);border-radius:10px;padding:11px 12px;color:var(--text);outline:none}.input:focus,.textarea:focus{border-color:var(--planning);box-shadow:0 0 0 3px rgba(196,168,130,.13)}
.btn{border:0;border-radius:10px;padding:11px 14px;font-weight:500;cursor:pointer;transition:.15s ease;background:var(--planning);color:#fff}.btn:hover{filter:brightness(.96)}.btn.secondary{background:var(--surface);color:var(--text);border:1px solid var(--border)}.btn.ghost{background:transparent;color:var(--planning-dark);border:1px solid rgba(196,168,130,.5)}.btn:disabled{opacity:.42;cursor:not-allowed;filter:none}
.status{font-size:12px;margin:9px 0 0 42px;color:var(--muted)}.status.loaded{color:var(--sage);font-weight:500}.status.error{color:var(--danger)}
.generate{width:100%;margin-top:6px;padding:14px}.hint{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5}
.groceryBox{white-space:pre-wrap;background:var(--paper);border:1px dashed var(--planning);border-radius:12px;padding:14px;line-height:1.8;font-size:14px}.rowBetween{display:flex;justify-content:space-between;align-items:center;gap:10px}.mergeBox{margin:14px 0;padding:12px;background:rgba(196,168,130,.10);border-radius:12px}.mergeRow{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:13px;padding:7px 0;border-bottom:1px solid rgba(196,168,130,.2)}.mergeRow:last-child{border-bottom:0}.toggle{accent-color:var(--planning)}
.collapsible{cursor:pointer;user-select:none}.pastWeek{border-top:1px solid var(--border);padding:12px 0}.pastWeek:first-child{border-top:0}.pastMeals{display:grid;gap:8px;margin-top:10px}.pastMeal{width:100%;text-align:left;border:1px solid var(--border);background:var(--paper);border-radius:10px;padding:10px 12px;cursor:pointer}.pastMeal:hover{border-color:var(--planning)}.small{font-size:12px;color:var(--muted)}
.modalBack{position:fixed;inset:0;background:rgba(28,26,24,.44);display:grid;place-items:center;padding:16px;z-index:20}.modal{width:min(760px,100%);max-height:92vh;overflow:auto;background:var(--bg);border-radius:20px;box-shadow:0 30px 70px rgba(0,0,0,.22);padding:18px}.modalHead{display:flex;justify-content:space-between;align-items:center;gap:12px}.tabs{display:flex;gap:6px;margin:14px 0;background:var(--surface2);padding:5px;border-radius:12px}.tab{flex:1;border:0;background:transparent;border-radius:9px;padding:9px;cursor:pointer;font-weight:500;color:var(--muted)}.tab.active{background:var(--surface);color:var(--text);box-shadow:var(--shadow)}.textarea{width:100%;min-height:160px;border:1px solid var(--border);border-radius:10px;background:var(--surface);padding:12px;resize:vertical;outline:none}.upload{display:block;border:1.5px dashed var(--planning);border-radius:12px;padding:22px;text-align:center;background:var(--surface);cursor:pointer}.upload input{display:none}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;vertical-align:-3px;margin-right:7px}@keyframes spin{to{transform:rotate(360deg)}}
.reviewTable{display:grid;gap:8px}.ingredientRow{display:grid;grid-template-columns:1.4fr .55fr .7fr 38px;gap:8px}.ingredientRow input{min-width:0}.dangerBtn{border:0;background:#fff1ef;color:var(--danger);border-radius:10px;cursor:pointer}.jsonBox{margin-top:12px}.jsonBox summary{cursor:pointer;color:var(--muted);font-size:12px}.jsonText{margin-top:8px;min-height:130px;font-family:'DM Mono',ui-monospace,monospace;font-size:12px}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--text);color:#fff;border-radius:999px;padding:10px 14px;font-size:12px;z-index:30}.search{margin:2px 0 14px}.empty{text-align:center;color:var(--muted);padding:22px 6px;font-size:13px}
@media(max-width:700px){.app{padding:16px 10px 48px}.brand{font-size:34px}.card{padding:14px;border-radius:14px}.sectionHead{align-items:flex-start;flex-direction:column}.weekNav{width:100%;justify-content:space-between}.weekLabel{min-width:0}.mealTop{gap:9px}.fields{grid-template-columns:1fr}.status{margin-left:39px}.btn.extract{width:100%}.ingredientRow{grid-template-columns:1fr .55fr .65fr 36px}.modal{padding:14px}.rowBetween{align-items:flex-start}.copyBtn{flex:0 0 auto}}
`;

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

function ExtractionModal({ meal, onClose, onSaved }) {
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
      if (fnError) throw new Error(fnError.message || "Ingredient extraction failed.");
      if (data?.error) throw new Error(data.error);
      if (!Array.isArray(data?.ingredients)) throw new Error("The AI returned an unexpected response.");
      setIngredients(data.ingredients);
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg.includes("fetch") && tab === "url" ? "That URL couldn't be read. Try the Text tab and paste the recipe instead." : msg);
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
      <div className="modalHead"><div><h3 className="sectionTitle" style={{fontSize:22}}>Load ingredients</h3><div className="small">Meal {meal.meal_number}: {meal.title || "Untitled"}</div></div><button className="iconBtn" onClick={onClose}>×</button></div>
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

export default function MealPlanner() {
  const [week, setWeek] = useState(isoWeek(new Date()));
  const [meals, setMeals] = useState(Array.from({length:6},(_,i)=>emptyMeal(i+1)));
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [modalMeal, setModalMeal] = useState(null);
  const [groceryGenerated, setGroceryGenerated] = useState(false);
  const [mergeSuggestions, setMergeSuggestions] = useState([]);
  const [pastOpen, setPastOpen] = useState(false);
  const [pastRows, setPastRows] = useState([]);
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  useEffect(()=>{ loadWeek(); },[week]);
  useEffect(()=>{ loadPast(); },[week]);

  async function loadWeek() {
    setLoadingWeek(true); setGroceryGenerated(false);
    const { data, error } = await sb.from("weekly_meals").select("*").eq("week_of",week).order("meal_number");
    if (error) { console.error(error); setLoadingWeek(false); return; }
    const next = Array.from({length:6},(_,i)=>emptyMeal(i+1));
    (data||[]).forEach(row=>{ next[row.meal_number-1] = row; });
    setMeals(next.map(m=>({...m,week_of:week}))); setLoadingWeek(false);
  }
  async function loadPast() {
    const { data, error } = await sb.from("weekly_meals").select("*").lt("week_of",week).order("week_of",{ascending:false}).order("meal_number");
    if (!error) setPastRows(data||[]);
  }

  function updateMealField(index, field, value) {
    setMeals(prev=>prev.map((m,i)=>i===index?{...m,[field]:value}:m));
  }
  async function saveBasics(index) {
    const meal = meals[index];
    if (!meal.title.trim() || !meal.source_ref.trim()) return;
    const payload = { week_of:week, meal_number:meal.meal_number, title:meal.title.trim(), source_ref:meal.source_ref.trim() };
    if (meal.ingredients) payload.ingredients = meal.ingredients;
    if (meal.extracted_at) payload.extracted_at = meal.extracted_at;
    const { data, error } = await sb.from("weekly_meals").upsert(payload,{onConflict:"week_of,meal_number"}).select().single();
    if (!error && data) setMeals(prev=>prev.map((m,i)=>i===index?{...m,...data}:m));
  }

  const allIngredients = useMemo(()=>meals.flatMap(m=>Array.isArray(m.ingredients)?m.ingredients:[]),[meals]);
  const ready = meals.every(m=>Array.isArray(m.ingredients) && m.ingredients.length>0);
  const groceryLines = useMemo(()=>aggregateIngredients(allIngredients,mergeSuggestions),[allIngredients,mergeSuggestions]);
  const groceryText = groceryLines.join("\n");

  function generate() {
    const suggestions = buildMergeSuggestions(allIngredients);
    setMergeSuggestions(suggestions); setGroceryGenerated(true);
    setTimeout(()=>document.getElementById("grocery")?.scrollIntoView({behavior:"smooth",block:"start"}),50);
  }
  function flash(msg){ setToast(msg); setTimeout(()=>setToast(""),1800); }
  async function copyList(){ try{ await navigator.clipboard.writeText(groceryText); flash("Copied to clipboard"); }catch{ flash("Couldn't copy automatically"); } }
  function onIngredientSaved(row){ setMeals(prev=>prev.map(m=>m.meal_number===row.meal_number?row:m)); loadPast(); }

  const pastByWeek = useMemo(()=>{
    const map={};
    const q=search.trim().toLowerCase();
    pastRows.forEach(r=>{ if(q && !r.title.toLowerCase().includes(q)) return; (map[r.week_of] ||= []).push(r); });
    return Object.entries(map).sort((a,b)=>b[0].localeCompare(a[0]));
  },[pastRows,search]);

  async function duplicateMeal(pastMeal){
    const idx = meals.findIndex(m=>!m.title.trim());
    if(idx<0){ flash("This week already has 6 meals"); return; }
    const target = { ...pastMeal, id:undefined, week_of:week, meal_number:idx+1, created_at:undefined };
    const payload = { week_of:week, meal_number:idx+1, title:target.title, source_ref:target.source_ref, ingredients:target.ingredients, extracted_at:target.ingredients?new Date().toISOString():null, rating:null, notes:target.notes||"" };
    const { data,error } = await sb.from("weekly_meals").upsert(payload,{onConflict:"week_of,meal_number"}).select().single();
    if(error){flash(error.message);return;}
    setMeals(prev=>prev.map((m,i)=>i===idx?data:m)); flash(`Added “${pastMeal.title}” to meal ${idx+1}`);
  }

  return <><style>{CSS}</style><div className="app"><div className="shell">
    <div className="brand">meal planner.</div><div className="sub">Six dinners, one grocery list, less weekly admin.</div>

    <section className="card">
      <div className="sectionHead"><h2 className="sectionTitle">This week's meals</h2><div className="weekNav"><button className="iconBtn" onClick={()=>setWeek(shiftWeek(week,-1))}>‹</button><div className="weekLabel">{formatWeekLabel(week)}</div><button className="iconBtn" onClick={()=>setWeek(shiftWeek(week,1))}>›</button></div></div>
      {loadingWeek ? <div className="empty">Loading week…</div> : meals.map((meal,index)=><div className="meal" key={meal.meal_number}>
        <div className="mealTop"><div className="num">{meal.meal_number}</div><div className="fields">
          <input className="input" value={meal.title} onChange={e=>updateMealField(index,"title",e.target.value)} onBlur={()=>saveBasics(index)} placeholder="Meal title"/>
          <input className="input" value={meal.source_ref} onChange={e=>updateMealField(index,"source_ref",e.target.value)} onBlur={()=>saveBasics(index)} placeholder="Source — e.g. Cookish p.47 or URL"/>
          <button className="btn secondary extract" onClick={()=>setModalMeal({...meal,week_of:week})}>{meal.ingredients?"Review":"Extract"}</button>
        </div></div>
        {meal.ingredients ? <div className="status loaded">✓ Ingredients loaded · {meal.ingredients.length} items</div> : (meal.title||meal.source_ref) ? <div className="status">Add ingredients when you're ready.</div> : null}
      </div>)}
      <button className="btn generate" onClick={generate} disabled={!ready}>Generate grocery list</button>
      {!ready && <div className="hint">Available once all 6 meals have saved ingredients.</div>}
    </section>

    {groceryGenerated && <section className="card" id="grocery">
      <div className="rowBetween"><div><h2 className="sectionTitle">Grocery list</h2><div className="small">Plain text, ready for iOS Reminders.</div></div><button className="btn copyBtn" onClick={copyList}>Copy</button></div>
      {mergeSuggestions.length>0 && <div className="mergeBox"><div style={{fontWeight:600,fontSize:13,marginBottom:4}}>Suggested merges — confirm these</div>{mergeSuggestions.map(s=><label className="mergeRow" key={s.id}><span><b>{s.variants.join(" + ")}</b> → {s.canonical}</span><input className="toggle" type="checkbox" checked={s.enabled} onChange={()=>setMergeSuggestions(prev=>prev.map(x=>x.id===s.id?{...x,enabled:!x.enabled}:x))}/></label>)}</div>}
      <div className="groceryBox">{groceryText}</div>
    </section>}

    <section className="card">
      <div className="rowBetween collapsible" onClick={()=>setPastOpen(v=>!v)}><div><h2 className="sectionTitle">Past weeks</h2><div className="small">Reuse meals you've already planned.</div></div><div style={{fontSize:22}}>{pastOpen?"⌃":"⌄"}</div></div>
      {pastOpen && <div style={{marginTop:14}}><input className="input search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search past meals by title…"/>{pastByWeek.length===0?<div className="empty">No matching past meals yet.</div>:pastByWeek.map(([wk,rows])=><div className="pastWeek" key={wk}>
        <div className="rowBetween collapsible" onClick={()=>setExpandedWeeks(p=>({...p,[wk]:!p[wk]}))}><div><b>{formatWeekLabel(wk)}</b><div className="small">{rows.length} meal{rows.length===1?"":"s"}</div></div><span>{expandedWeeks[wk]?"−":"+"}</span></div>
        {expandedWeeks[wk] && <div className="pastMeals">{rows.sort((a,b)=>a.meal_number-b.meal_number).map(r=><button className="pastMeal" key={r.id} onClick={()=>duplicateMeal(r)}><b>{r.title}</b><div className="small">{r.source_ref} · tap to add to current week</div></button>)}</div>}
      </div>)}</div>}
    </section>
  </div></div>{modalMeal&&<ExtractionModal meal={modalMeal} onClose={()=>setModalMeal(null)} onSaved={onIngredientSaved}/>} {toast&&<div className="toast">{toast}</div>}</>;
}
