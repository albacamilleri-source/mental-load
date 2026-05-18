import React, { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://qvibdnrfywisvfsqgqux.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2aWJkbnJmeXdpc3Zmc3FncXV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTE5MTcsImV4cCI6MjA5NDQ2NzkxN30.qPNjcpQpHPV5_SVz3U-JC18CcZ6vxio9vImA3CKg5jk";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── GOOGLE CALENDAR ──────────────────────────────────────────────────────────
const GCAL_CLIENT_ID = "283368801613-lku2v6o5uvaqh5ttkci8u2d47bu9etdm.apps.googleusercontent.com";
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

const loadGoogleScript = () => new Promise((resolve, reject) => {
  if (window.google?.accounts?.oauth2) return resolve();
  const existing = document.getElementById("google-gsi");
  if (!existing) {
    const s = document.createElement("script");
    s.id = "google-gsi";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }
  const started = Date.now();
  const check = setInterval(() => {
    if (window.google?.accounts?.oauth2) { clearInterval(check); resolve(); }
    else if (Date.now() - started > 10000) { clearInterval(check); reject(new Error("GSI timeout")); }
  }, 100);
});

let _gcalToken = null;
const getGCalToken = () => _gcalToken;
const setGCalToken = (t) => { _gcalToken = t; };

// ─── PERIOD KEYS (server-side reset logic via keys, not deletes) ──────────────
const dailyKey = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Malta" });
const weeklyKey = () => {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Malta" }));
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.setDate(diff)).toLocaleDateString("sv-SE");
};
const monthlyKey = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Malta" }).slice(0, 7);

// ─── STATIC DATA ─────────────────────────────────────────────────────────────
const ROOMS = [
  { id: "ensuite", label: "Ensuite" },
  { id: "main_bath", label: "Main Bathroom" },
  { id: "main_bed", label: "Main Bedroom" },
  { id: "girls_bed", label: "Girls' Bedroom" },
  { id: "finn", label: "Finn's Room" },
  { id: "open", label: "Open Plan Kitchen/Living/Dining" },
];

const PLANNING_EVENTS_INIT = [
  { id: "pl1", text: "Plan Father's Day", date: "31/05/2026", trigger_month: "05/2026", notes: "" , recurring: true },
  { id: "pl2", text: "Plan Josh's Birthday", date: "20/06/2026", trigger_month: "06/2026", notes: "" , recurring: true },
  { id: "pl3", text: "Summer Opening Ceremony", date: "28/06/2026", trigger_month: "06/2026", notes: "Pool set up, ice cream, pizza or hot dogs" , recurring: true },
  { id: "pl4", text: "Plan Finley's Birthday", date: "09/08/2026", trigger_month: "08/2026", notes: "" , recurring: true },
  { id: "pl5", text: "Plan Anniversary", date: "05/09/2026", trigger_month: "09/2026", notes: "" , recurring: true },
  { id: "pl6", text: "Summer Closing Down Ceremony", date: "20/09/2026", trigger_month: "09/2026", notes: "Last swim Saturday, drain + put away pool, pizza + ice cream on the turf" , recurring: true },
  { id: "pl7", text: "Plan Mum's Birthday", date: "04/10/2026", trigger_month: "10/2026", notes: "" , recurring: true },
  { id: "pl8", text: "Plan Halloween", date: "01/10/2026", trigger_month: "10/2026", notes: "" , recurring: true },
  { id: "pl9", text: "Plan Freya's Birthday", date: "07/11/2026", trigger_month: "11/2026", notes: "" , recurring: true },
  { id: "pl10", text: "Plan Christmas", date: "28/11/2026", trigger_month: "11/2026", notes: "" , recurring: true },
  { id: "pl11", text: "Plan Easter", date: "29/03/2027", trigger_month: "03/2027", notes: "Celebration and basket" , recurring: true },
  { id: "pl12", text: "Plan Valentine's Day", date: "31/01/2027", trigger_month: "01/2027", notes: "Valentine's basket, breakfast + dinner treats, date with Josh, decor" , recurring: true },
  { id: "pl13", text: "Plan Flossy's Birthday", date: "15/02/2027", trigger_month: "02/2027", notes: "" , recurring: true },
  { id: "pl14", text: "Plan Mother's Day", date: "01/05/2027", trigger_month: "04/2027", notes: "Check: 7 wine glasses, 7 plates main, 7 plates side. Buy: pink napkins, pink runner" , recurring: true },
];

// Helper: roll trigger month forward 1 year
const advanceTriggerMonth = (tm) => {
  if (!tm) return tm;
  const [m, y] = tm.split("/");
  return `${m}/${parseInt(y) + 1}`;
};

const JOSH_AGENDA = [
  "Review the week",
  "Next week — what needs doing",
  "Dates / social planning",
  "Anything on your mind",
];

const JOSH_ACTIONS = [
  "Christmas booking",
  "Reebok passport office",
  "Decide if we are camping",
  "Plan laundry room project",
  "Discuss going out more + spreadsheet",
];

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const GlobalStyles = () => {
  useEffect(() => {
    const id = "hb-styles";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Outfit:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
      html, body { background: #FAF8F5; color: #2C2825; font-family: 'Outfit', sans-serif; overscroll-behavior: none; height: 100%; }
      :root {
        --bg: #FAF8F5;
        --surface: #FFFFFF;
        --surface2: #F4F1EC;
        --border: #E8E2D9;
        --text: #2C2825;
        --muted: #9A9189;
        --muted2: #C4BBB0;
        --morning: #D4854A;
        --evening: #4A7D8A;
        --chores: #4A8C6A;
        --admin: #7A6AA8;
        --meals: #C4623A;
        --planning: #9A7A42;
        --josh: #3A8A72;
        --danger: #C44A4A;
      }
      input, textarea, select { font-family: 'Outfit', sans-serif; }
      button { cursor: pointer; font-family: 'Outfit', sans-serif; }
      ::-webkit-scrollbar { display: none; }
      .fade { animation: fade 0.3s ease forwards; }
      @keyframes fade { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      .pop { animation: pop 0.22s cubic-bezier(.34,1.56,.64,1) forwards; }
      @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }
      .app-sidebar { display: none; }
      .app-nav-mobile { display: block; }
      .app-settings-mobile { display: block; }
      @media (min-width: 768px) {
        .app-sidebar { display: flex !important; }
        .app-nav-mobile { display: none !important; }
        .app-settings-mobile { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }, []);
  return null;
};

// ─── WHO AM I ─────────────────────────────────────────────────────────────────
function useWho() {
  const [who, setWho] = useState(() => localStorage.getItem("hb_who") || null);
  const choose = (w) => { localStorage.setItem("hb_who", w); setWho(w); };
  return [who, choose];
}



// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function Checkbox({ checked, onChange, color = "var(--chores)", size = 22 }) {
  const [anim, setAnim] = useState(false);
  return (
    <button onClick={() => { setAnim(true); setTimeout(() => setAnim(false), 300); onChange(); }}
      className={anim ? "pop" : ""}
      style={{
        width: size, height: size, borderRadius: size * 0.3,
        border: `1.5px solid ${checked ? color : "var(--border)"}`,
        background: checked ? color : "transparent",
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.18s", outline: "none",
        boxShadow: checked ? `0 2px 8px ${color}44` : "none",
      }}>
      {checked && <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </button>
  );
}

function Bar({ done, total, color }) {
  const pct = total ? (done / total) * 100 : 0;
  return (
    <div style={{ height: 2, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.5s ease" }} />
    </div>
  );
}

function SectionLabel({ text, color, done, total }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color, textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 500 }}>{text}</span>
        {total !== undefined && <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted2)" }}>{done}/{total}</span>}
      </div>
      {total !== undefined && <Bar done={done} total={total} color={color} />}
    </div>
  );
}

function TaskRow({ text, done, onToggle, color, sub, overdue, dueDate, badge }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 3 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "11px 14px", borderRadius: 12,
        background: done ? "transparent" : "var(--surface)",
        border: `1px solid ${done ? "transparent" : overdue ? "#C44A4A22" : "var(--border)"}`,
        boxShadow: done ? "none" : "0 1px 4px #2C282508",
        transition: "all 0.18s"
      }}>
        <Checkbox checked={done} onChange={onToggle} color={color} />
        <div style={{ flex: 1 }} onClick={() => sub && setOpen(!open)}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 400, color: done ? "var(--muted2)" : "var(--text)", textDecoration: done ? "line-through" : "none", transition: "all 0.18s" }}>{text}</span>
            {overdue && !done && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: "#C44A4A15", color: "var(--danger)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.5px" }}>overdue {dueDate}</span>}
            {dueDate && !overdue && !done && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: "var(--surface2)", color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>{dueDate}</span>}
            {badge && <span style={{ fontSize: 11 }}>{badge}</span>}
          </div>
        </div>
        {sub && <span style={{ fontSize: 10, color: "var(--muted2)", transform: open ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>}
      </div>
      {sub && open && (
        <div style={{ marginLeft: 48, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          {sub.map((s, i) => <div key={i} style={{ fontSize: 12, color: "var(--muted)", padding: "5px 12px", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border)" }}>· {s}</div>)}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, color: "var(--muted2)", fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "1px" }}>loading…</div>;
}


// ─── WEATHER HOOK ─────────────────────────────────────────────────────────────
function useWeather() {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=35.9042&longitude=14.5189&current=temperature_2m,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe%2FMalta&forecast_days=4")
      .then(r => r.json())
      .then(setWeather)
      .catch(console.error);
  }, []);
  return weather;
}

const wmoLabel = (code) => {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 49) return "Fog";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 84) return "Showers";
  return "Thunderstorm";
};

const wmoEmoji = (code) => {
  if (code === 0) return "☀️";
  if (code <= 2) return "⛅";
  if (code === 3) return "☁️";
  if (code <= 49) return "🌫️";
  if (code <= 69) return "🌧️";
  if (code <= 79) return "❄️";
  if (code <= 84) return "🌦️";
  return "⛈️";
};

const WEEK_DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function WeatherStrip({ weather }) {
  if (!weather) return null;
  const cur = weather.current;
  const daily = weather.daily;
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <div style={{ borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", padding: "14px 16px", boxShadow: "0 1px 4px #2C282508" }}>
        {/* Current */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 32, lineHeight: 1 }}>{wmoEmoji(cur.weathercode)}</span>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 300, color: "var(--text)", lineHeight: 1, letterSpacing: "-1px" }}>{Math.round(cur.temperature_2m)}°</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{wmoLabel(cur.weathercode)}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>H: {Math.round(daily.temperature_2m_max[0])}°</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>L: {Math.round(daily.temperature_2m_min[0])}°</div>
          </div>
        </div>
        {/* 3-day strip */}
        <div style={{ display: "flex", gap: 6 }}>
          {[1,2,3].map(i => {
            const d = new Date();
            d.setDate(d.getDate() + i);
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 4px", borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{WEEK_DAYS[d.getDay()]}</div>
                <div style={{ fontSize: 18 }}>{wmoEmoji(daily.weathercode[i])}</div>
                <div style={{ fontSize: 11, color: "var(--text)", fontWeight: 500 }}>{Math.round(daily.temperature_2m_max[i])}°</div>
                <div style={{ fontSize: 10, color: "var(--muted2)", fontFamily: "'DM Mono', monospace" }}>{Math.round(daily.temperature_2m_min[i])}°</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── TODAY SCREEN ─────────────────────────────────────────────────────────────
function TodayScreen({ who }) {
  const [tasks, setTasks] = useState([]);
  const [completions, setCompletions] = useState(new Set());
  const [tab, setTab] = useState("morning");
  const [loading, setLoading] = useState(true);
  const [todayPlans, setTodayPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const weather = useWeather();

  const pKey = dailyKey();
  const color = tab === "morning" ? "var(--morning)" : "var(--evening)";

  // Today's date in DD/MM/YYYY for matching next actions
  const todayDate = (() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  })();

  // Meeting date from localStorage
  const meetingDate = localStorage.getItem("hb_meeting_date") || "";
  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Malta" });
  const meetingIsToday = meetingDate === todayISO;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: t }, { data: c }] = await Promise.all([
        sb.from("routine_tasks").select("*").in("type", ["morning", "evening"]).order("sort_order"),
        sb.from("routine_completions").select("task_id").eq("period_key", pKey),
      ]);
      setTasks(t || []);
      setCompletions(new Set((c || []).map(r => r.task_id)));
      setLoading(false);
    };
    load();

    const sub = sb.channel("today_completions")
      .on("postgres_changes", { event: "*", schema: "public", table: "routine_completions" }, () => {
        sb.from("routine_completions").select("task_id").eq("period_key", pKey).then(({ data }) => {
          setCompletions(new Set((data || []).map(r => r.task_id)));
        });
      }).subscribe();

    return () => sb.removeChannel(sub);
  }, [pKey]);

  // Load today's plans: next actions due today + dated monthly tasks due today
  useEffect(() => {
    const loadPlans = async () => {
      setPlansLoading(true);
      const { data: actions } = await sb.from("next_actions")
        .select("*").eq("done", false).eq("due_date", todayDate);
      const { data: monthly } = await sb.from("routine_tasks")
        .select("*").eq("type", "monthly").not("due_date", "is", null).eq("due_date", todayDate);
      setTodayPlans([...(actions || []), ...(monthly || [])]);
      setPlansLoading(false);
    };
    loadPlans();

    const sub = sb.channel("today_plans_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "next_actions" }, loadPlans)
      .subscribe();
    return () => sb.removeChannel(sub);
  }, [todayDate]);

  const toggle = async (taskId) => {
    const done = completions.has(taskId);
    if (done) {
      await sb.from("routine_completions").delete().eq("task_id", taskId).eq("period_key", pKey);
      setCompletions(s => { const n = new Set(s); n.delete(taskId); return n; });
    } else {
      await sb.from("routine_completions").upsert({ task_id: taskId, period_key: pKey, completed_by: who });
      setCompletions(s => new Set([...s, taskId]));
    }
  };

  const visible = tasks.filter(t => t.type === tab);
  const doneCount = visible.filter(t => completions.has(t.id)).length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  const TABS = [
    { key: "morning", label: "☀ Morning", color: "var(--morning)" },
    { key: "evening", label: "☾ Evening", color: "var(--evening)" },
    { key: "plans", label: "◈ Plans", color: "var(--admin)" },
  ];

  return (
    <div className="fade" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "32px 20px 16px" }}>
        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Malta" })}</div>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 36, fontWeight: 300, color: "var(--text)", letterSpacing: "-0.5px", lineHeight: 1.1 }}>{greeting}, {who === "alba" ? "Alba" : "Josh"}</div>
      </div>

      {/* 3 tab switcher */}
      <WeatherStrip weather={weather} />

      <div style={{ padding: "0 20px 20px", display: "flex", gap: 6 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: "10px 4px", borderRadius: 12,
            background: tab === t.key ? t.color : "var(--surface)",
            border: `1px solid ${tab === t.key ? "transparent" : "var(--border)"}`,
            color: tab === t.key ? "#fff" : "var(--muted)",
            fontSize: 12, fontWeight: tab === t.key ? 500 : 400,
            transition: "all 0.2s",
            boxShadow: tab === t.key ? `0 4px 16px ${t.color}44` : "0 1px 4px #2C282508",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Morning / Evening routine */}
      {(tab === "morning" || tab === "evening") && (<>
        <div style={{ padding: "0 20px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color, textTransform: "uppercase", letterSpacing: "1px" }}>{tab === "morning" ? "Morning Routine" : "Evening Shutdown"}</span>
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>{doneCount}/{visible.length}</span>
          </div>
          <Bar done={doneCount} total={visible.length} color={color} />
          {doneCount === visible.length && visible.length > 0 && (
            <div style={{ marginTop: 10, padding: "10px 16px", background: `${color}12`, borderRadius: 10, color, border: `1px solid ${color}22`, fontStyle: "italic", fontFamily: "'Cormorant Garamond', serif", fontSize: 16 }}>All done ✦</div>
          )}
        </div>
        {loading ? <Spinner /> : (
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 2 }}>
            {visible.map(t => (
              <TaskRow key={t.id} text={t.text} done={completions.has(t.id)} onToggle={() => toggle(t.id)} color={color} sub={t.sub_items} />
            ))}
          </div>
        )}
      </>)}

      {/* Today's Plans */}
      {tab === "plans" && (
        <div style={{ padding: "0 20px" }}>
          {plansLoading ? <Spinner /> : (<>
            {/* Meeting block if scheduled today */}
            {meetingIsToday && (
              <div style={{ marginBottom: 16, padding: "14px 16px", borderRadius: 12, background: "var(--surface)", border: `1px solid var(--josh)44`, boxShadow: "0 1px 6px #2C282508" }}>
                <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--josh)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>↔ Alba & Josh Weekly</div>
                <div style={{ fontSize: 13, color: "var(--text)" }}>Weekly meeting scheduled for today</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>Check Week tab for the agenda</div>
              </div>
            )}

            {/* Next actions due today */}
            {todayPlans.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--admin)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Due Today · {todayPlans.length}</div>
                {todayPlans.map(t => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 1px 4px #2C282508" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--admin)", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: "var(--text)" }}>{t.text}</div>
                      {t.notes && <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginTop: 3, whiteSpace: "pre-wrap" }}>{t.notes}</div>}
                      {t.context && <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{t.context === "phone" ? "📱" : t.context === "errand" ? "🚗" : "🏠"} {t.context}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !meetingIsToday && (
                <div style={{ padding: "14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
                  Nothing specific scheduled for today ✦
                </div>
              )
            )}
          {/* Today's calendar events */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--planning)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Calendar</div>
            <TodayCalendarTab />
          </div>
          </>)}
        </div>
      )}
    </div>
  );
}

// ─── JOSH MEETING BLOCK ───────────────────────────────────────────────────────
function JoshMeetingBlock({ isWed }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingDate, setEditingDate] = useState(false);
  const [meetingDate, setMeetingDate] = useState(() => localStorage.getItem("hb_meeting_date") || "");

  const load = useCallback(async () => {
    const { data, error } = await sb.from("josh_meeting_items")
      .select("*").eq("done", false).order("created_at");
    if (error) console.error("josh meeting load error:", error);
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const sub = sb.channel("josh_meeting_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "josh_meeting_items" }, load)
      .subscribe();
    return () => sb.removeChannel(sub);
  }, [load]);

  const saveDate = (d) => {
    localStorage.setItem("hb_meeting_date", d);
    setMeetingDate(d);
    setEditingDate(false);
  };

  const addItem = async () => {
    if (!newText.trim()) return;
    const newItem = { text: newText.trim(), notes: newNotes.trim() || "", done: false };
    const { data, error } = await sb.from("josh_meeting_items")
      .insert(newItem).select("id, text, notes, done").single();
    if (error) console.error("josh meeting add error:", error);
    setItems(is => [...is, data || { ...newItem, id: `jm_${Date.now()}` }]);
    setNewText(""); setNewNotes(""); setAdding(false);
  };

  const tickItem = async (item) => {
    await sb.from("josh_meeting_items").update({ done: true }).eq("id", item.id);
    await sb.from("history_items").insert({ text: item.text, notes: item.notes || "", source: "josh_meeting" });
    setItems(is => is.filter(i => i.id !== item.id));
  };

  const deleteItem = async (id) => {
    await sb.from("josh_meeting_items").delete().eq("id", id);
    setItems(is => is.filter(i => i.id !== id));
  };

  const dateLabel = meetingDate
    ? new Date(meetingDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : "Wednesday";

  return (
    <div style={{ padding: "0 20px 16px" }}>
      <SectionLabel text="Alba & Josh Weekly" color="var(--josh)" done={0} total={items.length} />
      <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 1px 4px #2C282506" }}>
        {/* Collapsible header — matches room card style */}
        <button onClick={() => setOpen(o => !o)} style={{ width: "100%", padding: "13px 15px", background: "none", border: "none", outline: "none", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--josh)", flexShrink: 0 }} />
            <span style={{ fontSize: 14, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
              {dateLabel}
              <span onClick={e => { e.stopPropagation(); setEditingDate(true); }}
                style={{ fontSize: 14, cursor: "pointer" }}>✏️</span>
              {isWed && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, background: "var(--josh)", color: "#fff", fontFamily: "'DM Mono', monospace" }}>Today</span>}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>0/{items.length}</span>
            <span style={{ fontSize: 10, color: "var(--muted)", transform: open ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>
          </div>
        </button>

        {open && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "8px 14px 12px" }}>
            {loading ? <Spinner /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {items.map(item => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                    <Checkbox checked={false} onChange={() => tickItem(item)} color="var(--josh)" size={18} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, color: "var(--text)" }}>{item.text}</span>
                      {item.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{item.notes}</div>}
                    </div>
                    <button onClick={() => deleteItem(item.id)} style={{ background: "none", border: "none", color: "var(--muted2)", fontSize: 14, padding: "0 2px" }}>×</button>
                  </div>
                ))}
                {items.length === 0 && !adding && (
                  <div style={{ fontSize: 12, color: "var(--muted2)", padding: "4px 0" }}>Nothing to discuss yet</div>
                )}
                {!adding ? (
                  <button onClick={() => setAdding(true)} style={{ marginTop: 4, padding: "7px 0", background: "none", border: `1.5px dashed var(--josh)44`, borderRadius: 8, color: "var(--josh)", fontSize: 12, width: "100%" }}>+ Add item</button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                    <input autoFocus value={newText} onChange={e => setNewText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAdding(false); }}
                      placeholder="What to discuss…"
                      style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", color: "var(--text)", fontSize: 13, outline: "none" }}
                    />
                    <input value={newNotes} onChange={e => setNewNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", color: "var(--text)", fontSize: 13, outline: "none" }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={addItem} style={{ flex: 1, padding: "8px", background: "var(--josh)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 500 }}>Add</button>
                      <button onClick={() => { setAdding(false); setNewText(""); setNewNotes(""); }} style={{ padding: "8px 12px", background: "var(--surface2)", border: "none", borderRadius: 8, color: "var(--muted)", fontSize: 12 }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Date picker modal */}
      {editingDate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(44,40,37,0.5)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}
          onClick={() => setEditingDate(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", maxWidth: 400,
            background: "var(--bg)", borderRadius: 20,
            padding: "24px 20px 24px", display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: "var(--text)" }}>Schedule meeting</div>
              <button onClick={() => setEditingDate(false)} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 20 }}>×</button>
            </div>
            <input
              type="date"
              value={meetingDate || ""}
              onChange={e => setMeetingDate(e.target.value)}
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 14px", color: "var(--text)", fontSize: 16, outline: "none", width: "100%" }}
            />
            <button onClick={() => saveDate(meetingDate)}
              style={{ padding: "13px", background: "var(--josh)", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 500, marginTop: 4 }}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WEEK SCREEN ──────────────────────────────────────────────────────────────
function WeekScreen({ who }) {
  const [roomTasks, setRoomTasks] = useState([]);
  const [otherTasks, setOtherTasks] = useState([]);
  const [completions, setCompletions] = useState(new Set());
  const [openRoom, setOpenRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const pKey = weeklyKey();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: rt }, { data: ot }, { data: c }] = await Promise.all([
        sb.from("routine_tasks").select("*").eq("type", "weekly_room").order("sort_order"),
        sb.from("routine_tasks").select("*").eq("type", "weekly_other").order("sort_order"),
        sb.from("routine_completions").select("task_id").eq("period_key", pKey),
      ]);
      setRoomTasks(rt || []);
      setOtherTasks(ot || []);
      setCompletions(new Set((c || []).map(r => r.task_id)));
      setLoading(false);
    };
    load();

    const sub = sb.channel("week_completions")
      .on("postgres_changes", { event: "*", schema: "public", table: "routine_completions" }, () => {
        sb.from("routine_completions").select("task_id").eq("period_key", pKey).then(({ data }) => {
          setCompletions(new Set((data || []).map(r => r.task_id)));
        });
      }).subscribe();

    return () => sb.removeChannel(sub);
  }, [pKey]);

  const toggle = async (taskId) => {
    const done = completions.has(taskId);
    if (done) {
      await sb.from("routine_completions").delete().eq("task_id", taskId).eq("period_key", pKey);
      setCompletions(s => { const n = new Set(s); n.delete(taskId); return n; });
    } else {
      await sb.from("routine_completions").upsert({ task_id: taskId, period_key: pKey, completed_by: who });
      setCompletions(s => new Set([...s, taskId]));
    }
  };

  const isWed = new Date().getDay() === 3;
  const totalRoomDone = roomTasks.filter(t => completions.has(t.id)).length;
  const otherDone = otherTasks.filter(t => completions.has(t.id)).length;

  const roomTasksFor = (roomId) => roomTasks.filter(t => t.id.startsWith(`wr_${roomId}_`));

  return (
    <div className="fade" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "32px 20px 18px" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 34, fontWeight: 300, color: "var(--text)", marginBottom: 4, letterSpacing: "-0.3px" }}>This Week</div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase" }}>Resets every Monday</div>
      </div>

      {loading ? <Spinner /> : <>
        {/* Cleaning */}
        <div style={{ padding: "0 20px 16px" }}>
          <SectionLabel text="Cleaning" color="var(--chores)" done={totalRoomDone} total={roomTasks.length} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            {ROOMS.map(room => {
              const rts = roomTasksFor(room.id);
              const done = rts.filter(t => completions.has(t.id)).length;
              const allDone = rts.length > 0 && done === rts.length;
              const isOpen = openRoom === room.id;
              return (
                <div key={room.id} style={{ borderRadius: 12, overflow: "hidden", border: `1px solid var(--border)`, background: "var(--surface)", boxShadow: "0 1px 4px #2C282506" }}>
                  <button onClick={() => setOpenRoom(isOpen ? null : room.id)} style={{ width: "100%", padding: "13px 15px", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", color: allDone ? "var(--muted2)" : "var(--text)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: allDone ? "var(--muted)" : "var(--chores)", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, textAlign: "left", textDecoration: allDone ? "line-through" : "none" }}>{room.label}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>{done}/{rts.length}</span>
                      <span style={{ fontSize: 10, color: "var(--muted)", transform: isOpen ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{ borderTop: "1px solid var(--border)", padding: "8px 14px 12px" }}>
                      {rts.map(t => (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                          <Checkbox checked={completions.has(t.id)} onChange={() => toggle(t.id)} color="var(--chores)" size={18} />
                          <span style={{ fontSize: 13, color: completions.has(t.id) ? "var(--muted)" : "var(--text)", textDecoration: completions.has(t.id) ? "line-through" : "none" }}>{t.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Josh meeting */}
        <JoshMeetingBlock isWed={isWed} />

        {/* Weekly other */}
        <div style={{ padding: "0 20px" }}>
          <SectionLabel text="Weekly Admin" color="var(--admin)" done={otherDone} total={otherTasks.length} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>
            {otherTasks.map(t => (
              <TaskRow key={t.id} text={t.text} done={completions.has(t.id)} onToggle={() => toggle(t.id)} color="var(--admin)" />
            ))}
          </div>
        </div>
      </>}
    </div>
  );
}

// ─── EDITABLE TASK ROW ────────────────────────────────────────────────────────
function EditableTaskRow({ task, onToggle, onSave, onDelete, color, badge }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [editNotes, setEditNotes] = useState(task.notes || "");
  const [editContext, setEditContext] = useState(task.context || "phone");
  const [editDate, setEditDate] = useState(task.due_date || "");

  const save = () => {
    if (editText.trim()) onSave(task, editText.trim(), editContext, editDate, editNotes.trim());
    setEditing(false);
  };

  if (editing) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: "var(--surface)", borderRadius: 12, border: `1px solid ${color}44`, marginBottom: 3, boxShadow: "0 2px 8px #2C282510" }}>
      <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", color: "var(--text)", fontSize: 13, outline: "none" }}
      />
      <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
        placeholder="Notes — optional"
        rows={3}
        style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", color: "var(--text)", fontSize: 12, outline: "none", resize: "vertical", lineHeight: 1.45 }}
      />
      <div style={{ display: "flex", gap: 5 }}>
        {[["phone","📱"],["errand","🚗"],["home","🏠"]].map(([k,l]) => (
          <button key={k} onClick={() => setEditContext(k)} style={{
            flex: 1, padding: "6px", borderRadius: 8, border: "none", fontSize: 13,
            background: editContext === k ? color : "var(--surface2)",
            color: editContext === k ? "#fff" : "var(--muted)",
          }}>{l}</button>
        ))}
      </div>
      <input value={editDate} onChange={e => setEditDate(e.target.value)}
        placeholder="Due date (DD/MM/YYYY) — optional"
        style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 11px", color: "var(--text)", fontSize: 12, outline: "none" }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={save} style={{ flex: 1, padding: "7px", background: color, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 500 }}>Save</button>
        <button onClick={() => setEditing(false)} style={{ padding: "7px 12px", background: "var(--surface2)", border: "none", borderRadius: 8, color: "var(--muted)", fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: 3, display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderRadius: 12, background: "var(--surface)", border: `1px solid ${task.overdue ? "#C44A4A22" : "var(--border)"}`, boxShadow: "0 1px 4px #2C282508" }}>
      <Checkbox checked={false} onChange={onToggle} color={color} />
      <div style={{ flex: 1 }} onClick={() => setEditing(true)}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, color: "var(--text)" }}>{task.text}</span>
          {task.overdue && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: "#C44A4A15", color: "var(--danger)", fontFamily: "'DM Mono', monospace" }}>overdue {task.due_date}</span>}
          {task.due_date && !task.overdue && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: "var(--surface2)", color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>{task.due_date}</span>}
          {badge && <span style={{ fontSize: 11 }}>{badge}</span>}
        </div>
        {task.notes && <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginTop: 4, whiteSpace: "pre-wrap" }}>{task.notes}</div>}
      </div>
      <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: "var(--muted2)", fontSize: 12, padding: "0 2px" }}>✎</button>
      <button onClick={() => onDelete(task.id)} style={{ background: "none", border: "none", color: "var(--muted2)", fontSize: 14, padding: "0 2px" }}>×</button>
    </div>
  );
}

// ─── TASKS SCREEN ─────────────────────────────────────────────────────────────
const CONTEXTS = [
  { key: "all", label: "All" },
  { key: "phone", label: "📱 Phone" },
  { key: "errand", label: "🚗 Errand" },
  { key: "home", label: "🏠 Home" },
];

function TasksScreen({ who }) {
  const [tasks, setTasks] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [context, setContext] = useState("all");
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newContext, setNewContext] = useState("phone");
  const [newDate, setNewDate] = useState("");
  const [addingWF, setAddingWF] = useState(false);
  const [newWF, setNewWF] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: t }, { data: w }] = await Promise.all([
      sb.from("next_actions").select("*").order("sort_order").order("created_at"),
      sb.from("waiting_for").select("*").order("created_at"),
    ]);
    setTasks(t || []);
    setWaiting(w || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const sub = sb.channel("tasks_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "next_actions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "waiting_for" }, load)
      .subscribe();
    return () => sb.removeChannel(sub);
  }, [load]);

  const toggle = async (task) => {
    const newDone = !task.done;
    await sb.from("next_actions").update({ done: newDone }).eq("id", task.id);
    if (newDone) {
      const historyNotes = [task.notes, task.due_date ? `Due: ${task.due_date}` : ""].filter(Boolean).join("\n\n");
      await sb.from("history_items").insert({ text: task.text, notes: historyNotes, source: "next_action" });
    }
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, done: newDone } : t));
  };

  const saveTask = async (task, newText, newContext, newDate, newNotes) => {
    await sb.from("next_actions").update({ text: newText, notes: newNotes || "", context: newContext, due_date: newDate || null }).eq("id", task.id);
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, text: newText, notes: newNotes || "", context: newContext, due_date: newDate || null } : t));
  };

  const deleteTask = async (id) => {
    await sb.from("next_actions").delete().eq("id", id);
    setTasks(ts => ts.filter(t => t.id !== id));
  };

  const addTask = async () => {
    if (!newText.trim()) return;
    const newItem = {
      id: `na_${Date.now()}`,
      text: newText.trim(),
      notes: newNotes.trim() || "",
      assigned: "alba",
      context: newContext,
      due_date: newDate.trim() || null,
      done: false,
    };
    const { data, error } = await sb.from("next_actions")
      .insert(newItem)
      .select("id, text, notes, assigned, context, due_date, done, overdue")
      .single();
    if (error) console.error("addTask error:", error);
    setTasks(ts => [...ts, data || newItem]);
    setNewText(""); setNewNotes(""); setNewDate(""); setAdding(false);
  };

  const addWF = async () => {
    if (!newWF.trim()) return;
    const { data, error } = await sb.from("waiting_for")
      .insert({ text: newWF.trim() })
      .select("id, text")
      .single();
    if (error) console.error("addWF error:", error);
    setWaiting(ws => [...ws, data || { id: `wf_${Date.now()}`, text: newWF.trim() }]);
    setNewWF(""); setAddingWF(false);
  };

  const removeWF = async (id) => {
    await sb.from("waiting_for").delete().eq("id", id);
    setWaiting(ws => ws.filter(w => w.id !== id));
  };

  const tickWF = async (item) => {
    await sb.from("waiting_for").delete().eq("id", item.id);
    await sb.from("history_items").insert({ text: item.text, notes: "", source: "waiting_for" });
    setWaiting(ws => ws.filter(w => w.id !== item.id));
  };

  const filtered = context === "all" ? tasks : tasks.filter(t => t.context === context);
  const active = filtered.filter(t => !t.done);
  const done = filtered.filter(t => t.done);

  const [viewMode, setViewMode] = useState("list"); // "list" | "schedule"
  const [draggedTask, setDraggedTask] = useState(null);
  const [dropDay, setDropDay] = useState(null);

  const scheduleTask = async (task, dateStr) => {
    // dateStr is DD/MM/YYYY
    await sb.from("next_actions").update({ due_date: dateStr }).eq("id", task.id);
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, due_date: dateStr } : t));
  };

  const unscheduleTask = async (task) => {
    await sb.from("next_actions").update({ due_date: null }).eq("id", task.id);
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, due_date: null } : t));
  };

  // Build week days starting from today
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  const formatDate = (d) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  const tasksForDay = (d) => tasks.filter(t => t.due_date === formatDate(d) && !t.done);
  const unscheduled = tasks.filter(t => !t.due_date && !t.done);

  return (
    <div className="fade" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "32px 20px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 34, fontWeight: 300, color: "var(--text)", marginBottom: 4, letterSpacing: "-0.3px" }}>Next Actions</div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase" }}>{active.length} to do</div>
        </div>
        <div style={{ display: "flex", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          {[["list","List"],["schedule","Scheduler"]].map(([mode, label]) => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              padding: "7px 14px", border: "none",
              background: viewMode === mode ? "var(--text)" : "transparent",
              color: viewMode === mode ? "var(--bg)" : "var(--muted)",
              fontSize: 12, cursor: "pointer", fontFamily: "'DM Mono', monospace",
              letterSpacing: "0.3px", transition: "all 0.18s",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Schedule view */}
      {viewMode === "schedule" && (
        <div style={{ padding: "0 20px" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {/* Unscheduled tasks */}
            <div style={{ width: 200, flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Unscheduled · {unscheduled.length}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {unscheduled.map(t => (
                  <div key={t.id}
                    draggable
                    onDragStart={() => setDraggedTask(t)}
                    onDragEnd={() => setDraggedTask(null)}
                    style={{
                      padding: "8px 10px", borderRadius: 10, background: "var(--surface)",
                      border: "1px solid var(--border)", fontSize: 12, color: "var(--text)",
                      cursor: "grab", userSelect: "none",
                      boxShadow: "0 1px 4px #2C282508",
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10 }}>{t.context === "phone" ? "📱" : t.context === "errand" ? "🚗" : "🏠"}</span>
                      <span style={{ lineHeight: 1.3 }}>{t.text}</span>
                    </div>
                    {t.notes && <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.4, marginTop: 4, whiteSpace: "pre-wrap" }}>{t.notes}</div>}
                  </div>
                ))}
                {unscheduled.length === 0 && <div style={{ fontSize: 12, color: "var(--muted2)", fontFamily: "'DM Mono', monospace" }}>All scheduled ✦</div>}
              </div>
            </div>

            {/* Week grid */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              {weekDays.map((d, di) => {
                const dayTasks = tasksForDay(d);
                const isToday = di === 0;
                const isDrop = dropDay === di;
                return (
                  <div key={di}
                    onDragOver={e => { e.preventDefault(); setDropDay(di); }}
                    onDragLeave={() => setDropDay(null)}
                    onDrop={async e => {
                      e.preventDefault();
                      setDropDay(null);
                      if (draggedTask) await scheduleTask(draggedTask, formatDate(d));
                    }}
                    style={{
                      borderRadius: 12, border: `1.5px solid ${isDrop ? "var(--admin)" : isToday ? "var(--morning)44" : "var(--border)"}`,
                      background: isDrop ? "var(--admin)08" : isToday ? "var(--morning)05" : "var(--surface)",
                      padding: "10px 12px", minHeight: 60, transition: "all 0.15s",
                    }}>
                    <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: isToday ? "var(--morning)" : "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: dayTasks.length ? 8 : 0 }}>
                      {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                      {isToday && <span style={{ marginLeft: 6, fontSize: 8, padding: "1px 5px", borderRadius: 10, background: "var(--morning)", color: "#fff" }}>today</span>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {dayTasks.map(t => (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 8, background: "var(--surface2)", fontSize: 11, color: "var(--text)" }}>
                          <span>{t.context === "phone" ? "📱" : t.context === "errand" ? "🚗" : "🏠"}</span>
                          <span style={{ flex: 1, lineHeight: 1.3 }}>{t.text}</span>
                          <button onClick={() => unscheduleTask(t)} style={{ background: "none", border: "none", color: "var(--muted2)", fontSize: 12, cursor: "pointer", padding: 0, flexShrink: 0 }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && <>
      <div style={{ padding: "0 20px 16px", display: "flex", gap: 6 }}>
        {CONTEXTS.map(c => (
          <button key={c.key} onClick={() => setContext(c.key)} style={{
            flex: 1, padding: "8px 4px", borderRadius: 20,
            background: context === c.key ? "var(--text)" : "var(--surface)",
            border: `1px solid ${context === c.key ? "transparent" : "var(--border)"}`,
            color: context === c.key ? "var(--bg)" : "var(--muted)",
            fontSize: 11, fontWeight: context === c.key ? 500 : 400,
            transition: "all 0.18s",
          }}>{c.label}</button>
        ))}
      </div>



      {loading ? <Spinner /> : (
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 2 }}>
          {active.map(t => (
            <EditableTaskRow key={t.id} task={t} onToggle={() => toggle(t)} onSave={saveTask} onDelete={deleteTask}
              color="var(--admin)"
              badge={context === "all" && t.context ? (t.context === "phone" ? "📱" : t.context === "errand" ? "🚗" : "🏠") : null}
            />
          ))}
        </div>
      )}

      <div style={{ padding: "12px 20px 0" }}>
        {!adding ? (
          <button onClick={() => setAdding(true)} style={{ width: "100%", padding: "10px", background: "none", border: "1.5px dashed var(--border)", borderRadius: 10, color: "var(--muted)", fontSize: 13 }}>+ Add action</button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--surface)", borderRadius: 14, padding: 16, border: "1px solid var(--border)", boxShadow: "0 2px 12px #2C282510" }}>
            <input autoFocus value={newText} onChange={e => setNewText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addTask(); if (e.key === "Escape") setAdding(false); }}
              placeholder="What needs doing?"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", color: "var(--text)", fontSize: 14, outline: "none" }}
            />
            <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)}
              placeholder="Notes — optional"
              rows={3}
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 13, outline: "none", resize: "vertical", lineHeight: 1.45 }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              {[["phone","📱 Phone"],["errand","🚗 Errand"],["home","🏠 Home"]].map(([k,l]) => (
                <button key={k} onClick={() => setNewContext(k)} style={{
                  flex: 1, padding: "7px 4px", borderRadius: 8, border: "none",
                  background: newContext === k ? "var(--admin)" : "var(--surface2)",
                  color: newContext === k ? "#0F0F0F" : "var(--muted)", fontSize: 12,
                }}>{l}</button>
              ))}
            </div>
            <input value={newDate} onChange={e => setNewDate(e.target.value)}
              placeholder="Due date (DD/MM/YYYY) — optional"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 13, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addTask} style={{ flex: 1, padding: "9px", background: "var(--admin)", border: "none", borderRadius: 8, color: "#0F0F0F", fontSize: 13, fontWeight: 500 }}>Add</button>
              <button onClick={() => setAdding(false)} style={{ padding: "9px 16px", background: "var(--surface2)", border: "none", borderRadius: 8, color: "var(--muted)", fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>



      <div style={{ padding: "24px 20px 0" }}>
        <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px" }}>Waiting For</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {waiting.map(w => (
            <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", boxShadow: "0 1px 4px #2C282506" }}>
              <Checkbox checked={false} onChange={() => tickWF(w)} color="var(--admin)" size={18} />
              <span style={{ flex: 1, fontSize: 14, color: "var(--text)" }}>{w.text}</span>
              <button onClick={() => removeWF(w.id)} style={{ background: "none", border: "none", color: "var(--muted2)", fontSize: 14 }} title="Delete permanently">×</button>
            </div>
          ))}
          {!addingWF ? (
            <button onClick={() => setAddingWF(true)} style={{ padding: "9px", background: "none", border: "1.5px dashed var(--border)", borderRadius: 10, color: "var(--muted)", fontSize: 13 }}>+ Add waiting for</button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input autoFocus value={newWF} onChange={e => setNewWF(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addWF(); if (e.key === "Escape") setAddingWF(false); }}
                placeholder="Waiting for…"
                style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", color: "var(--text)", fontSize: 14, outline: "none" }}
              />
              <button onClick={addWF} style={{ padding: "9px 14px", background: "var(--admin)", border: "none", borderRadius: 8, color: "#0F0F0F", fontSize: 13 }}>Add</button>
            </div>
          )}
        </div>
      </div>
      </>}
    </div>
  );
}

// ─── MONTH SCREEN ─────────────────────────────────────────────────────────────
function MonthScreen({ who }) {
  const [monthTasks, setMonthTasks] = useState([]);
  const [completions, setCompletions] = useState(new Set());
  const [planItems, setPlanItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const pKey = monthlyKey();

  const now = new Date();
  const currentMonthKey = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const monthName = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  useEffect(() => {
    const load = async () => {
      const [{ data: t }, { data: c }, { data: p }] = await Promise.all([
        sb.from("routine_tasks").select("*").eq("type", "monthly").order("sort_order"),
        sb.from("routine_completions").select("task_id").eq("period_key", pKey),
        sb.from("planning_events").select("*").eq("trigger_month", currentMonthKey).eq("done", false).eq("promoted", false),
      ]);
      setMonthTasks(t || []);
      setCompletions(new Set((c || []).map(r => r.task_id)));
      // Merge DB plan items with local init for any not yet in DB
      setPlanItems(p || []);
      setLoading(false);
    };
    load();
    const sub = sb.channel("month_completions")
      .on("postgres_changes", { event: "*", schema: "public", table: "routine_completions" }, () => {
        sb.from("routine_completions").select("task_id").eq("period_key", pKey).then(({ data }) => {
          setCompletions(new Set((data || []).map(r => r.task_id)));
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "planning_events" }, load)
      .subscribe();
    return () => sb.removeChannel(sub);
  }, [pKey, currentMonthKey]);

  const toggleRoutine = async (taskId) => {
    const done = completions.has(taskId);
    if (done) {
      await sb.from("routine_completions").delete().eq("task_id", taskId).eq("period_key", pKey);
      setCompletions(s => { const n = new Set(s); n.delete(taskId); return n; });
    } else {
      await sb.from("routine_completions").upsert({ task_id: taskId, period_key: pKey, completed_by: who });
      setCompletions(s => new Set([...s, taskId]));
    }
  };

  const tickPlanItem = async (item) => {
    await sb.from("planning_events").update({ done: true }).eq("id", item.id);
    setPlanItems(ps => ps.filter(p => p.id !== item.id));
  };

  const promotePlanItem = async (item) => {
    await sb.from("planning_events").update({ promoted: true }).eq("id", item.id);
    const promotedItem = {
      id: `na_plan_${Date.now()}`,
      text: item.text,
      assigned: "alba",
      context: "phone",
      done: false,
    };
    const { error: promoteError } = await sb.from("next_actions").insert(promotedItem);
    if (promoteError) console.error("promote error:", promoteError);
    setPlanItems(ps => ps.filter(p => p.id !== item.id));
  };

  const monthDone = monthTasks.filter(t => completions.has(t.id)).length;

  // localThisMonth comes from Supabase via planItems state

  return (
    <div className="fade" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "32px 20px 18px" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 34, fontWeight: 300, color: "var(--text)", marginBottom: 4, letterSpacing: "-0.3px" }}>This Month</div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase" }}>{monthName} · resets 1st</div>
      </div>

      {/* Monthly recurring tasks */}
      {loading ? <Spinner /> : (
        <div style={{ padding: "0 20px 24px" }}>
          <SectionLabel text="Monthly Tasks" color="var(--planning)" done={monthDone} total={monthTasks.length} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>
            {monthTasks.map(t => (
              <TaskRow key={t.id} text={t.text} done={completions.has(t.id)} onToggle={() => toggleRoutine(t.id)} color="var(--planning)" />
            ))}
          </div>
        </div>
      )}

      {/* Plan items surfaced this month */}
      {!loading && planItems.length > 0 && (
        <div style={{ padding: "0 20px" }}>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--planning)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>From Plan</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {planItems.map(e => (
              <div key={e.id} style={{ padding: "12px 14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--planning)44" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: "var(--text)", marginBottom: e.notes ? 4 : 0 }}>{e.text}</div>
                    {e.notes && <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>{e.notes}</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                    <button
                      onClick={() => tickPlanItem(e)}
                      style={{ padding: "5px 10px", borderRadius: 7, background: "var(--planning)22", border: `1px solid var(--planning)44`, color: "var(--planning)", fontSize: 11, fontFamily: "'DM Mono', monospace" }}
                    >✓ Done</button>
                    <button
                      onClick={() => promotePlanItem(e)}
                      style={{ padding: "5px 10px", borderRadius: 7, background: "var(--admin)22", border: `1px solid var(--admin)44`, color: "var(--admin)", fontSize: 11, fontFamily: "'DM Mono', monospace" }}
                    >→ Tasks</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && planItems.length === 0 && (
        <div style={{ padding: "0 20px" }}>
          <div style={{ padding: "14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            Nothing from Plan this month
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PLAN SCREEN ──────────────────────────────────────────────────────────────
function PlanScreen() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editEventNotes, setEditEventNotes] = useState("");
  const [editEventText, setEditEventText] = useState("");
  const [editEventTrigger, setEditEventTrigger] = useState("");
  const [editEventRecurring, setEditEventRecurring] = useState(false);
  const now = new Date();
  const currentMonthKey = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  useEffect(() => {
    if (editingEvent) {
      setEditEventNotes(editingEvent.notes || "");
      setEditEventText(editingEvent.text || "");
      setEditEventTrigger(editingEvent.trigger_month || "");
      setEditEventRecurring(editingEvent.recurring || false);
    }
  }, [editingEvent]);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await sb.from("planning_events").select("*").eq("done", false).order("trigger_month");
      if (error) console.error("PlanScreen load error:", error);
      setEvents(data || []);
      setLoading(false);
    };
    load();
    const sub = sb.channel("plan_screen_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "planning_events" }, load)
      .subscribe();
    return () => sb.removeChannel(sub);
  }, []);

  // Build a 2-year calendar grid (this year + next)
  const years = [now.getFullYear(), now.getFullYear() + 1];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const eventsForMonth = (m, y) => {
    const key = `${String(m + 1).padStart(2, "0")}/${y}`;
    return events.filter(e => e.trigger_month === key);
  };

  const monthKey = (m, y) => `${String(m + 1).padStart(2, "0")}/${y}`;
  const selectedEvents = selectedMonth ? events.filter(e => e.trigger_month === selectedMonth) : [];

  return (
    <div className="fade" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "32px 20px 18px" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 34, fontWeight: 300, color: "var(--text)", marginBottom: 4, letterSpacing: "-0.3px" }}>Plan</div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase" }}>Tap a month to see events</div>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ padding: "0 20px" }}>
          {years.map(year => (
            <div key={year} style={{ marginBottom: 36 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--planning)", textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 12 }}>{year}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, width: "100%" }}>
                {months.map((mon, mi) => {
                  const key = monthKey(mi, year);
                  const evts = eventsForMonth(mi, year);
                  const isCurrentMonth = key === currentMonthKey;
                  const isSelected = key === selectedMonth;
                  const isPast = new Date(year, mi) < new Date(now.getFullYear(), now.getMonth());
                  return (
                    <button key={mon} onClick={() => setSelectedMonth(isSelected ? null : key)} style={{
                      padding: "10px 8px", borderRadius: 12,
                      border: `1.5px solid ${isSelected ? "var(--planning)" : isCurrentMonth ? "var(--planning)55" : "var(--border)"}`,
                      background: isSelected ? "var(--planning)" : isCurrentMonth ? "var(--planning)0A" : "var(--surface)",
                      cursor: "pointer", textAlign: "left",
                      boxShadow: isSelected ? `0 6px 20px var(--planning)44` : "0 1px 6px #2C282508",
                      opacity: isPast ? 0.4 : 1,
                      transition: "all 0.2s",
                      width: "100%", aspectRatio: "1 / 1",
                      display: "flex", flexDirection: "column",
                      overflow: "hidden", boxSizing: "border-box",
                    }}>
                      <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: isSelected ? "#fff" : isCurrentMonth ? "var(--planning)" : "var(--text)", fontWeight: 500, letterSpacing: "0.3px" }}>{mon}</div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                        {evts.slice(0, 2).map((e, i) => (
                          <div key={i} style={{
                            fontSize: 9, color: isSelected ? "rgba(255,255,255,0.88)" : "var(--planning)",
                            lineHeight: 1.4,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            maxWidth: "100%",
                          }}>{e.text.replace("Plan ", "")}</div>
                        ))}
                        {evts.length > 2 && (
                          <div style={{ fontSize: 9, color: isSelected ? "rgba(255,255,255,0.55)" : "var(--muted2)", fontFamily: "'DM Mono', monospace" }}>
                            +{evts.length - 2}
                          </div>
                        )}
                      </div>
                      {evts.length > 0 && (
                        <div style={{ width: 20, height: 2, borderRadius: 1, background: isSelected ? "rgba(255,255,255,0.5)" : "var(--planning)44" }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Selected month detail */}
          {selectedMonth && selectedEvents.length > 0 && (
            <div style={{ marginTop: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--planning)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
                {new Date(parseInt(selectedMonth.split("/")[1]), parseInt(selectedMonth.split("/")[0]) - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {selectedEvents.map(e => (
                  <div key={e.id} onClick={() => setEditingEvent(e)}
                    style={{ padding: "14px 16px", borderRadius: 12, background: "var(--surface)", border: `1px solid var(--planning)44`, boxShadow: "0 2px 8px var(--planning)11", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: e.notes ? 5 : 0 }}>
                        <span style={{ fontSize: 14, color: "var(--text)" }}>{e.text}</span>
                        {e.recurring && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 20, background: "var(--surface2)", color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>↻ annual</span>}
                      </div>
                      {e.notes && <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>{e.notes}</div>}
                    </div>
                    <span style={{ fontSize: 12, color: "var(--muted2)", marginLeft: 8, flexShrink: 0 }}>✏️</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event edit modal */}
          {editingEvent && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(44,40,37,0.5)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}
              onClick={() => setEditingEvent(null)}>
              <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "var(--bg)", borderRadius: 20, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 10, maxHeight: "80vh", overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: "var(--text)" }}>Edit Event</div>
                  <button onClick={() => setEditingEvent(null)} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 20 }}>×</button>
                </div>

                {/* Title */}
                <input value={editEventText} onChange={e => setEditEventText(e.target.value)}
                  placeholder="Event name…"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 13px", color: "var(--text)", fontSize: 14, outline: "none", width: "100%" }}
                />

                {/* Trigger month */}
                <input value={editEventTrigger} onChange={e => setEditEventTrigger(e.target.value)}
                  placeholder="Trigger month (MM/YYYY)"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 13px", color: "var(--text)", fontSize: 14, outline: "none", width: "100%" }}
                />

                {/* Notes */}
                <textarea value={editEventNotes} onChange={e => setEditEventNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={4}
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 13px", color: "var(--text)", fontSize: 14, outline: "none", width: "100%", resize: "none", lineHeight: 1.6, fontFamily: "'Outfit', sans-serif" }}
                />

                {/* Recurring toggle */}
                <div onClick={() => setEditEventRecurring(r => !r)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer" }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${editEventRecurring ? "var(--planning)" : "var(--border)"}`, background: editEventRecurring ? "var(--planning)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.18s" }}>
                    {editEventRecurring && <svg width="11" height="11" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span style={{ fontSize: 14, color: "var(--text)" }}>Recurring annually</span>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button onClick={async () => {
                    if (editingEvent.id) {
                      await sb.from("planning_events").update({ text: editEventText, trigger_month: editEventTrigger, notes: editEventNotes, recurring: editEventRecurring }).eq("id", editingEvent.id);
                      setEvents(evts => evts.map(ev => ev.id === editingEvent.id ? { ...ev, text: editEventText, trigger_month: editEventTrigger, notes: editEventNotes, recurring: editEventRecurring } : ev));
                    } else {
                      const newEvt = { id: `custom_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, text: editEventText, trigger_month: editEventTrigger, notes: editEventNotes, recurring: editEventRecurring, done: false, promoted: false, date: "" };
                      const { data } = await sb.from("planning_events").insert(newEvt).select().single();
                      setEvents(evts => [...evts, data || newEvt]);
                    }
                    setEditingEvent(null);
                  }} style={{ flex: 1, padding: "13px", background: "var(--planning)", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 500 }}>
                    Save
                  </button>
                  <button onClick={async () => {
                    if (window.confirm("Delete this event?")) {
                      await sb.from("planning_events").delete().eq("id", editingEvent.id);
                      setEvents(evts => evts.filter(ev => ev.id !== editingEvent.id));
                      setEditingEvent(null);
                    }
                  }} style={{ padding: "13px 16px", background: "var(--danger)15", border: "1px solid var(--danger)44", borderRadius: 12, color: "var(--danger)", fontSize: 14 }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {events.length === 0 && (
            <div style={{ padding: "14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
              No plan events yet
            </div>
          )}
          <button onClick={() => setEditingEvent({ id: null, text: "", trigger_month: "", notes: "", recurring: false })}
            style={{ width: "100%", padding: "11px", background: "none", border: `1.5px dashed var(--planning)66`, borderRadius: 12, color: "var(--planning)", fontSize: 13, marginTop: 8 }}>
            + Add event
          </button>
        </div>
      )}
    </div>
  );
}



// ─── HISTORY SECTION (used inside EditScreen) ──────────────────────────────────
function HistorySection() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const load = async () => {
      const { data } = await sb.from("history_items").select("*").order("created_at", { ascending: false }).limit(100);
      setItems(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const sourceLabel = (s) => s === "next_action" ? "Task" : s === "waiting_for" ? "Waiting" : s === "josh_meeting" ? "Meeting" : s;
  const sourceColor = (s) => s === "next_action" ? "var(--admin)" : s === "waiting_for" ? "var(--planning)" : "var(--josh)";

  const filtered = filter === "all" ? items : items.filter(i => i.source === filter);

  return (
    <div style={{ padding: "0 20px 40px" }}>
      <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 26, fontWeight: 300, color: "var(--text)", marginBottom: 4 }}>History</div>
      <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 16 }}>Everything you've actioned</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["all","All"],["next_action","Tasks"],["waiting_for","Waiting"],["josh_meeting","Meeting"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            flex: 1, padding: "7px 2px", borderRadius: 20, border: `1px solid ${filter === k ? "transparent" : "var(--border)"}`,
            background: filter === k ? "var(--text)" : "var(--surface)",
            color: filter === k ? "var(--bg)" : "var(--muted)", fontSize: 10,
            fontFamily: "'DM Mono', monospace",
          }}>{l}</button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.length === 0 && <div style={{ fontSize: 13, color: "var(--muted2)", textAlign: "center", padding: "20px 0" }}>Nothing here yet</div>}
          {filtered.map(item => (
            <div key={item.id} style={{ padding: "10px 14px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: item.notes ? 3 : 0 }}>
                <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: `${sourceColor(item.source)}15`, color: sourceColor(item.source), fontFamily: "'DM Mono', monospace" }}>{sourceLabel(item.source)}</span>
                <span style={{ fontSize: 13, color: "var(--text)", textDecoration: "line-through", opacity: 0.6 }}>{item.text}</span>
              </div>
              {item.notes && <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 2 }}>{item.notes}</div>}
              <div style={{ fontSize: 9, color: "var(--muted2)", fontFamily: "'DM Mono', monospace", marginTop: 4 }}>
                {new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EDIT SCREEN ──────────────────────────────────────────────────────────────
function EditSection({ title, color, items, onAdd, onRemove, onEdit, placeholder, extraFields }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [extra, setExtra] = useState({});
  const [editingIdx, setEditingIdx] = useState(null);
  const [editText, setEditText] = useState("");
  const [editExtra, setEditExtra] = useState({});

  const submit = () => {
    if (!text.trim()) return;
    onAdd(text.trim(), extra);
    setText(""); setExtra({}); setAdding(false);
  };

  const startEdit = (i) => {
    const item = items[i];
    setEditingIdx(i);
    setEditText(typeof item === "string" ? item : item.text || "");
    setEditExtra(typeof item === "object" ? { notes: item.notes || "", trigger_month: item.trigger_month || "" } : {});
  };

  const submitEdit = () => {
    if (!editText.trim()) return;
    onEdit(editingIdx, editText.trim(), editExtra);
    setEditingIdx(null);
  };

  const getLabel = (item) => typeof item === "string" ? item : item.text || item.label || "";
  const getSub = (item) => {
    if (typeof item !== "object") return null;
    const parts = [];
    if (item.trigger_month) parts.push(item.trigger_month);
    if (item.notes) parts.push(item.notes);
    return parts.length ? parts.join(" · ") : null;
  };

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item, i) => (
          editingIdx === i ? (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--surface2)", borderRadius: 10, padding: 12, border: `1px solid ${color}44` }}>
              <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submitEdit(); if (e.key === "Escape") setEditingIdx(null); }}
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", color: "var(--text)", fontSize: 13, outline: "none" }}
              />
              {extraFields && extraFields.map(f => (
                f.type === "checkbox" ? (
                  <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <div onClick={() => setEditExtra(x => ({ ...x, [f.key]: !x[f.key] }))}
                      style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${editExtra[f.key] ? color : "#444"}`, background: editExtra[f.key] ? color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                      {editExtra[f.key] && <svg width="11" height="11" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#0F0F0F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span style={{ fontSize: 13, color: "var(--text)", cursor: "pointer" }} onClick={() => setEditExtra(x => ({ ...x, [f.key]: !x[f.key] }))}>{f.placeholder}</span>
                  </div>
                ) : (
                  <input key={f.key} value={editExtra[f.key] || ""} onChange={e => setEditExtra(x => ({ ...x, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", color: "var(--text)", fontSize: 13, outline: "none" }}
                  />
                )
              ))}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={submitEdit} style={{ flex: 1, padding: "7px", background: color, border: "none", borderRadius: 8, color: "#0F0F0F", fontSize: 12, fontWeight: 500 }}>Save</button>
                <button onClick={() => setEditingIdx(null)} style={{ padding: "7px 12px", background: "var(--surface)", border: "none", borderRadius: 8, color: "var(--muted)", fontSize: 12 }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)" }}>
              <div style={{ flex: 1 }} onClick={() => startEdit(i)}>
                <div style={{ fontSize: 13, color: "var(--text)" }}>{getLabel(item)}</div>
                {getSub(item) && <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{getSub(item)}</div>}
              </div>
              <button onClick={() => startEdit(i)} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 12, padding: "0 4px" }}>✎</button>
              <button onClick={() => onRemove(i)} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 16, padding: "0 2px", lineHeight: 1 }}>×</button>
            </div>
          )
        ))}
        {!adding ? (
          <button onClick={() => setAdding(true)} style={{ padding: "8px", background: "none", border: `1.5px dashed ${color}66`, borderRadius: 10, color, fontSize: 12 }}>+ Add</button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--surface)", borderRadius: 10, padding: 12, border: "1px solid var(--border)" }}>
            <input autoFocus value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAdding(false); }}
              placeholder={placeholder || "Add item…"}
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", color: "var(--text)", fontSize: 13, outline: "none" }}
            />
            {extraFields && extraFields.map(f => (
              f.type === "checkbox" ? (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <div onClick={() => setExtra(x => ({ ...x, [f.key]: !x[f.key] }))}
                    style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${extra[f.key] ? color : "#444"}`, background: extra[f.key] ? color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                    {extra[f.key] && <svg width="11" height="11" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#0F0F0F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span style={{ fontSize: 13, color: "var(--text)", cursor: "pointer" }} onClick={() => setExtra(x => ({ ...x, [f.key]: !x[f.key] }))}>{f.placeholder}</span>
                </div>
              ) : (
                <input key={f.key} value={extra[f.key] || ""} onChange={e => setExtra(x => ({ ...x, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", color: "var(--text)", fontSize: 13, outline: "none" }}
                />
              )
            ))}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={submit} style={{ flex: 1, padding: "8px", background: color, border: "none", borderRadius: 8, color: "#0F0F0F", fontSize: 12, fontWeight: 500 }}>Add</button>
              <button onClick={() => { setAdding(false); setText(""); setExtra({}); }} style={{ padding: "8px 12px", background: "var(--surface2)", border: "none", borderRadius: 8, color: "var(--muted)", fontSize: 12 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditScreen({ onBack }) {
  const [morningTasks, setMorningTasks] = useState([]);
  const [eveningTasks, setEveningTasks] = useState([]);
  const [weeklyOther, setWeeklyOther] = useState([]);
  const [monthlyTasks, setMonthlyTasks] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [planEvents, setPlanEvents] = useState([]);
  const [agenda, setAgenda] = useState([...JOSH_AGENDA]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [{ data }, { data: planData }, { data: agendaData }] = await Promise.all([
        sb.from("routine_tasks").select("*").order("sort_order"),
        sb.from("planning_events").select("*").order("trigger_month"),
        sb.from("josh_agenda").select("*").order("sort_order"),
      ]);
      if (planData) setPlanEvents(planData);
      if (agendaData) setAgenda(agendaData.map(a => a.text));
      if (data) {
        setMorningTasks(data.filter(t => t.type === "morning"));
        setEveningTasks(data.filter(t => t.type === "evening"));
        setWeeklyOther(data.filter(t => t.type === "weekly_other"));
        setMonthlyTasks(data.filter(t => t.type === "monthly"));
        // Group room tasks by room
        const roomTasks = data.filter(t => t.type === "weekly_room");
        const grouped = ROOMS.map(r => ({
          ...r,
          tasks: roomTasks.filter(t => t.id.startsWith(`wr_${r.id}_`)).map(t => t.text),
        }));
        setRooms(grouped);
      }
      setLoading(false);
    };
    load();
  }, []);

  const addRoutineTask = async (type, text, sortOrder) => {
    const id = `${type}_custom_${Date.now()}`;
    const newItem = { id, text, type, sort_order: sortOrder, sub_items: null };
    const { data, error } = await sb.from("routine_tasks")
      .insert(newItem)
      .select("id, text, type, sort_order, sub_items")
      .single();
    if (error) console.error("addRoutineTask error:", error);
    return data || newItem;
  };

  const removeRoutineTask = async (id) => {
    await sb.from("routine_tasks").delete().eq("id", id);
  };

  const sections = [
    { key: "morning", label: "Morning Routine", color: "var(--morning)" },
    { key: "evening", label: "After Dinner", color: "var(--evening)" },
    { key: "weekly_other", label: "Weekly Admin", color: "var(--admin)" },
    { key: "monthly", label: "Monthly Tasks", color: "var(--planning)" },
    { key: "rooms", label: "Weekly Rooms", color: "var(--chores)" },
    { key: "plan", label: "Plan Events", color: "var(--planning)" },
    { key: "agenda", label: "Josh Meeting Agenda", color: "var(--josh)" },
  ];

  const getItems = (key) => {
    if (key === "morning") return morningTasks;
    if (key === "evening") return eveningTasks;
    if (key === "weekly_other") return weeklyOther;
    if (key === "monthly") return monthlyTasks;
    if (key === "rooms") return rooms;
    if (key === "plan") return planEvents;
    if (key === "agenda") return agenda.map(a => ({ text: a }));
    return [];
  };

  const handleAdd = async (key, text, extra) => {
    if (key === "morning") {
      const data = await addRoutineTask("morning", text, morningTasks.length + 1);
      if (data) setMorningTasks(ts => [...ts, data]);
    } else if (key === "evening") {
      const data = await addRoutineTask("evening", text, eveningTasks.length + 1);
      if (data) setEveningTasks(ts => [...ts, data]);
    } else if (key === "weekly_other") {
      const data = await addRoutineTask("weekly_other", text, weeklyOther.length + 1);
      if (data) setWeeklyOther(ts => [...ts, data]);
    } else if (key === "monthly") {
      const data = await addRoutineTask("monthly", text, monthlyTasks.length + 1);
      if (data) setMonthlyTasks(ts => [...ts, data]);
    } else if (key === "plan") {
      const newEvent = {
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        text,
        date: "",
        trigger_month: extra.trigger_month || "",
        notes: extra.notes || "",
        recurring: extra.recurring === true,
        done: false,
        promoted: false,
      };
      console.log("Inserting plan event:", newEvent);
      const { data: planData, error } = await sb.from("planning_events")
        .insert(newEvent)
        .select("id, text, trigger_month, notes, recurring, done, promoted")
        .single();
      console.log("Plan insert result - data:", planData, "error:", error);
      if (error) {
        alert("Save failed: " + error.message + "\nDetails: " + JSON.stringify(error.details));
      } else if (planData) {
        setPlanEvents(es => [...es, planData]);
      } else {
        alert("Insert returned no data - check Supabase logs");
      }
    } else if (key === "agenda") {
      const { data, error } = await sb.from("josh_agenda")
        .insert({ text, sort_order: agenda.length + 1 })
        .select("id, text, sort_order")
        .single();
      if (error) console.error("agenda add error:", error);
      setAgenda(ag => [...ag, (data || { text }).text]);
    }
  };

  const handleRemove = async (key, idx) => {
    if (key === "morning") {
      await removeRoutineTask(morningTasks[idx].id);
      setMorningTasks(ts => ts.filter((_, i) => i !== idx));
    } else if (key === "evening") {
      await removeRoutineTask(eveningTasks[idx].id);
      setEveningTasks(ts => ts.filter((_, i) => i !== idx));
    } else if (key === "weekly_other") {
      await removeRoutineTask(weeklyOther[idx].id);
      setWeeklyOther(ts => ts.filter((_, i) => i !== idx));
    } else if (key === "monthly") {
      await removeRoutineTask(monthlyTasks[idx].id);
      setMonthlyTasks(ts => ts.filter((_, i) => i !== idx));
    } else if (key === "plan") {
      const item = planEvents[idx];
      if (item?.id) await sb.from("planning_events").delete().eq("id", item.id);
      setPlanEvents(es => es.filter((_, i) => i !== idx));
    } else if (key === "agenda") {
      const text = agenda[idx];
      await sb.from("josh_agenda").delete().eq("text", text);
      setAgenda(ag => ag.filter((_, i) => i !== idx));
    }
  };

  const handleEdit = async (key, idx, text, extra) => {
    const update = (setter, arr) => setter(arr.map((item, i) => i === idx ? (typeof item === "string" ? text : { ...item, text, ...extra }) : item));
    if (key === "morning") {
      await sb.from("routine_tasks").update({ text }).eq("id", morningTasks[idx].id);
      update(setMorningTasks, morningTasks);
    } else if (key === "evening") {
      await sb.from("routine_tasks").update({ text }).eq("id", eveningTasks[idx].id);
      update(setEveningTasks, eveningTasks);
    } else if (key === "weekly_other") {
      await sb.from("routine_tasks").update({ text }).eq("id", weeklyOther[idx].id);
      update(setWeeklyOther, weeklyOther);
    } else if (key === "monthly") {
      await sb.from("routine_tasks").update({ text }).eq("id", monthlyTasks[idx].id);
      update(setMonthlyTasks, monthlyTasks);
    } else if (key === "plan") {
      const item = planEvents[idx];
      if (item?.id) {
        await sb.from("planning_events").update({
          text,
          trigger_month: extra.trigger_month || item.trigger_month,
          notes: extra.notes !== undefined ? extra.notes : item.notes,
          recurring: extra.recurring !== undefined ? extra.recurring : item.recurring,
        }).eq("id", item.id);
      }
      setPlanEvents(es => es.map((e, i) => i === idx ? { ...e, text, ...extra } : e));
    } else if (key === "agenda") {
      const oldText = agenda[idx];
      await sb.from("josh_agenda").update({ text }).eq("text", oldText);
      setAgenda(ag => ag.map((a, i) => i === idx ? text : a));
    }
  };

  return (
    <div className="fade" style={{ padding: "0 0 40px" }}>
      {/* Header */}
      <div style={{ padding: "32px 20px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={onBack} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 16, boxShadow: "0 1px 4px #2C282510" }}>←</button>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 30, fontWeight: 300, color: "var(--text)", letterSpacing: "-0.3px" }}>Edit Lists</div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase" }}>Tap a section to expand</div>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ padding: "0 20px" }}>
          {/* History section */}
          <div style={{ marginBottom: 8, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)" }}>
            <button onClick={() => setActiveSection(activeSection === "history" ? null : "history")}
              style={{ width: "100%", padding: "14px 16px", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--muted)" }} />
                <span style={{ fontSize: 14 }}>History</span>
              </div>
              <span style={{ fontSize: 10, color: "var(--muted)", transform: activeSection === "history" ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>
            </button>
            {activeSection === "history" && (
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <HistorySection />
              </div>
            )}
          </div>
          {sections.map(s => (
            <div key={s.key} style={{ marginBottom: 8, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)" }}>
              <button onClick={() => setActiveSection(activeSection === s.key ? null : s.key)}
                style={{ width: "100%", padding: "14px 16px", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
                  <span style={{ fontSize: 14 }}>{s.label}</span>
                  <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>{getItems(s.key).length}</span>
                </div>
                <span style={{ fontSize: 10, color: "var(--muted)", transform: activeSection === s.key ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>
              </button>
              {activeSection === s.key && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px" }}>
                  <EditSection
                    title=""
                    color={s.color}
                    items={getItems(s.key)}
                    onAdd={(text, extra) => handleAdd(s.key, text, extra)}
                    onRemove={(idx) => handleRemove(s.key, idx)}
                    onEdit={(idx, text, extra) => handleEdit(s.key, idx, text, extra)}
                    placeholder={s.key === "plan" ? "Event name…" : "Task name…"}
                    extraFields={s.key === "plan" ? [
                      { key: "trigger_month", placeholder: "Trigger month (MM/YYYY)" },
                      { key: "notes", placeholder: "Notes (optional)" },
                      { key: "recurring", placeholder: "Recurring annually", type: "checkbox" },
                    ] : null}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── INBOX SCREEN ─────────────────────────────────────────────────────────────
const GMAIL_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw6oLyH1UN3ZFDxZWH8o7z6XP4tHbTNJKb1CG-XUgmpsQVomNlS1fpDQ0nhFoWoMgbHCQ/exec";

function InboxScreen({ who }) {
  const [emails, setEmails] = useState([]);
  const [archived, setArchived] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null); // email id
  const [emailDetail, setEmailDetail] = useState({}); // id -> detail data
  const [detailLoading, setDetailLoading] = useState(null); // id being loaded
  const [acting, setActing] = useState(null);
  const [newText, setNewText] = useState("");
  const [newContext, setNewContext] = useState("phone");
  const [success, setSuccess] = useState(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(GMAIL_SCRIPT_URL, { redirect: "follow" });
      const data = await res.json();
      setEmails(Array.isArray(data) ? data : []);
    } catch (e) {
      setError("Couldn't load emails.");
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  const toggleExpand = async (email) => {
    if (expanded === email.id) { setExpanded(null); return; }
    setExpanded(email.id);
    if (emailDetail[email.id]) return; // already loaded
    setDetailLoading(email.id);
    try {
      // Apps Script requires params in the URL before redirect
      const url = GMAIL_SCRIPT_URL + "?id=" + encodeURIComponent(email.id);
      const res = await fetch(url, { redirect: "follow", mode: "cors" });
      const text = await res.text();
      const data = JSON.parse(text);
      setEmailDetail(d => ({ ...d, [email.id]: data }));
    } catch (e) {
      console.error("Detail fetch failed", e);
      // Fallback: show preview as body
      setEmailDetail(d => ({ ...d, [email.id]: { messages: [{ id: email.id, from: email.from, date: email.date, body: email.preview, attachments: [] }] } }));
    }
    setDetailLoading(null);
  };

  const createTask = async () => {
    if (!newText.trim()) return;
    const item = { id: `na_inbox_${Date.now()}`, text: newText.trim(), assigned: "alba", context: newContext, done: false };
    await sb.from("next_actions").insert(item);
    setSuccess("Added to Tasks");
    setActing(null); setNewText(""); setNewContext("phone");
    setTimeout(() => setSuccess(null), 2500);
  };

  const archive = (id) => {
    setArchived(s => new Set([...s, id]));
    if (expanded === id) setExpanded(null);
  };

  const visible = emails.filter(e => !archived.has(e.id));

  return (
    <div className="fade" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "32px 20px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 34, fontWeight: 300, color: "var(--text)", marginBottom: 4, letterSpacing: "-0.3px" }}>Inbox</div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase" }}>{visible.length} emails</div>
        </div>
        <button onClick={fetchEmails} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 12px", fontSize: 11, color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>↻ Refresh</button>
      </div>

      {success && (
        <div style={{ margin: "0 20px 12px", padding: "10px 14px", background: "var(--chores)15", border: `1px solid var(--chores)44`, borderRadius: 10, fontSize: 13, color: "var(--chores)" }}>{success}</div>
      )}

      {loading && <Spinner />}
      {error && <div style={{ padding: "0 20px", fontSize: 13, color: "var(--danger)" }}>{error}</div>}

      {!loading && !error && (
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.length === 0 && (
            <div style={{ padding: "14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>Inbox is empty ✦</div>
          )}
          {visible.map(email => {
            const isExpanded = expanded === email.id;
            return (
              <div key={email.id} style={{ borderRadius: 14, background: "var(--surface)", border: `1px solid ${email.unread ? "var(--admin)33" : "var(--border)"}`, boxShadow: "0 1px 6px #2C282508", overflow: "hidden" }}>
                {/* Email header — tap to expand */}
                <div onClick={() => toggleExpand(email)} style={{ padding: "13px 15px", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3, alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      {email.unread && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--admin)", flexShrink: 0 }} />}
                      <div style={{ fontSize: 11, color: "var(--planning)", fontFamily: "'DM Mono', monospace", fontWeight: email.unread ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email.from || "Unknown"}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 10, color: "var(--muted2)", fontFamily: "'DM Mono', monospace" }}>{email.date}</div>
                      <span style={{ fontSize: 10, color: "var(--muted2)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "0.2s", display: "inline-block" }}>▾</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text)", fontWeight: email.unread ? 500 : 400, marginBottom: isExpanded ? 0 : 4, lineHeight: 1.3 }}>{email.subject}</div>
                  {!isExpanded && (
                    <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{email.preview}</div>
                  )}
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div style={{ padding: "0 15px 14px", borderTop: "1px solid var(--border)", marginTop: 4 }}>
                    {detailLoading === email.id ? (
                      <div style={{ fontSize: 11, color: "var(--muted2)", fontFamily: "'DM Mono', monospace", padding: "12px 0" }}>loading…</div>
                    ) : emailDetail[email.id] ? (
                      <>
                        {emailDetail[email.id].messages?.map((msg, mi) => (
                          <div key={msg.id} style={{ marginTop: 12 }}>
                            {emailDetail[email.id].messages.length > 1 && (
                              <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>
                                {msg.from} · {msg.date}
                              </div>
                            )}
                            <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 280, overflowY: "auto" }}>
                              {msg.body}
                            </div>
                            {msg.attachments?.length > 0 && (
                              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                                <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Attachments</div>
                                {msg.attachments.map((att, i) => (
                                  <div key={i} style={{ fontSize: 12, color: "var(--admin)", padding: "7px 10px", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                                    <span>📎</span>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 500 }}>{att.name}</div>
                                      <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>{att.type} · {Math.round(att.size / 1024)}KB</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7, paddingTop: 12, whiteSpace: "pre-wrap" }}>{email.preview}</div>
                    )}
                  </div>
                )}

                {/* Action bar */}
                <div style={{ borderTop: "1px solid var(--border)", display: "flex" }}>
                  <button onClick={() => { setActing({ email }); setNewText(`Reply to: ${email.subject}`); }}
                    style={{ flex: 1, padding: "9px", background: "none", border: "none", borderRight: "1px solid var(--border)", color: "var(--admin)", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                    + Task
                  </button>
                  <button onClick={() => archive(email.id)}
                    style={{ flex: 1, padding: "9px", background: "none", border: "none", color: "var(--muted)", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                    Archive
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task action sheet */}
      {acting && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(44,40,37,0.5)", zIndex: 300, display: "flex", alignItems: "flex-end" }}>
          <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "var(--bg)", borderRadius: "20px 20px 0 0", padding: "24px 20px 48px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: "var(--text)" }}>Add to Tasks</div>
              <button onClick={() => { setActing(null); setNewText(""); }} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 20 }}>×</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'DM Mono', monospace", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acting.email.subject}</div>
            <input autoFocus value={newText} onChange={e => setNewText(e.target.value)}
              placeholder="Task name…"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 13px", color: "var(--text)", fontSize: 14, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              {[["phone","📱 Phone"],["errand","🚗 Errand"],["home","🏠 Home"]].map(([k,l]) => (
                <button key={k} onClick={() => setNewContext(k)} style={{
                  flex: 1, padding: "8px 4px", borderRadius: 8, border: "none", fontSize: 12,
                  background: newContext === k ? "var(--admin)" : "var(--surface2)",
                  color: newContext === k ? "#fff" : "var(--muted)",
                }}>{l}</button>
              ))}
            </div>
            <button onClick={createTask}
              style={{ padding: "13px", background: "var(--admin)", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 500, marginTop: 4 }}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── GOOGLE CALENDAR HOOK ─────────────────────────────────────────────────────
function useGoogleCalendar() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const signIn = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadGoogleScript();
      const tk = await new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: GCAL_CLIENT_ID,
          scope: GCAL_SCOPE,
          callback: (resp) => {
            if (resp.error) reject(new Error(resp.error));
            else resolve(resp.access_token);
          },
        });
        client.requestAccessToken({ prompt: "consent" });
      });
      setGCalToken(tk);
      setToken(tk);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // Auto-restore token from module-level cache
  useEffect(() => {
    if (getGCalToken()) setToken(getGCalToken());
  }, []);

  return { token, signIn, loading, error };
}

async function fetchCalendarEvents(token, calendarId = "primary", daysAhead = 7) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + daysAhead);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${now.toISOString()}&timeMax=${end.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Calendar fetch failed");
  const data = await res.json();
  return data.items || [];
}

async function fetchAllCalendars(token) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Calendar list failed");
  const data = await res.json();
  return data.items || [];
}

// ─── TODAY CALENDAR EVENTS (used in TodayScreen) ──────────────────────────────
function TodayCalendarTab() {
  const { token, signIn, loading: authLoading } = useGoogleCalendar();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    const loadToday = async () => {
      setLoading(true);
      try {
        // Get all calendars then fetch today's events from each
        const cals = await fetchAllCalendars(token);
        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);
        const todayEnd = new Date();
        todayEnd.setHours(23,59,59,999);
        
        const allEvents = [];
        for (const cal of cals.slice(0, 10)) {
          try {
            const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${todayStart.toISOString()}&timeMax=${todayEnd.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=20`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
              const data = await res.json();
              (data.items || []).forEach(e => allEvents.push({ ...e, calendarColor: cal.backgroundColor || "var(--planning)", calendarName: cal.summary }));
            }
          } catch {}
        }
        allEvents.sort((a, b) => {
          const aTime = a.start?.dateTime || a.start?.date || "";
          const bTime = b.start?.dateTime || b.start?.date || "";
          return aTime.localeCompare(bTime);
        });
        setEvents(allEvents);
      } catch (e) {
        setError(e.message);
      }
      setLoading(false);
    };
    loadToday();
  }, [token]);

  if (!token) return (
    <div style={{ padding: "0 20px" }}>
      <div style={{ padding: "20px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "var(--text)", marginBottom: 8 }}>Connect Google Calendar</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>See today's events alongside your routines</div>
        <button onClick={signIn} disabled={authLoading} style={{
          padding: "10px 24px", background: "var(--planning)", border: "none", borderRadius: 10,
          color: "#fff", fontSize: 13, fontWeight: 500,
        }}>{authLoading ? "Connecting…" : "Connect Calendar"}</button>
      </div>
    </div>
  );

  if (loading) return <Spinner />;
  if (error) return <div style={{ padding: "0 20px", fontSize: 13, color: "var(--danger)" }}>{error}</div>;

  return (
    <div style={{ padding: "0 20px" }}>
      {events.length === 0 ? (
        <div style={{ padding: "14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>Nothing in the calendar today ✦</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {events.map(evt => {
            const startTime = evt.start?.dateTime
              ? new Date(evt.start.dateTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" })
              : "All day";
            const endTime = evt.end?.dateTime
              ? new Date(evt.end.dateTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" })
              : null;
            return (
              <div key={evt.id} style={{
                display: "flex", gap: 12, padding: "12px 14px",
                borderRadius: 12, background: "var(--surface)",
                border: "1px solid var(--border)",
                borderLeft: `3px solid ${evt.calendarColor}`,
                boxShadow: "0 1px 4px #2C282508",
              }}>
                <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "var(--muted)", minWidth: 44, paddingTop: 1 }}>
                  {startTime}{endTime ? <><br/>{endTime}</> : null}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500, marginBottom: 2 }}>{evt.summary || "Untitled"}</div>
                  {evt.location && <div style={{ fontSize: 11, color: "var(--muted)" }}>📍 {evt.location}</div>}
                  <div style={{ fontSize: 10, color: evt.calendarColor, fontFamily: "'DM Mono', monospace", marginTop: 3 }}>{evt.calendarName}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── CALENDAR SCREEN ──────────────────────────────────────────────────────────
function CalendarScreen() {
  const { token, signIn, loading: authLoading, error: authError } = useGoogleCalendar();
  const [calendars, setCalendars] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedCals, setSelectedCals] = useState(new Set());
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    if (!token) return;
    fetchAllCalendars(token).then(cals => {
      setCalendars(cals);
      setSelectedCals(new Set(cals.map(c => c.id)));
    }).catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!token || calendars.length === 0) return;
    const loadEvents = async () => {
      setLoading(true);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0, 23, 59, 59);
      const allEvents = [];
      for (const cal of calendars) {
        if (!selectedCals.has(cal.id)) continue;
        try {
          const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${monthStart.toISOString()}&timeMax=${monthEnd.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=100`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            (data.items || []).forEach(e => allEvents.push({ ...e, calendarColor: cal.backgroundColor || "#9A7A42", calendarName: cal.summary }));
          }
        } catch {}
      }
      allEvents.sort((a, b) => (a.start?.dateTime || a.start?.date || "").localeCompare(b.start?.dateTime || b.start?.date || ""));
      setEvents(allEvents);
      setLoading(false);
    };
    loadEvents();
  }, [token, calendars, selectedCals, monthOffset]);

  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthLabel = viewDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = (viewDate.getDay() + 6) % 7; // Mon=0
  const today = new Date();

  const eventsForDay = (day) => {
    const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return events.filter(e => (e.start?.dateTime || e.start?.date || "").startsWith(dateStr));
  };

  const selectedDayEvents = selectedDay ? eventsForDay(selectedDay) : [];

  if (!token) return (
    <div className="fade" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "32px 20px 18px" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 34, fontWeight: 300, color: "var(--text)", marginBottom: 4 }}>Calendar</div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase" }}>All your calendars</div>
      </div>
      <div style={{ padding: "0 20px" }}>
        <div style={{ padding: "24px 20px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontFamily: "'Cormorant Garamond', serif", color: "var(--text)", marginBottom: 8 }}>Connect Google Calendar</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20, lineHeight: 1.6 }}>Sign in once to see all your calendars and events.</div>
          <button onClick={signIn} disabled={authLoading} style={{ padding: "12px 28px", background: "var(--planning)", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 500 }}>
            {authLoading ? "Connecting…" : "Connect Calendar"}
          </button>
          {authError && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 12 }}>{authError}</div>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "32px 20px 12px" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 34, fontWeight: 300, color: "var(--text)", marginBottom: 4 }}>Calendar</div>
      </div>

      <div style={{ display: "flex", gap: 0 }}>
        {/* Sidebar calendar toggles */}
        <div style={{ width: 110, flexShrink: 0, padding: "0 8px 0 12px", display: "flex", flexDirection: "column", gap: 7, paddingTop: 8 }}>
          {calendars.map(cal => (
            <button key={cal.id} onClick={() => setSelectedCals(s => {
              const n = new Set(s); n.has(cal.id) ? n.delete(cal.id) : n.add(cal.id); return n;
            })} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: "none", cursor: "pointer",
              opacity: selectedCals.has(cal.id) ? 1 : 0.35,
              transition: "opacity 0.18s", textAlign: "left", padding: 0,
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                background: cal.backgroundColor || "var(--planning)",
              }} />
              <span style={{
                fontSize: 9, color: "var(--text)", fontFamily: "'DM Mono', monospace",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: 84,
              }}>{cal.summary}</span>
            </button>
          ))}
        </div>

        {/* Main calendar area */}
        <div style={{ flex: 1, paddingRight: 12 }}>
          {/* Month navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingRight: 4 }}>
            <button onClick={() => { setMonthOffset(m => m - 1); setSelectedDay(null); }} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 18, padding: "4px 8px" }}>‹</button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: "var(--text)", letterSpacing: "0.5px" }}>{monthLabel}</div>
              <button onClick={() => { setMonthOffset(0); setSelectedDay(today.getDate()); }} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 20, background: monthOffset === 0 ? "var(--surface2)" : "var(--morning)", border: `1px solid ${monthOffset === 0 ? "var(--border)" : "transparent"}`, color: monthOffset === 0 ? "var(--muted)" : "#fff", fontFamily: "'DM Mono', monospace", letterSpacing: "0.5px" }}>today</button>
            </div>
            <button onClick={() => { setMonthOffset(m => m + 1); setSelectedDay(null); }} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 18, padding: "4px 8px" }}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
            {["M","T","W","T","F","S","S"].map((d, i) => (
              <div key={i} style={{ fontSize: 9, textAlign: "center", color: "var(--muted2)", fontFamily: "'DM Mono', monospace", paddingBottom: 4 }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          {loading ? <Spinner /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayEvts = eventsForDay(day);
                const isToday = today.getDate() === day && today.getMonth() === viewDate.getMonth() && today.getFullYear() === viewDate.getFullYear();
                const isSelected = selectedDay === day;
                return (
                  <button key={day} onClick={() => setSelectedDay(isSelected ? null : day)} style={{
                    aspectRatio: "1/1", borderRadius: 8, border: "none",
                    background: isSelected ? "var(--text)" : isToday ? "var(--morning)15" : "transparent",
                    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center",
                    padding: "3px 2px", gap: 2, position: "relative",
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: isToday ? 600 : 400,
                      color: isSelected ? "var(--bg)" : isToday ? "var(--morning)" : "var(--text)",
                      lineHeight: 1,
                    }}>{day}</span>
                    {/* Event dots */}
                    <div style={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center" }}>
                      {dayEvts.slice(0, 3).map((e, ei) => (
                        <div key={ei} style={{ width: 4, height: 4, borderRadius: "50%", background: isSelected ? "rgba(255,255,255,0.7)" : e.calendarColor }} />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Selected day events */}
      {selectedDay && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
            {new Date(viewDate.getFullYear(), viewDate.getMonth(), selectedDay).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          {selectedDayEvents.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted2)", textAlign: "center", padding: "14px" }}>Nothing on this day</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedDayEvents.map(evt => {
                const startTime = evt.start?.dateTime
                  ? new Date(evt.start.dateTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" })
                  : "All day";
                const endTime = evt.end?.dateTime
                  ? new Date(evt.end.dateTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" })
                  : null;
                return (
                  <div key={evt.id} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${evt.calendarColor}` }}>
                    <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "var(--muted)", minWidth: 44 }}>
                      {startTime}{endTime && <><br />{endTime}</>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500, marginBottom: 2 }}>{evt.summary || "Untitled"}</div>
                      {evt.location && <div style={{ fontSize: 11, color: "var(--muted)" }}>📍 {evt.location}</div>}
                      <div style={{ fontSize: 10, color: evt.calendarColor, fontFamily: "'DM Mono', monospace", marginTop: 3 }}>{evt.calendarName}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── CONNECT SCREEN ───────────────────────────────────────────────────────────
const CONTACTS = [
  { id: "mary",   name: "Mary",   role: "Friend",  notes: "Works reduced hours. Afternoon meets. Weekend playdates.", phone: "35677108584" },
  { id: "martha", name: "Martha", role: "BFF",     notes: "BFF. Check-ins. Voice notes.", phone: "35677108584" },
  { id: "luke",   name: "Luke",   role: "BFF",     notes: "BFF. Random musings. Photos.", phone: "35677108584" },
  { id: "josh",   name: "Josh",   role: "Husband", notes: "Love of your life. Send some love.", phone: "35677108584" },
];

const AVATAR_COLORS = {
  mary:   { bg: "#FBEAF0", color: "#993556" },
  martha: { bg: "#EEEDFE", color: "#3C3489" },
  luke:   { bg: "#E1F5EE", color: "#085041" },
  josh:   { bg: "#FAEEDA", color: "#633806" },
};

function ContactCard({ contact, calToken }) {
  const [expanded, setExpanded] = useState(false);
  const [nextEvent, setNextEvent] = useState(null);
  const [eventLoading, setEventLoading] = useState(false);
  const av = AVATAR_COLORS[contact.id] || { bg: "var(--surface2)", color: "var(--muted)" };
  const initials = contact.name.slice(0, 2);

  const loadNextEvent = async () => {
    if (!calToken || nextEvent !== null) return;
    setEventLoading(true);
    try {
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${encodeURIComponent(contact.name)}&timeMin=${now}&timeMax=${end}&singleEvents=true&orderBy=startTime&maxResults=1`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${calToken}` } });
      if (res.ok) {
        const data = await res.json();
        const evt = data.items?.[0];
        if (evt) {
          const dateStr = evt.start?.dateTime
            ? new Date(evt.start.dateTime).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Malta" })
            : new Date(evt.start.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
          setNextEvent({ title: evt.summary, date: dateStr });
        } else {
          setNextEvent({ title: null, date: null });
        }
      }
    } catch (e) { setNextEvent({ title: null, date: null }); }
    setEventLoading(false);
  };

  const toggle = () => {
    setExpanded(e => !e);
    if (!expanded) loadNextEvent();
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Card top — always visible, tappable */}
      <div onClick={toggle} style={{ cursor: "pointer", padding: "18px 14px 12px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10 }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: av.bg, color: av.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 500, flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 2 }}>{contact.name}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.3px" }}>{contact.role}</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>{contact.notes}</div>
        <div style={{ fontSize: 10, color: "var(--muted2)", transition: "0.2s", transform: expanded ? "rotate(180deg)" : "none" }}>▾</div>
      </div>

      {/* Expanded: next meetup */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px", background: "var(--surface2)" }}>
          {eventLoading ? (
            <div style={{ fontSize: 11, color: "var(--muted2)", fontFamily: "'DM Mono', monospace", textAlign: "center" }}>searching calendar…</div>
          ) : nextEvent?.date ? (
            <div style={{ fontSize: 12, color: "var(--text)", textAlign: "center", lineHeight: 1.5 }}>
              <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--planning)", textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: 4 }}>Next meetup</span>
              <span style={{ fontWeight: 500 }}>{nextEvent.date}</span>
              {nextEvent.title && <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{nextEvent.title}</span>}
            </div>
          ) : !calToken ? (
            <div style={{ fontSize: 11, color: "var(--muted2)", fontFamily: "'DM Mono', monospace", textAlign: "center" }}>Connect calendar to see meetups</div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--muted2)", fontFamily: "'DM Mono', monospace", textAlign: "center" }}>No upcoming meetups found</div>
          )}
        </div>
      )}

      {/* WhatsApp button */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "14px", display: "flex", justifyContent: "center", marginTop: "auto" }}>
        <a href={`https://wa.me/${contact.phone}`} style={{ width: 44, height: 44, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
          target="_blank" rel="noopener noreferrer">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
          </svg>
        </a>
      </div>
    </div>
  );
}

function ConnectScreen() {
  const { token } = useGoogleCalendar();

  return (
    <div className="fade" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "32px 20px 20px" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 34, fontWeight: 300, color: "var(--text)", marginBottom: 4, letterSpacing: "-0.3px" }}>Connect</div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "1px", textTransform: "uppercase" }}>Your people</div>
      </div>
      <div style={{ padding: "0 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {CONTACTS.map(c => <ContactCard key={c.id} contact={c} calToken={token} />)}
      </div>
    </div>
  );
}

// ─── BOTTOM NAV ───────────────────────────────────────────────────────────────
const NAV = [
  { key: "today", label: "Today", icon: "◎" },
  { key: "week", label: "Week", icon: "▦" },
  { key: "month", label: "Month", icon: "◫" },
  { key: "tasks", label: "Tasks", icon: "◈" },
  { key: "plan", label: "Plan", icon: "◷" },
  { key: "inbox", label: "Inbox", icon: "✉" },
  { key: "connect", label: "Connect", icon: "♡", albaOnly: true },
];

function BottomNav({ active, onChange, who, onWhoReset }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto",
      background: "rgba(250,248,245,0.94)", backdropFilter: "blur(24px)",
      borderTop: "1px solid var(--border)",
      display: "flex", padding: "10px 0 env(safe-area-inset-bottom, 20px)", zIndex: 100,
      boxShadow: "0 -4px 24px #2C282508",
    }}>
      {NAV.filter(n => !n.albaOnly || who === "alba").map(n => (
        <button key={n.key} onClick={() => onChange(n.key)} style={{
          flex: 1, background: "none", border: "none",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          padding: "4px 0",
          color: active === n.key ? "var(--text)" : "var(--muted2)",
          transition: "color 0.18s",
        }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>{n.icon}</span>
          <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.8px", textTransform: "uppercase" }}>{n.label}</span>
          {active === n.key && <div style={{ width: 16, height: 2, borderRadius: 1, background: "var(--text)", marginTop: 1 }} />}
        </button>
      ))}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
function SettingsIcon({ onPress }) {
  return (
    <button onClick={onPress} style={{
      position: "fixed", top: 22, right: 20, zIndex: 200,
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 10, width: 34, height: 34,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "var(--muted)", fontSize: 14,
      boxShadow: "0 1px 4px #2C282510",
    }}>⚙</button>
  );
}

function WelcomeScreen({ onChoose }) {


  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 0, background: "var(--bg)" }}>

      {/* App name */}
      <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300, fontSize: 44, letterSpacing: "-0.5px", color: "var(--text)", display: "flex", alignItems: "baseline", marginBottom: 48 }}>
        <span style={{
          opacity: 1, display: "inline-block",
        }}>mental</span>
        <span style={{
          display: "inline-block", marginLeft: "0.22em", color: "var(--morning)",
        }}>load.</span>
      </div>

      {/* Who's here */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%", maxWidth: 280 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "1.5px", textTransform: "uppercase" }}>Who's here?</div>
        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          {[["alba", "var(--morning)"], ["josh", "var(--josh)"]].map(([w, c]) => (
            <button key={w} onClick={() => onChoose(w)} style={{
              flex: 1, padding: "16px 0", borderRadius: 12,
              background: c, border: "none",
              color: "#fff", fontSize: 15, fontWeight: 500,
              textTransform: "capitalize", letterSpacing: "0.5px",
              boxShadow: `0 4px 20px ${c}55`,
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}>{w}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [who, chooseWho] = useWho();
  const [screen, setScreen] = useState("today");
  const [editing, setEditing] = useState(false);
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
  const [desktop, setDesktop] = useState(isDesktop);

  useEffect(() => {
    const handler = () => setDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  if (!who) return (<><GlobalStyles /><WelcomeScreen onChoose={chooseWho} /></>);
  if (editing) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", maxWidth: 480, margin: "0 auto" }}>
      <GlobalStyles />
      <EditScreen onBack={() => setEditing(false)} />
    </div>
  );

  const screens = {
    today: <TodayScreen who={who} />,
    week: <WeekScreen who={who} />,
    month: <MonthScreen who={who} />,
    tasks: <TasksScreen who={who} />,
    plan: <PlanScreen />,
    inbox: <InboxScreen who={who} />,
    connect: <ConnectScreen />,
  };

  const SIDEBAR_W = 220;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <GlobalStyles />

      {/* Desktop sidebar */}
      <div className="app-sidebar" style={{
        flexDirection: "column", width: SIDEBAR_W, minHeight: "100vh",
        borderRight: "1px solid var(--border)", background: "var(--surface)",
        padding: "32px 0 24px", position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 100,
      }}>
        <div style={{ padding: "0 20px 28px", fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 300, color: "var(--text)", letterSpacing: "-0.3px" }}>
          mental <span style={{ color: "var(--morning)" }}>load.</span>
        </div>
        {NAV.filter(n => !n.albaOnly || who === "alba").map(n => (
          <button key={n.key} onClick={() => setScreen(n.key)} style={{
            width: "100%", padding: "11px 20px", border: "none",
            display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
            background: screen === n.key ? "var(--surface2)" : "transparent",
            borderLeft: `3px solid ${screen === n.key ? "var(--morning)" : "transparent"}`,
            color: screen === n.key ? "var(--text)" : "var(--muted)",
            fontSize: 13, textAlign: "left", transition: "all 0.15s",
          }}>
            <span style={{ fontSize: 13 }}>{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setEditing(true)} style={{ padding: "11px 20px", background: "transparent", border: "none", display: "flex", alignItems: "center", gap: 12, color: "var(--muted)", fontSize: 13, cursor: "pointer", width: "100%" }}>
          <span>⚙</span><span>Edit Lists</span>
        </button>
        <div style={{ padding: "10px 20px 0", fontSize: 11, color: "var(--muted2)", fontFamily: "'DM Mono', monospace" }}>
          {who === "alba" ? "Alba" : "Josh"} · <button onClick={() => { localStorage.removeItem("hb_who"); window.location.reload(); }} style={{ background: "none", border: "none", color: "var(--muted2)", fontSize: 11, fontFamily: "'DM Mono', monospace", cursor: "pointer", padding: 0, textDecoration: "underline" }}>switch</button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: desktop ? SIDEBAR_W : 0, paddingBottom: desktop ? 0 : 100 }}>
        <div key={screen} className="fade" style={{ maxWidth: desktop ? 800 : "100%" }}>{screens[screen]}</div>
      </div>

      {/* Mobile bottom nav + settings */}
      {!desktop && <>
        <BottomNav active={screen} onChange={setScreen} who={who} />
        <SettingsIcon onPress={() => setEditing(true)} />
        {/* Mobile who/switch */}
        <div style={{ position: "fixed", top: 26, left: 16, zIndex: 200, fontSize: 10, color: "var(--muted2)", fontFamily: "'DM Mono', monospace" }}>
          {who === "alba" ? "Alba" : "Josh"} · <button onClick={() => { localStorage.removeItem("hb_who"); window.location.reload(); }} style={{ background: "none", border: "none", color: "var(--muted2)", fontSize: 10, fontFamily: "'DM Mono', monospace", cursor: "pointer", padding: 0, textDecoration: "underline" }}>switch</button>
        </div>
      </>}
    </div>
  );
}
