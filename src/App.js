import React, { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";


// ─── HAPTIC FEEDBACK ──────────────────────────────────────────────────────────
// Works on Android PWA. Silently ignored on iOS (Apple restricts vibration API).
const haptic = (pattern = 8) => {
  if (navigator.vibrate) navigator.vibrate(pattern);
};

// ─── ERROR BOUNDARY ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", fontSize: 13, color: "#C44A4A", background: "#FAF8F5", minHeight: "100vh" }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>mental load. — crash report</div>
          <div style={{ marginBottom: 8 }}>{this.state.error.message}</div>
          <div style={{ color: "#7A706A", whiteSpace: "pre-wrap", fontSize: 11 }}>{this.state.error.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://qvibdnrfywisvfsqgqux.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2aWJkbnJmeXdpc3Zmc3FncXV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTE5MTcsImV4cCI6MjA5NDQ2NzkxN30.qPNjcpQpHPV5_SVz3U-JC18CcZ6vxio9vImA3CKg5jk";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── GOOGLE CALENDAR ──────────────────────────────────────────────────────────
const GCAL_CLIENT_ID    = "283368801613-lku2v6o5uvaqh5ttkci8u2d47bu9etdm.apps.googleusercontent.com";
const GCAL_SCOPE        = "https://www.googleapis.com/auth/calendar.readonly";
const GCAL_REDIRECT_URI = "https://albacamilleri-source.github.io/mental-load";
const GCAL_EDGE_FN      = "https://qvibdnrfywisvfsqgqux.supabase.co/functions/v1/gcal-auth";
const GCAL_APP_SECRET   = "ml-alba-2026";

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
const PUSH_EDGE_FN     = "https://qvibdnrfywisvfsqgqux.supabase.co/functions/v1/push-notify";
const VAPID_PUBLIC_KEY = "BI1EoEJUUW-AInYBCb19XuRUUZO_1YkxWqp6JAw_UnqLiam0arV05Y30sDZDh50zPK6AUhKzeEKMMQPx2n4Dqho";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function registerPushForJosh() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  try {
    const reg = await navigator.serviceWorker.register("/mental-load/sw.js");
    await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    await fetch(PUSH_EDGE_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON}` },
      body: JSON.stringify({ action: "save", subscription, secret: GCAL_APP_SECRET }),
    });
    localStorage.setItem("push_registered_josh", "1");
    return true;
  } catch (e) {
    console.error("Push registration failed:", e);
    return false;
  }
}

async function notifyJosh(taskText) {
  try {
    await fetch(PUSH_EDGE_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON}` },
      body: JSON.stringify({ action: "notify", taskText, secret: GCAL_APP_SECRET }),
    });
  } catch (e) {
    console.error("Push notify failed:", e);
  }
}

let _gcalToken = null;
const getGCalToken = () => _gcalToken;
const setGCalToken = (t) => { _gcalToken = t; };

// ── Clear any legacy implicit-flow tokens on load ─────────────────────────────
// Old flow stored tokens differently — wipe them so the new code starts clean.
(function clearLegacyTokens() {
  const token = localStorage.getItem("gcal_token");
  const expiry = parseInt(localStorage.getItem("gcal_expiry") || "0", 10);
  // If there's a token but no ever_connected flag, it's from the old flow — clear it
  if (token && !localStorage.getItem("gcal_ever_connected")) {
    localStorage.removeItem("gcal_token");
    localStorage.removeItem("gcal_expiry");
  }
})();
const storeToken = (token, expiresIn = 3600) => {
  const expiry = Date.now() + (parseInt(expiresIn, 10) * 1000) - 60000; // 1min buffer
  localStorage.setItem("gcal_token", token);
  localStorage.setItem("gcal_expiry", String(expiry));
  _gcalToken = token;
};

const getStoredToken = () => {
  const token = localStorage.getItem("gcal_token");
  const expiry = parseInt(localStorage.getItem("gcal_expiry") || "0", 10);
  if (!token || Date.now() > expiry) {
    localStorage.removeItem("gcal_token");
    localStorage.removeItem("gcal_expiry");
    return null;
  }
  return token;
};

// ── Step 1: redirect user to Google sign-in ───────────────────────────────────
// Uses authorization_code flow (not implicit) so we get a refresh token.
const signInWithRedirect = () => {
  const params = new URLSearchParams({
    client_id:     GCAL_CLIENT_ID,
    redirect_uri:  GCAL_REDIRECT_URI,
    response_type: "code",
    scope:         GCAL_SCOPE,
    access_type:   "offline",
    prompt:        "consent",
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
};

// ── Step 2: on return from Google, exchange the code via Edge Function ─────────
const exchangeCodeFromURL = async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return null;
  // Clean code from URL immediately
  window.history.replaceState(null, "", window.location.pathname);
  try {
    const res = await fetch(GCAL_EDGE_FN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ action: "exchange", code, secret: GCAL_APP_SECRET }),
    });
    const data = await res.json();
    console.log("Exchange response:", res.status, JSON.stringify(data));
    if (data.error) throw new Error(data.error);
    storeToken(data.access_token, data.expires_in);
    return data.access_token;
  } catch (e) {
    console.error("Token exchange failed:", e.message);
    return null;
  }
};

// ── Step 3: silently refresh when token expires ────────────────────────────────
const refreshToken = async () => {
  try {
    const res = await fetch(GCAL_EDGE_FN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify({ action: "refresh", secret: GCAL_APP_SECRET }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    storeToken(data.access_token, data.expires_in);
    return data.access_token;
  } catch (e) {
    console.error("Token refresh failed:", e);
    return null;
  }
};


// Legacy popup path for desktop browsers
const loadGoogleScript = () => new Promise((resolve, reject) => {
  if (window.google?.accounts?.oauth2) return resolve();
  const existing = document.getElementById("google-gsi");
  if (!existing) {
    const s = document.createElement("script");
    s.id = "google-gsi"; s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }
  const started = Date.now();
  const check = setInterval(() => {
    if (window.google?.accounts?.oauth2) { clearInterval(check); resolve(); }
    else if (Date.now() - started > 10000) { clearInterval(check); reject(new Error("GSI timeout")); }
  }, 100);
});


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

// ─── PLAN ROLLOVER (runs once per calendar month, checkpointed in app_meta) ───
async function runPlanRollover() {
  const currentMonthKey = (() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  })();

  try {
    const { data: meta } = await sb.from("app_meta").select("value").eq("key", "plan_rollover_last_run").maybeSingle();
    if (meta?.value === currentMonthKey) return; // already ran this month

    const { data: due, error: dueError } = await sb.from("planning_events")
      .select("*")
      .eq("trigger_month", currentMonthKey)
      .eq("done", false)
      .eq("promoted", false);
    if (dueError) { console.error("Plan rollover: failed to load due items:", dueError); return; }

    for (const item of (due || [])) {
      const { error: naError } = await sb.from("next_actions").insert({
        id: `na_plan_${item.id}_${Date.now()}`,
        text: item.text,
        assigned: "alba",
        context: "phone",
        done: false,
      });
      if (naError) { console.error("Plan rollover: failed to copy item to Tasks:", item.text, naError); continue; }

      const { error: promoteError } = await sb.from("planning_events").update({ promoted: true }).eq("id", item.id);
      if (promoteError) console.error("Plan rollover: failed to mark promoted:", item.text, promoteError);

      if (item.recurring) {
        const { error: rollError } = await sb.from("planning_events").insert({
          id: `pl_${item.id}_${Date.now()}`,
          text: item.text,
          trigger_month: advanceTriggerMonth(item.trigger_month),
          notes: item.notes || "",
          recurring: true,
          done: false,
          promoted: false,
        });
        if (rollError) console.error("Plan rollover: failed to create next-year copy:", item.text, rollError);
      }
    }

    const { error: metaError } = await sb.from("app_meta").upsert({ key: "plan_rollover_last_run", value: currentMonthKey });
    if (metaError) console.error("Plan rollover: failed to write checkpoint:", metaError);
  } catch (e) {
    console.error("Plan rollover: unexpected error:", e);
  }
}

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
    link.href = "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=Outfit:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
      html, body { background: #FAF8F5; color: var(--ml-ink); font-family: 'Outfit', sans-serif; overscroll-behavior: none; height: 100%; }
      :root {
        /* ── Brand layer (locked) ── */
        --ml-bone:        #F7F4F0;
        --ml-vellum:      #EFEAE0;
        --ml-paper:       #FAF8F5;
        --ml-ink:         #1C1A18;
        --ml-quiet:       #7A706A;
        --ml-muted:       #B8B0A6;
        --ml-border:      #E4DED6;
        --ml-accent:      #8A6B52;
        --ml-accent-soft: #8A6B5215;
        --ml-ink-soft:    #1C1A1810;

        /* ── Existing tokens — now reference brand layer ── */
        --bg:       var(--ml-bone);
        --surface:  #FFFFFF;
        --surface2: var(--ml-vellum);
        --border:   var(--ml-border);
        --text:     var(--ml-ink);
        --muted:    var(--ml-quiet);
        --muted2:   var(--ml-muted);

        /* ── Semantic product colors ── */
        --sage:     #7C9E8A;
        --morning:  #C4A882;
        --evening:  #4A7D8A;
        --chores:   #7C9E8A;
        --admin:    #7A6AA8;
        --meals:    #C4623A;
        --planning: #C4A882;
        --josh:     #3A8A72;
        --danger:   #C44A4A;
        --rose:     #D4A8A0;
        --pebble:   #7A706B;
        --birch:    #D5CEC6;

        /* ── Type tokens ── */
        --font-serif: 'Lora', Georgia, serif;
        --font-sans:  'Outfit', system-ui, sans-serif;
        --font-mono:  'DM Mono', ui-monospace, monospace;
        --size-display: 60px; --size-h1: 40px; --size-h2: 32px;
        --size-body: 20px; --size-ui: 17px; --size-caption: 14px;
        --size-mono: 14px; --size-micro: 11px;
        --tr-display: -0.03em; --tr-h1: -0.02em; --tr-h2: -0.015em;
        --tr-mono: 0.18em; --tr-micro: 0.22em;

        /* ── Spacing ── */
        --space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;
        --space-5:20px;--space-6:24px;--space-8:32px;--space-10:40px;
        --space-12:48px;--space-16:64px;--space-20:80px;

        /* ── Radii & elevation ── */
        --radius-pill:999px;--radius-card:14px;--radius-row:12px;--radius-button:10px;
        --shadow-card:0 1px 4px rgba(28,26,24,0.04);
        --shadow-elev:0 4px 20px rgba(28,26,24,0.08);
      }
      input, textarea, select { font-family: 'Outfit', sans-serif; }
      button { cursor: pointer; font-family: 'Outfit', sans-serif; }
      ::-webkit-scrollbar { display: none; }
      .slide-left  { animation: slideLeft  0.28s cubic-bezier(0.32,0,0.24,1) forwards; }
      .slide-right { animation: slideRight 0.28s cubic-bezier(0.32,0,0.24,1) forwards; }
      @keyframes slideLeft  { from { opacity: 0; transform: translateX(28px);  } to { opacity: 1; transform: translateX(0); } }
      @keyframes slideRight { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: translateX(0); } }
      .pop { animation: pop 0.22s cubic-bezier(.34,1.56,.64,1) forwards; }
      @keyframes shimmer {
        0%   { background-position: -400px 0; }
        100% { background-position: 400px 0; }
      }
      .skeleton {
        background: linear-gradient(90deg, var(--surface2) 25%, var(--bg) 50%, var(--surface2) 75%);
        background-size: 800px 100%;
        animation: shimmer 1.4s ease-in-out infinite;
        border-radius: 8px;
      }
      .press {
        transition: transform 0.1s cubic-bezier(0.34,1.56,0.64,1), opacity 0.1s ease;
        -webkit-tap-highlight-color: transparent;
        cursor: pointer;
      }
      .press:active { transform: scale(0.96); opacity: 0.85; }
      button { -webkit-tap-highlight-color: transparent; }
      * { -webkit-tap-highlight-color: transparent; }
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
    <button onClick={() => { setAnim(true); setTimeout(() => setAnim(false), 300); onChange(); haptic(8); }}
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        border: `1.5px solid ${checked ? color : "var(--border)"}`,
        background: checked ? color : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", outline: "none",
        transform: anim ? "scale(1.25)" : "scale(1)",
        transition: "all 0.18s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
      {checked && <div style={{ width: size * 0.35, height: size * 0.35, borderRadius: "50%", background: "#fff" }} />}
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
        <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color, textTransform: "uppercase", letterSpacing: "0.22em", fontWeight: 400 }}>{text}</span>
        {total !== undefined && <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted2)" }}>{done}/{total}</span>}
      </div>
      {total !== undefined && <Bar done={done} total={total} color={color} />}
    </div>
  );
}

function TaskRow({ text, done, onToggle, onDelete, color, sub, overdue, dueDate, badge, taskId, subCompletions, onSubToggle }) {
  const [open, setOpen] = useState(true);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(null);
  const toggling = useRef(false);
  const THRESHOLD = 72;
  const hasSub = sub && sub.length > 0;

  const handleTouchStart = (e) => {
    if (hasSub) return;
    startX.current = e.touches[0].clientX; setSwiping(true);
  };
  const handleTouchMove = (e) => {
    if (hasSub || startX.current === null) return;
    setSwipeX(Math.max(-80, Math.min(80, e.touches[0].clientX - startX.current)));
  };
  const handleTouchEnd = () => {
    if (!hasSub) {
      if (swipeX >= THRESHOLD) { haptic([8, 50, 8]); onToggle && onToggle(); }
      else if (swipeX <= -THRESHOLD) { haptic([8, 50, 8]); onDelete && onDelete(); }
    }
    setSwipeX(0); setSwiping(false); startX.current = null;
  };

  const swipeProgress = Math.abs(swipeX) / THRESHOLD;
  const showComplete = swipeX > 20;
  const showDelete = swipeX < -20;
  const ctxLabel = badge === "phone" ? "📱" : badge === "errand" ? "🚗" : badge === "home" ? "🏠" : null;

  return (
    <div style={{ marginBottom: 3 }}>
      <div style={{ position: "relative", overflow: hasSub ? "visible" : "hidden", borderRadius: 12 }}>
        {!hasSub && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: 12,
            background: showDelete ? `rgba(196,74,74,${Math.min(swipeProgress*0.3,0.25)})` : showComplete ? `rgba(124,158,138,${Math.min(swipeProgress*0.3,0.25)})` : "transparent",
            display: "flex", alignItems: "center",
            justifyContent: showDelete ? "flex-end" : "flex-start",
            padding: "0 18px", pointerEvents: "none",
          }}>
            {showComplete && <span style={{ fontSize: 11, color: "var(--sage)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.18em", opacity: Math.min(swipeProgress,1) }}>✓ done</span>}
            {showDelete && <span style={{ fontSize: 11, color: "var(--danger)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.18em", opacity: Math.min(swipeProgress,1) }}>delete</span>}
          </div>
        )}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={() => {
            if (!hasSub && Math.abs(swipeX) < 5 && !toggling.current) {
              toggling.current = true; haptic(8); onToggle && onToggle();
              setTimeout(() => { toggling.current = false; }, 500);
            }
          }}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "11px 14px", borderRadius: 12,
            background: done ? "transparent" : "var(--surface)",
            border: `1px solid ${done ? "transparent" : overdue ? "#C44A4A22" : "var(--border)"}`,
            boxShadow: done ? "none" : "0 1px 4px rgba(28,26,24,0.04)",
            transform: `translateX(${swipeX}px)`,
            transition: swiping ? "none" : "all 0.28s cubic-bezier(0.32,0,0.24,1)",
            userSelect: "none", cursor: hasSub ? "default" : "pointer",
          }}>
          {ctxLabel && <span style={{ fontSize: 11, width: 18, textAlign: "center", flexShrink: 0, opacity: done ? 0.4 : 1 }}>{ctxLabel}</span>}
          <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: done ? "var(--border)" : color, transition: "all 0.18s" }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 14, color: done ? "var(--muted2)" : "var(--text)", textDecoration: done ? "line-through" : "none", transition: "all 0.18s" }}>{text}</span>
            {overdue && !done && <span style={{ fontSize: 9, marginLeft: 6, padding: "2px 7px", borderRadius: 20, background: "#C44A4A15", color: "var(--danger)", fontFamily: "'DM Mono', monospace" }}>overdue {dueDate}</span>}
            {dueDate && !overdue && !done && <span style={{ fontSize: 9, marginLeft: 6, padding: "2px 7px", borderRadius: 20, background: "var(--surface2)", color: "var(--muted2)", fontFamily: "'DM Mono', monospace" }}>{dueDate}</span>}
          </div>
          {hasSub && <span onClick={e => { e.stopPropagation(); setOpen(o => !o); }} style={{ fontSize: 10, color: "var(--muted2)", transform: open ? "rotate(180deg)" : "none", transition: "0.2s", cursor: "pointer", padding: "0 2px" }}>▾</span>}
        </div>
      </div>

      {hasSub && open && (
        <div style={{ marginLeft: 14, marginTop: 3, display: "flex", flexDirection: "column", gap: 2 }}>
          {sub.map((s, i) => {
            const subKey = `${taskId}:${i}`;
            const subDone = subCompletions && subCompletions.has(subKey);
            return (
              <div key={i} onClick={() => onSubToggle && onSubToggle(taskId, i, subKey, sub.length)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", userSelect: "none" }}>
                <div style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${subDone ? color : "var(--border)"}`, background: subDone ? color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                  {subDone && <svg width="9" height="9" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <span style={{ fontSize: 13, color: subDone ? "var(--muted2)" : "var(--text)", textDecoration: subDone ? "line-through" : "none", transition: "all 0.15s", flex: 1 }}>{s}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      {[100, 75, 90, 60].map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skeleton" style={{ height: 13, width: `${w}%` }} />
            <div className="skeleton" style={{ height: 10, width: `${w * 0.6}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonCard({ rows = 3 }) {
  return (
    <div style={{ margin: "0 20px 12px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(28,26,24,0.04)" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ padding: "14px 16px", borderBottom: i < rows - 1 ? "1px solid var(--surface2)" : "none", display: "flex", alignItems: "center", gap: 12 }}>
          <div className="skeleton" style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }} />
          <div className="skeleton" style={{ height: 13, flex: 1 }} />
        </div>
      ))}
    </div>
  );
}

function SkeletonList({ count = 4 }) {
  return (
    <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 52, borderRadius: 12 }} />
      ))}
    </div>
  );
}


// ─── WEATHER HOOK ─────────────────────────────────────────────────────────────
function useWeather() {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=35.9042&longitude=14.5189&current=temperature_2m,weathercode,apparent_temperature,relative_humidity_2m,windspeed_10m,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,weathercode,sunrise,sunset&timezone=Europe%2FMalta&forecast_days=2")
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
  const sunrise = daily.sunrise?.[0] ? new Date(daily.sunrise[0]).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }) : null;
  const sunset = daily.sunset?.[0] ? new Date(daily.sunset[0]).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Malta" }) : null;
  return (
    <div style={{ padding: "0 20px 20px" }}>
      <div style={{ borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", padding: "14px 16px", boxShadow: "0 1px 4px rgba(28,26,24,0.04)" }}>
        {/* Main temp + condition */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 36, lineHeight: 1 }}>{wmoEmoji(cur.weathercode)}</span>
            <div>
              <div style={{ fontFamily: "'Lora', serif", fontSize: 40, fontWeight: 400, color: "var(--text)", lineHeight: 1, letterSpacing: "-0.025em" }}>{Math.round(cur.temperature_2m)}°</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{wmoLabel(cur.weathercode)}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>H: {Math.round(daily.temperature_2m_max[0])}° · L: {Math.round(daily.temperature_2m_min[0])}°</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>Feels like {Math.round(cur.apparent_temperature)}°</div>
          </div>
        </div>
        {/* Detail row */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { label: "Humidity", value: `${cur.relative_humidity_2m}%` },
            { label: "Wind", value: `${Math.round(cur.windspeed_10m)} km/h` },
            { label: "Rain chance", value: `${cur.precipitation_probability ?? daily.precipitation_probability_max?.[0] ?? "—"}%` },
            sunrise && { label: "Sunrise", value: sunrise },
            sunset && { label: "Sunset", value: sunset },
          ].filter(Boolean).map((item, i) => (
            <div key={i} style={{ flex: "1 1 80px", padding: "8px 10px", borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)", textAlign: "center" }}>
              <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── TODAY SCREEN ─────────────────────────────────────────────────────────────
function SuggestedTaskRow({ task, isDone, onToggle, color = "var(--sage)" }) {
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(null);
  const toggling = useRef(false);
  const THRESHOLD = 72;

  const handleTouchStart = (e) => { startX.current = e.touches[0].clientX; setSwiping(true); };
  const handleTouchMove = (e) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    setSwipeX(Math.max(-10, Math.min(80, dx))); // right only
  };
  const handleTouchEnd = () => {
    if (swipeX >= THRESHOLD) { onToggle(); }
    setSwipeX(0); setSwiping(false); startX.current = null;
  };

  const progress = Math.min(swipeX / THRESHOLD, 1);

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 12, marginBottom: 3 }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: 12,
        background: `rgba(124,158,138,${progress * 0.25})`,
        display: "flex", alignItems: "center", padding: "0 18px", pointerEvents: "none",
      }}>
        {swipeX > 20 && <span style={{ fontSize: 11, color: "var(--sage)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.18em", opacity: progress }}>✓ done</span>}
      </div>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          if (Math.abs(swipeX) < 5 && !toggling.current) {
            toggling.current = true; onToggle();
            setTimeout(() => { toggling.current = false; }, 500);
          }
        }}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12,
          background: isDone ? "transparent" : "var(--surface)",
          border: `1px solid ${isDone ? "transparent" : "var(--border)"}`,
          boxShadow: isDone ? "none" : "0 1px 4px rgba(28,26,24,0.04)",
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? "none" : "all 0.28s cubic-bezier(0.32,0,0.24,1)",
          userSelect: "none", cursor: "pointer",
        }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: isDone ? "var(--border)" : color, transition: "all 0.18s" }} />
        <span style={{ fontSize: 14, color: isDone ? "var(--muted2)" : "var(--text)", textDecoration: isDone ? "line-through" : "none", flex: 1, transition: "all 0.18s" }}>{task.text}</span>
      </div>
    </div>
  );
}

function SuggestedTasks() {
  const [tasks, setTasks] = useState([]);
  const [done, setDone] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const dow = today.getDay(); // 0=Sun ... 6=Sat

  // ISO week key — resets on Monday midnight
  const weekKey = (() => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
  })();

  useEffect(() => {
    const load = async () => {
      // Load ALL tasks for the week, filter client-side
      const [{ data: t }, { data: c }] = await Promise.all([
        sb.from("suggested_tasks").select("*").order("day_of_week").order("sort_order"),
        sb.from("suggested_completions").select("task_id").eq("week_key", weekKey),
      ]);
      const completedIds = new Set((c || []).map(r => r.task_id));

      // Days of week in order Mon=1 through Sun=0
      // Convert to a "day index" where Mon=0, Tue=1 ... Sun=6
      const toIdx = d => d === 0 ? 6 : d - 1;
      const todayIdx = toIdx(dow);

      const visible = (t || []).filter(task => {
        const taskIdx = toIdx(task.day_of_week);
        if (taskIdx === todayIdx) return true; // always show today's
        if (taskIdx < todayIdx && !completedIds.has(task.id)) return true; // undone from earlier this week
        return false;
      });

      setTasks(visible);
      setDone(completedIds);
      setLoading(false);
    };
    load();
  }, []);

  const toggle = async (taskId) => {
    haptic(8);
    if (done.has(taskId)) {
      await sb.from("suggested_completions").delete().eq("task_id", taskId).eq("week_key", weekKey);
      setDone(s => { const n = new Set(s); n.delete(taskId); return n; });
    } else {
      await sb.from("suggested_completions").upsert({ task_id: taskId, week_key: weekKey });
      setDone(s => new Set([...s, taskId]));
    }
  };

  if (loading || tasks.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--sage)", textTransform: "uppercase", letterSpacing: "0.22em" }}>Suggested</span>
        <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted2)" }}>{tasks.filter(t => done.has(t.id)).length}/{tasks.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {tasks.map(t => (
          <SuggestedTaskRow key={t.id} task={t} isDone={done.has(t.id)} onToggle={() => toggle(t.id)} />
        ))}
      </div>
    </div>
  );
}

function TodayMeetingAgenda() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    sb.from("josh_meeting_items").select("*").eq("done", false).order("created_at")
      .then(({ data }) => setItems(data || []));
  }, []);

  const tick = async (item) => {
    haptic(8);
    await sb.from("josh_meeting_items").update({ done: true }).eq("id", item.id);
    await sb.from("history_items").insert({ text: item.text, notes: item.notes || "", source: "josh_meeting" });
    setItems(is => is.filter(i => i.id !== item.id));
  };

  return (
    <div style={{ marginBottom: 16, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(28,26,24,0.04)" }}>
      <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid var(--surface2)", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--josh)" }} />
        <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--josh)", textTransform: "uppercase", letterSpacing: "0.22em" }}>Alba & Josh Weekly</span>
      </div>
      {items.length === 0
        ? <div style={{ padding: "10px 14px", fontSize: 11, color: "var(--muted2)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.18em" }}>Nothing off—loaded yet.</div>
        : items.map(item => (
          <div key={item.id}
            onClick={() => tick(item)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "1px solid var(--surface2)", cursor: "pointer", userSelect: "none" }}>
            <div style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, border: "1.5px solid var(--border)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }} />
            <span style={{ fontSize: 13, color: "var(--text)", flex: 1 }}>{item.text}</span>
          </div>
        ))
      }
    </div>
  );
}

function TodayScreen({ who }) {
  const [tasks, setTasks] = useState([]);
  const [completions, setCompletions] = useState(new Set());
  const [delegations, setDelegations] = useState(new Set()); // task_ids delegated to Josh today
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
      const [{ data: t }, { data: c }, { data: d }] = await Promise.all([
        sb.from("routine_tasks").select("*").in("type", ["morning", "evening"]).order("sort_order"),
        sb.from("routine_completions").select("task_id").eq("period_key", pKey),
        sb.from("routine_delegations").select("task_id").eq("period_key", pKey),
      ]);
      setTasks(t || []);
      setCompletions(new Set((c || []).map(r => r.task_id)));
      setDelegations(new Set((d || []).map(r => r.task_id)));
      setLoading(false);
    };
    load();

    const sub = sb.channel("today_completions")
      .on("postgres_changes", { event: "*", schema: "public", table: "routine_completions" }, () => {
        sb.from("routine_completions").select("task_id").eq("period_key", pKey).then(({ data }) => {
          setCompletions(new Set((data || []).map(r => r.task_id)));
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "routine_delegations" }, () => {
        sb.from("routine_delegations").select("task_id").eq("period_key", pKey).then(({ data }) => {
          setDelegations(new Set((data || []).map(r => r.task_id)));
        });
      })
      .subscribe();

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

  const toggleSub = async (taskId, subIndex, subKey, totalSubs) => {
    haptic(8);
    const done = completions.has(subKey);
    if (done) {
      await sb.from("routine_completions").delete().eq("task_id", subKey).eq("period_key", pKey);
      await sb.from("routine_completions").delete().eq("task_id", taskId).eq("period_key", pKey);
      setCompletions(s => { const n = new Set(s); n.delete(subKey); n.delete(taskId); return n; });
    } else {
      await sb.from("routine_completions").upsert({ task_id: subKey, period_key: pKey, completed_by: who });
      const newSet = new Set([...completions, subKey]);
      const allDone = Array.from({ length: totalSubs }, (_, i) => `${taskId}:${i}`).every(k => newSet.has(k));
      if (allDone) {
        await sb.from("routine_completions").upsert({ task_id: taskId, period_key: pKey, completed_by: who });
        newSet.add(taskId);
      }
      setCompletions(newSet);
    }
  };


  const visible = tasks.filter(t => {
    if (t.type !== tab) return false;
    if (who === "josh") return delegations.has(t.id);
    return true;
  });
  const doneCount = visible.filter(t => completions.has(t.id)).length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  const TABS = [
    { key: "morning", label: "☀ Morning", color: "var(--morning)" },
    { key: "evening", label: "☾ Evening", color: "var(--evening)" },
  ];

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "72px 20px 16px" }}>
        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 6 }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Malta" })}</div>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 40, fontWeight: 400, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Good {greeting.toLowerCase()}, {who === "alba" ? "Alba" : "Josh"}<span style={{ color: "var(--sage)" }}>.</span></div>
      </div>

      <WeatherStrip weather={weather} />

      {who === "josh" ? (
        // ── Josh view: morning + evening stacked, no tabs, no suggested, no calendar ──
        <div style={{ padding: "16px 0 0" }}>
          {["morning", "evening"].map(routineType => {
            const routineColor = routineType === "morning" ? "var(--morning)" : "var(--evening)";
            const routineTasks = tasks.filter(t => t.type === routineType && delegations.has(t.id));
            const routineDone = routineTasks.filter(t => completions.has(t.id)).length;
            return (
              <div key={routineType} style={{ marginBottom: 28 }}>
                <div style={{ padding: "0 20px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: routineColor, textTransform: "uppercase", letterSpacing: "0.22em" }}>{routineType === "morning" ? "☀ Morning" : "☾ Evening"}</span>
                    <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>{routineDone}/{routineTasks.length}</span>
                  </div>
                  <Bar done={routineDone} total={routineTasks.length} color={routineColor} />
                  {routineDone === routineTasks.length && routineTasks.length > 0 && (
                    <div style={{ marginTop: 10, padding: "10px 16px", background: `${routineColor}12`, borderRadius: 10, color: routineColor, border: `1px solid ${routineColor}22`, fontStyle: "italic", fontFamily: "'Lora', serif", fontSize: 16 }}>off—loaded.</div>
                  )}
                </div>
                {loading ? <SkeletonCard rows={3} /> : (
                  <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 2 }}>
                    {routineTasks.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--muted2)", fontFamily: "'DM Mono', monospace", padding: "8px 0" }}>Nothing assigned yet</div>
                    ) : routineTasks.map(t => (
                      <TaskRow key={t.id} text={t.text} done={completions.has(t.id)} onToggle={() => toggle(t.id)} color={routineColor} sub={t.sub_items} taskId={t.id} subCompletions={completions} onSubToggle={toggleSub} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {meetingIsToday && <div style={{ padding: "0 20px" }}><TodayMeetingAgenda /></div>}
        </div>
      ) : (
        // ── Alba view: tabs + full today ──
        <>
          <div style={{ padding: "0 20px 0", borderBottom: "1px solid var(--border)", display: "flex", gap: 0, marginBottom: 0 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: "11px 4px 10px", background: "none", border: "none", outline: "none",
                color: tab === t.key ? "var(--text)" : "var(--muted2)",
                fontSize: 13, fontWeight: tab === t.key ? 500 : 400,
                position: "relative", transition: "color 0.18s",
                borderBottom: `2px solid ${tab === t.key ? t.color : "transparent"}`,
                marginBottom: "-1px",
              }}>{t.label}</button>
            ))}
          </div>
          <div style={{ height: 16 }} />

          {(tab === "morning" || tab === "evening") && (<>
            <div style={{ padding: "0 20px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color, textTransform: "uppercase", letterSpacing: "0.22em" }}>{tab === "morning" ? "Morning Routine" : "Evening Shutdown"}</span>
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>{doneCount}/{visible.length}</span>
              </div>
              <Bar done={doneCount} total={visible.length} color={color} />
              {doneCount === visible.length && visible.length > 0 && (
                <div style={{ marginTop: 10, padding: "10px 16px", background: `${color}12`, borderRadius: 10, color, border: `1px solid ${color}22`, fontStyle: "italic", fontFamily: "'Lora', serif", fontSize: 16 }}>off—loaded.</div>
              )}
            </div>
            {loading ? <SkeletonCard rows={3} /> : (
              <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 2 }}>
                {visible.map(t => (
                  <div key={t.id} style={{ position: "relative" }}>
                    <TaskRow text={t.text} done={completions.has(t.id)} onToggle={() => toggle(t.id)} color={color} sub={t.sub_items} taskId={t.id} subCompletions={completions} onSubToggle={toggleSub} />
                    {!completions.has(t.id) && (
                      <button onClick={async () => {
                        const isAssigned = delegations.has(t.id);
                        if (isAssigned) {
                          await sb.from("routine_delegations").delete().eq("task_id", t.id).eq("period_key", pKey);
                          setDelegations(s => { const n = new Set(s); n.delete(t.id); return n; });
                        } else {
                          await sb.from("routine_delegations").upsert({ task_id: t.id, period_key: pKey });
                          setDelegations(s => new Set([...s, t.id]));
                          notifyJosh(t.text);
                        }
                      }} style={{
                        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                        background: delegations.has(t.id) ? "var(--josh)" : "var(--surface2)",
                        border: "none", borderRadius: 999, padding: "3px 9px",
                        fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.18em",
                        color: delegations.has(t.id) ? "#fff" : "var(--muted)",
                        cursor: "pointer", transition: "all 0.18s", zIndex: 2,
                      }}>
                        {delegations.has(t.id) ? "J ✓" : "→J"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>)}

          <div style={{ padding: "28px 20px 0" }}>
            {meetingIsToday && <TodayMeetingAgenda />}
            {who === "alba" && !plansLoading && todayPlans.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--planning)", textTransform: "uppercase", letterSpacing: "0.22em", fontWeight: 400 }}>Due Today</span>
                  <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted2)" }}>{todayPlans.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {todayPlans.map(t => (
                    <EditableTaskRow key={t.id} task={t}
                      onToggle={async () => {
                        await sb.from("next_actions").update({ done: true }).eq("id", t.id);
                        await sb.from("history_items").insert({ text: t.text, notes: t.notes || "", source: "next_action" });
                        setTodayPlans(ps => ps.filter(p => p.id !== t.id));
                      }}
                      onSave={async (task, newText, newContext, newDate, newNotes) => {
                        const { error } = await sb.from("next_actions").update({ text: newText, notes: newNotes || "", context: newContext, due_date: newDate || null }).eq("id", task.id);
                        if (!error) setTodayPlans(ps => ps.map(p => p.id === task.id ? { ...p, text: newText, notes: newNotes || "", context: newContext, due_date: newDate || null } : p));
                      }}
                      onDelete={async (id) => {
                        await sb.from("next_actions").delete().eq("id", id);
                        setTodayPlans(ps => ps.filter(p => p.id !== id));
                      }}
                      color="var(--planning)"
                      badge={t.context || null}
                    />
                  ))}
                </div>
              </div>
            )}
            <SuggestedTasks />
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--planning)", textTransform: "uppercase", letterSpacing: "0.22em", fontWeight: 400 }}>Today</span>
              </div>
              <TodayCalendarTab />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── JOSH MEETING BLOCK ───────────────────────────────────────────────────────
function JoshMeetingBlock({ isWed }) {
  const [items, setItems] = useState([]);
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

  const todayISO = new Date().toISOString().split("T")[0];
  const meetingIsToday = meetingDate === todayISO;

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
      <div style={{ borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 1px 4px rgba(28,26,24,0.04)", overflow: "hidden" }}>

        {/* Header — date is prominent, edit is subtle */}
        <div style={{ padding: "14px 14px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--surface2)", background: "var(--surface2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 16, fontWeight: 400, color: "var(--text)", letterSpacing: "-0.01em" }}>{dateLabel}</div>
            {meetingIsToday && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: "var(--josh)", color: "#fff", fontFamily: "'DM Mono', monospace", letterSpacing: "0.18em" }}>Today</span>}
          </div>
          <button onClick={() => setEditingDate(true)}
            style={{ background: "none", border: "none", color: "var(--muted2)", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.18em", padding: 0 }}>
            edit
          </button>
        </div>

        {/* Agenda items — flat, no accordion */}
        {loading ? <SkeletonCard rows={3} /> : (
          <div>
            {items.map(item => (
              <div key={item.id}
                onClick={() => { haptic(8); tickItem(item); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--surface2)", cursor: "pointer", userSelect: "none" }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                  border: "1.5px solid var(--border)",
                  background: "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, color: "var(--text)" }}>{item.text}</span>
                  {item.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{item.notes}</div>}
                </div>
              </div>
            ))}
            {items.length === 0 && !adding && (
              <div style={{ padding: "12px 14px", fontSize: 11, color: "var(--muted2)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.18em" }}>Nothing off—loaded yet.</div>
            )}
            {adding && (
              <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid var(--surface2)" }}>
                <input autoFocus value={newText} onChange={e => setNewText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAdding(false); }}
                  placeholder="What to discuss…"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 16, outline: "none", width: "100%" }}
                />
                <input value={newNotes} onChange={e => setNewNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 16, outline: "none", width: "100%" }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={addItem} style={{ flex: 1, padding: "8px", background: "var(--sage)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Add</button>
                  <button onClick={() => { setAdding(false); setNewText(""); setNewNotes(""); }} style={{ padding: "8px 12px", background: "var(--surface2)", border: "none", borderRadius: 10, color: "var(--muted)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            )}
            {!adding && (
              <button onClick={() => setAdding(true)} style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", color: "var(--josh)", fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "0.18em", cursor: "pointer", textAlign: "left" }}>+ load it in</button>
            )}
          </div>
        )}
      </div>

      {/* Date picker modal */}
      {editingDate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(28,26,24,0.5)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}
          onClick={() => setEditingDate(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: "var(--bg)", borderRadius: 20, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 20, fontWeight: 400, color: "var(--text)" }}>Schedule meeting</div>
              <button onClick={() => setEditingDate(false)} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>
            <input
              type="text"
              value={meetingDate || ""}
              onChange={e => setMeetingDate(e.target.value)}
              placeholder="YYYY-MM-DD"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 14px", color: "var(--text)", fontSize: 16, outline: "none", width: "100%" }}
            />
            <button onClick={() => saveDate(meetingDate)}
              style={{ padding: "13px", background: "var(--sage)", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
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
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "72px 20px 18px" }}>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 40, fontWeight: 400, color: "var(--text)", marginBottom: 4, letterSpacing: "-0.02em" }}>This Week<span style={{ color: "var(--sage)" }}>.</span></div>
      </div>

      {loading ? <SkeletonCard rows={3} /> : <>
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
                <div key={room.id} style={{ borderRadius: 12, overflow: "hidden", border: `1px solid var(--border)`, background: "var(--surface)", boxShadow: "0 1px 4px rgba(28,26,24,0.04)" }}>
                  {/* Header — tap to expand/collapse only, not to complete */}
                  <button onClick={() => setOpenRoom(isOpen ? null : room.id)} style={{ width: "100%", padding: "13px 15px", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", color: allDone ? "var(--muted2)" : "var(--text)", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: allDone ? "var(--border)" : "var(--chores)", flexShrink: 0, transition: "all 0.18s" }} />
                      <span style={{ fontSize: 14, textAlign: "left", textDecoration: allDone ? "line-through" : "none", color: allDone ? "var(--muted2)" : "var(--text)", transition: "all 0.18s" }}>{room.label}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>{done}/{rts.length}</span>
                      <span style={{ fontSize: 10, color: "var(--muted)", transform: isOpen ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{ borderTop: "1px solid var(--border)", padding: "8px 14px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
                      {rts.map(t => {
                        const subDone = completions.has(t.id);
                        return (
                          <div key={t.id}
                            onClick={() => {
                              haptic(8);
                              toggle(t.id).then(() => {
                                // Auto-complete parent if all sub-tasks done
                                // (handled in toggle via checking siblings)
                              });
                            }}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: subDone ? "var(--surface2)" : "var(--surface)", border: "1px solid var(--border)", cursor: "pointer", userSelect: "none", transition: "all 0.15s" }}>
                            <div style={{
                              width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                              border: `1.5px solid ${subDone ? "var(--chores)" : "var(--border)"}`,
                              background: subDone ? "var(--chores)" : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "all 0.15s",
                            }}>
                              {subDone && <svg width="9" height="9" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </div>
                            <span style={{ fontSize: 13, color: subDone ? "var(--muted2)" : "var(--text)", textDecoration: subDone ? "line-through" : "none", flex: 1, transition: "all 0.15s" }}>{t.text}</span>
                          </div>
                        );
                      })}
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
  const [completing, setCompleting] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(null);
  const THRESHOLD = 72;

  useEffect(() => { setEditContext(task.context || "phone"); }, [task.context]);
  useEffect(() => { setEditText(task.text); }, [task.text]);

  const save = () => {
    if (editText.trim()) onSave(task, editText.trim(), editContext, editDate, editNotes.trim());
    setEditing(false);
  };

  const complete = () => {
    if (completing) return;
    haptic(8);
    setCompleting(true);
    setTimeout(() => onToggle && onToggle(), 600);
  };

  const handleTouchStart = (e) => { startX.current = e.touches[0].clientX; setSwiping(true); };
  const handleTouchMove = (e) => {
    if (startX.current === null) return;
    setSwipeX(Math.max(-80, Math.min(80, e.touches[0].clientX - startX.current)));
  };
  const handleTouchEnd = () => {
    if (swipeX >= THRESHOLD) complete();
    else if (swipeX <= -THRESHOLD) { haptic([8, 50, 8]); onDelete && onDelete(task.id); }
    setSwipeX(0); setSwiping(false); startX.current = null;
  };
  const sp = Math.abs(swipeX) / THRESHOLD;
  const ctxEmoji = badge === "phone" ? "📱" : badge === "errand" ? "🚗" : badge === "home" ? "🏠" : null;

  if (editing) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: "var(--surface)", borderRadius: 12, border: `1px solid ${color}44`, marginBottom: 3, boxShadow: "0 2px 8px rgba(28,26,24,0.06)" }}>
      <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 11px", color: "var(--text)", fontSize: 16, outline: "none" }}
      />
      <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
        placeholder="Notes — optional" rows={3}
        style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 11px", color: "var(--text)", fontSize: 16, outline: "none", resize: "vertical", lineHeight: 1.45 }}
      />
      <div style={{ display: "flex", gap: 5 }}>
        {[["phone","📱"],["errand","🚗"],["home","🏠"]].map(([k,l]) => (
          <button key={k} onClick={() => setEditContext(k)} style={{
            flex: 1, padding: "6px", borderRadius: 10, border: "none", fontSize: 13,
            background: editContext === k ? color : "var(--surface2)",
            color: editContext === k ? "#fff" : "var(--muted)", cursor: "pointer",
          }}>{l}</button>
        ))}
      </div>
      <input
        type="date"
        value={editDate}
        onChange={e => setEditDate(e.target.value)}
        style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 11px", color: editDate ? "var(--text)" : "var(--muted2)", fontSize: 16, outline: "none", width: "100%" }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={save} style={{ flex: 1, padding: "7px", background: color, border: "none", borderRadius: 10, color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Save</button>
        <button onClick={() => setEditing(false)} style={{ padding: "7px 12px", background: "var(--surface2)", border: "none", borderRadius: 10, color: "var(--muted)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
        <button onClick={() => onDelete && onDelete(task.id)} style={{ padding: "7px 12px", background: "none", border: "none", color: "var(--danger)", fontSize: 12, cursor: "pointer" }}>Delete</button>
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: 3, position: "relative", overflow: "hidden", borderRadius: 12, opacity: completing ? 0 : 1, transition: completing ? "opacity 0.4s 0.2s ease" : "none" }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: 12,
        background: swipeX < -20 ? `rgba(196,74,74,${Math.min(sp*0.3,0.25)})` : swipeX > 20 ? `rgba(124,158,138,${Math.min(sp*0.3,0.25)})` : "transparent",
        display: "flex", alignItems: "center",
        justifyContent: swipeX < -20 ? "flex-end" : "flex-start",
        padding: "0 18px", pointerEvents: "none",
      }}>
        {swipeX > 20 && <span style={{ fontSize: 11, color: "var(--sage)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.18em", opacity: Math.min(sp,1) }}>✓ done</span>}
        {swipeX < -20 && <span style={{ fontSize: 11, color: "var(--danger)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.18em", opacity: Math.min(sp,1) }}>delete</span>}
      </div>
      <div
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderRadius: 12,
          background: completing ? "transparent" : "var(--surface)",
          border: `1px solid ${completing ? "transparent" : task.overdue ? "#C44A4A22" : "var(--border)"}`,
          boxShadow: completing ? "none" : "0 1px 4px rgba(28,26,24,0.04)",
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? "none" : "all 0.28s cubic-bezier(0.32,0,0.24,1)",
          userSelect: "none",
        }}>
        {ctxEmoji && <span style={{ fontSize: 11, width: 18, textAlign: "center", flexShrink: 0 }}>{ctxEmoji}</span>}
        <div onClick={complete} style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: completing ? "var(--border)" : color, opacity: 0.7, cursor: "pointer", transition: "all 0.18s" }} />
        <div style={{ flex: 1 }} onClick={() => !completing && setEditing(true)}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: completing ? "var(--muted2)" : "var(--text)", textDecoration: completing ? "line-through" : "none", transition: "all 0.2s" }}>{task.text}</span>
            {task.overdue && !completing && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: "#C44A4A15", color: "var(--danger)", fontFamily: "'DM Mono', monospace" }}>overdue {task.due_date}</span>}
            {task.due_date && !task.overdue && !completing && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: "var(--surface2)", color: "var(--muted2)", fontFamily: "'DM Mono', monospace" }}>{task.due_date}</span>}
          </div>
          {task.notes && !completing && <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginTop: 4, whiteSpace: "pre-wrap" }}>{task.notes}</div>}
        </div>
        {!completing && <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: "var(--muted2)", fontSize: 12, padding: "0 2px", cursor: "pointer" }}>✎</button>}
      </div>
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
  const isDesktop = window.innerWidth >= 768;

  const load = useCallback(async () => {
    const [{ data: t, error: te }, { data: w }] = await Promise.all([
      sb.from("next_actions").select("*").eq("done", false).order("created_at"),
      sb.from("waiting_for").select("*").order("created_at"),
    ]);
    if (te) console.error("next_actions load error:", te.message);
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
    await sb.from("next_actions").update({ done: true }).eq("id", task.id);
    const historyNotes = [task.notes, task.due_date ? `Due: ${task.due_date}` : ""].filter(Boolean).join("\n\n");
    await sb.from("history_items").insert({ text: task.text, notes: historyNotes, source: "next_action" });
    setTasks(ts => ts.filter(t => t.id !== task.id));
  };

  const saveTask = async (task, newText, newContext, newDate, newNotes) => {
    const { error } = await sb.from("next_actions").update({ text: newText, notes: newNotes || "", context: newContext, due_date: newDate || null }).eq("id", task.id);
    if (error) { console.error("saveTask error:", error.message); return; }
    // Update local state immediately for instant feedback
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
  const active = filtered;
  const done = [];

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
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "72px 20px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 40, fontWeight: 400, color: "var(--text)", marginBottom: 4, letterSpacing: "-0.02em" }}>Next Actions<span style={{ color: "var(--sage)" }}>.</span></div>

        </div>
        {isDesktop && (
          <div style={{ display: "flex", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            {[["list","List"],["schedule","Scheduler"]].map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: "7px 14px", border: "none",
                background: viewMode === mode ? "var(--text)" : "transparent",
                color: viewMode === mode ? "var(--bg)" : "var(--muted)",
                fontSize: 12, cursor: "pointer", fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.18em", transition: "all 0.18s",
              }}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {/* Schedule view — desktop only */}
      {isDesktop && viewMode === "schedule" && (
        <div style={{ padding: "0 20px" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {/* Unscheduled tasks */}
            <div style={{ width: 200, flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: 10 }}>Unscheduled · {unscheduled.length}</div>
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
                      boxShadow: "0 1px 4px rgba(28,26,24,0.04)",
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10 }}>{t.context === "phone" ? "📱" : t.context === "errand" ? "🚗" : t.context === "home" ? "🏠" : null}</span>
                      <span style={{ lineHeight: 1.3 }}>{t.text}</span>
                    </div>
                    {t.notes && <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.4, marginTop: 4, whiteSpace: "pre-wrap" }}>{t.notes}</div>}
                  </div>
                ))}
                {unscheduled.length === 0 && <div style={{ fontSize: 12, color: "var(--muted2)", fontFamily: "'DM Mono', monospace" }}>All scheduled</div>}
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
                      borderRadius: 12, border: `1.5px solid ${isDrop ? "var(--sage)" : isToday ? "var(--morning)44" : "var(--border)"}`,
                      background: isDrop ? "var(--sage)08" : isToday ? "var(--morning)05" : "var(--surface)",
                      padding: "10px 12px", minHeight: 60, transition: "all 0.15s",
                    }}>
                    <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: isToday ? "var(--morning)" : "var(--muted)", textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: dayTasks.length ? 8 : 0 }}>
                      {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                      {isToday && <span style={{ marginLeft: 6, fontSize: 8, padding: "1px 5px", borderRadius: 10, background: "var(--morning)", color: "#fff" }}>today</span>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {dayTasks.map(t => (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 10, background: "var(--surface2)", fontSize: 11, color: "var(--text)" }}>
                          <span>{t.context === "phone" ? "📱" : t.context === "errand" ? "🚗" : t.context === "home" ? "🏠" : null}</span>
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
            background: context === c.key ? "var(--sage)" : "var(--surface)",
            border: `1px solid ${context === c.key ? "transparent" : "var(--border)"}`,
            color: context === c.key ? "#fff" : "var(--muted)",
            fontSize: 11, fontWeight: context === c.key ? 500 : 400,
            transition: "all 0.18s",
          }}>{c.label}</button>
        ))}
      </div>



      {loading ? <SkeletonCard rows={3} /> : (
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 2 }}>
          {active.map(t => (
            <EditableTaskRow key={t.id} task={t} onToggle={() => toggle(t)} onSave={saveTask} onDelete={deleteTask}
              color="var(--sage)"
              badge={context === "all" && t.context ? t.context : null}
            />
          ))}
        </div>
      )}

      <div style={{ padding: "12px 20px 0" }}>
        {!adding ? (
          <button onClick={() => setAdding(true)} style={{ width: "100%", padding: "10px", background: "none", border: "1.5px dashed var(--border)", borderRadius: 10, color: "var(--muted)", fontSize: 13 }}>+ load it in</button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--surface)", borderRadius: 14, padding: 16, border: "1px solid var(--border)", boxShadow: "0 2px 12px rgba(28,26,24,0.06)" }}>
            <input autoFocus value={newText} onChange={e => setNewText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addTask(); if (e.key === "Escape") setAdding(false); }}
              placeholder="What needs doing?"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 16, outline: "none" }}
            />
            <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)}
              placeholder="Notes — optional"
              rows={3}
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", color: "var(--text)", fontSize: 16, outline: "none", resize: "vertical", lineHeight: 1.45 }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              {[["phone","📱 Phone"],["errand","🚗 Errand"],["home","🏠 Home"]].map(([k,l]) => (
                <button key={k} onClick={() => setNewContext(k)} style={{
                  flex: 1, padding: "7px 4px", borderRadius: 10, border: "none",
                  background: newContext === k ? "var(--sage)" : "var(--surface2)",
                  color: newContext === k ? "#fff" : "var(--muted)", fontSize: 12,
                }}>{l}</button>
              ))}
            </div>
            <input value={newDate} onChange={e => setNewDate(e.target.value)}
              placeholder="Due date (DD/MM/YYYY) — optional"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", color: "var(--text)", fontSize: 16, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addTask} style={{ flex: 1, padding: "9px", background: "var(--sage)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 500 }}>Add</button>
              <button onClick={() => setAdding(false)} style={{ padding: "9px 16px", background: "var(--surface2)", border: "none", borderRadius: 10, color: "var(--muted)", fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>



      <div style={{ padding: "24px 20px 0" }}>
        <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.22em" }}>Waiting For</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {waiting.map(w => (
            <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(28,26,24,0.04)" }}>
              <div onClick={() => tickWF(w)} style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: "var(--sage)", opacity: 0.7, cursor: "pointer" }} />
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
                style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px", color: "var(--text)", fontSize: 16, outline: "none" }}
              />
              <button onClick={addWF} style={{ padding: "9px 14px", background: "var(--sage)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13 }}>Add</button>
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
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "72px 20px 18px" }}>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 40, fontWeight: 400, color: "var(--text)", marginBottom: 4, letterSpacing: "-0.02em" }}>This Month<span style={{ color: "var(--sage)" }}>.</span></div>
      </div>

      {/* Monthly recurring tasks */}
      {loading ? <SkeletonCard rows={3} /> : (
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
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--planning)", textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: 10 }}>From Plan</div>
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
                      style={{ padding: "5px 10px", borderRadius: 7, background: "var(--sage)15", border: `1px solid var(--sage)44`, color: "var(--sage)", fontSize: 11, fontFamily: "'DM Mono', monospace" }}
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
  const [selectedMonth, setSelectedMonth] = useState(null); // "MM/YYYY"
  const [editingEvent, setEditingEvent] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMonth, setAddMonth] = useState("");
  const eventPanelRef = useRef(null);

  const load = useCallback(async () => {
    const { data } = await sb.from("planning_events").select("*").order("trigger_month");
    setEvents(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const sub = sb.channel("plan_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "planning_events" }, load)
      .subscribe();
    return () => sb.removeChannel(sub);
  }, [load]);

  const parseDate = (s) => {
    if (!s) return null;
    if (s.includes("/")) {
      const p = s.split("/");
      if (p.length === 3) return new Date(`${p[2]}-${p[1]}-${p[0]}`);
      if (p.length === 2) return new Date(`${p[1]}-${p[0]}-01`); // MM/YYYY
    }
    return new Date(s);
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // Build 2-year grid starting from Jan of current year
  const years = [currentYear, currentYear + 1];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Group events by trigger_month "MM/YYYY"
  const eventsByMonth = {};
  events.forEach(e => {
    const key = e.trigger_month || "";
    if (!eventsByMonth[key]) eventsByMonth[key] = [];
    eventsByMonth[key].push(e);
  });

  const monthKey = (year, monthIdx) => `${String(monthIdx + 1).padStart(2, "0")}/${year}`;
  const isPast = (year, monthIdx) => year < currentYear || (year === currentYear && monthIdx < currentMonth);
  const isCurrent = (year, monthIdx) => year === currentYear && monthIdx === currentMonth;

  const selectedEvents = selectedMonth ? (eventsByMonth[selectedMonth] || []) : [];

  const saveEvent = async (ev) => {
    if (!ev.text?.trim()) { alert("Please enter an event name."); return; }
    if (!ev.trigger_month?.trim()) { alert("Please enter a month (MM/YYYY)."); return; }
    try {
      if (ev.id) {
        const { error } = await sb.from("planning_events").update({ text: ev.text.trim(), trigger_month: ev.trigger_month.trim(), notes: ev.notes || "", recurring: ev.recurring || false }).eq("id", ev.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("planning_events").insert({ text: ev.text.trim(), trigger_month: ev.trigger_month.trim(), notes: ev.notes || "", recurring: ev.recurring || false });
        if (error) throw error;
      }
      await load();
      setEditingEvent(null);
      setShowAddModal(false);
    } catch (e) {
      console.error("saveEvent error:", e.message, e);
      alert(`Could not save: ${e.message}`);
    }
  };

  const deleteEvent = async (id) => {
    await sb.from("planning_events").delete().eq("id", id);
    await load();
    setEditingEvent(null);
  };

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "72px 20px 20px" }}>
        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 8 }}>
          {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </div>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 40, fontWeight: 400, color: "var(--text)", letterSpacing: "-0.02em" }}>
          Plan<span style={{ color: "var(--sage)" }}>.</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted2)", fontFamily: "'DM Mono', monospace", marginTop: 4 }}>Tap a month to see events</div>
      </div>

      {/* Event panel — shown immediately below header when a month is selected */}
      {selectedMonth && (
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 2px 12px rgba(28,26,24,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--sage)", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.22em" }}>
                {months[parseInt(selectedMonth.split("/")[0]) - 1]} {selectedMonth.split("/")[1]}
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button onClick={() => { setAddMonth(selectedMonth); setShowAddModal(true); }} style={{ background: "none", border: "none", color: "var(--sage)", fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>+ Add event</button>
                <button onClick={() => setSelectedMonth(null)} style={{ background: "none", border: "none", color: "var(--muted2)", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>×</button>
              </div>
            </div>
            {selectedEvents.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted2)", textAlign: "center", padding: "8px 0", fontFamily: "'DM Mono', monospace" }}>No events — add one above.</div>
            ) : selectedEvents.map(ev => (
              <div key={ev.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                      {ev.text}
                      {ev.recurring && (
                        <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10, border: "1px solid var(--border)", color: "var(--muted2)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.18em" }}>↻ annual</span>
                      )}
                    </div>
                    {ev.notes && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{ev.notes}</div>}
                  </div>
                  <button onClick={() => setEditingEvent(ev)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "0 0 0 8px" }}>✏️</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <SkeletonCard rows={3} /> : (
        <div style={{ padding: "0 16px" }}>
          {years.map(year => (
            <div key={year} style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 10, paddingLeft: 2 }}>{year}</div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 6,
                width: "100%",
              }}>
                {months.map((mon, mi) => {
                  const key = monthKey(year, mi);
                  const past = isPast(year, mi);
                  const current = isCurrent(year, mi);
                  const evs = eventsByMonth[key] || [];
                  const isSelected = selectedMonth === key;
                  return (
                    <div key={key}
                      onClick={() => {
                        setSelectedMonth(isSelected ? null : key);
                      }}
                      style={{
                        borderRadius: 12, padding: "10px 10px",
                        background: isSelected ? "var(--sage)" : "var(--surface)",
                        border: `1px solid ${isSelected ? "transparent" : current ? "var(--sage)" : "var(--border)"}`,
                        opacity: past ? 0.38 : 1,
                        cursor: past ? "default" : "pointer",
                        minHeight: 72,
                        overflow: "hidden",
                        transition: "all 0.18s",
                        boxShadow: current && !isSelected ? "0 0 0 1.5px var(--sage)44" : "none",
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: isSelected || current ? 500 : 400, fontFamily: "'Outfit', system-ui, sans-serif", color: isSelected ? "#fff" : "var(--text)", marginBottom: 4 }}>{mon}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {evs.slice(0, 2).map((e, i) => (
                          <div key={i} style={{ fontSize: 10, color: isSelected ? "rgba(255,255,255,0.85)" : "var(--planning)", fontFamily: "'DM Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.5 }}>
                            {e.text.replace(/^Plan /, "")}
                          </div>
                        ))}
                        {evs.length > 2 && (
                          <div style={{ fontSize: 10, color: isSelected ? "rgba(255,255,255,0.6)" : "var(--muted2)", fontFamily: "'DM Mono', monospace" }}>+{evs.length - 2}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Global add button */}
          <button onClick={() => { setAddMonth(""); setShowAddModal(true); }} style={{
            width: "100%", padding: "12px", background: "none",
            border: "1.5px dashed var(--border)", borderRadius: 12,
            color: "var(--muted)", fontSize: 13, fontFamily: "'Outfit', system-ui, sans-serif", cursor: "pointer",
          }}>+ Add event</button>
        </div>
      )}

      {/* Edit/Add modal */}
      {(editingEvent || showAddModal) && (
        <PlanEventModal
          event={editingEvent || { text: "", trigger_month: addMonth, notes: "", recurring: false }}
          onSave={saveEvent}
          onDelete={editingEvent ? () => deleteEvent(editingEvent.id) : null}
          onClose={() => { setEditingEvent(null); setShowAddModal(false); }}
        />
      )}
    </div>
  );
}

function PlanEventModal({ event, onSave, onDelete, onClose }) {
  const [text, setText] = useState(event.text || "");
  const [month, setMonth] = useState(event.trigger_month || "");
  const [notes, setNotes] = useState(event.notes || "");
  const [recurring, setRecurring] = useState(event.recurring || false);


  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,26,24,0.5)", zIndex: 500, overflowY: "auto" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        position: "relative",
        margin: "60px auto 40px",
        width: "calc(100% - 40px)",
        maxWidth: 480,
        background: "var(--bg)", borderRadius: 20,
        padding: "24px 20px 28px", display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 20, fontWeight: 400, color: "var(--text)" }}>
            {event.id ? "Edit event" : "Add event"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Event name"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "13px 14px", color: "var(--text)", fontSize: 16, outline: "none", width: "100%" }}
        />
        <input
          type="text"
          value={month}
          onChange={e => setMonth(e.target.value)}
          placeholder="Month (MM/YYYY e.g. 09/2026)"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "13px 14px", color: "var(--text)", fontSize: 16, outline: "none", width: "100%" }}
        />
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={3}
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "13px 14px", color: "var(--text)", fontSize: 16, outline: "none", width: "100%", resize: "none", fontFamily: "'Outfit', sans-serif" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", cursor: "pointer" }}
          onClick={() => setRecurring(r => !r)}>
          <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${recurring ? "var(--sage)" : "var(--border)"}`, background: recurring ? "var(--sage)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.18s" }}>
            {recurring && <svg width={11} height={11} viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </div>
          <span style={{ fontSize: 14, color: "var(--text)" }}>Recurring annually</span>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={() => onSave({ ...event, text, trigger_month: month, notes, recurring })} style={{
            flex: 1, padding: "14px", background: "var(--sage)", border: "none", borderRadius: 14, color: "#fff", fontSize: 15, fontWeight: 500, cursor: "pointer",
          }}>Save</button>
          {onDelete && (
            <button onClick={onDelete} style={{ padding: "14px 20px", background: "none", border: "none", color: "var(--danger)", fontSize: 15, cursor: "pointer" }}>Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}


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
  const sourceColor = (s) => s === "next_action" ? "var(--sage)" : s === "waiting_for" ? "var(--planning)" : "var(--josh)";

  const filtered = filter === "all" ? items : items.filter(i => i.source === filter);

  return (
    <div style={{ padding: "0 20px 40px" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["all","All"],["next_action","Tasks"],["waiting_for","Waiting"],["josh_meeting","Meeting"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            flex: 1, padding: "7px 2px", borderRadius: 20, border: `1px solid ${filter === k ? "transparent" : "var(--border)"}`,
            background: filter === k ? "var(--text)" : "var(--surface)",
            color: filter === k ? "#fff" : "var(--muted)", fontSize: 10,
            fontFamily: "'DM Mono', monospace",
          }}>{l}</button>
        ))}
      </div>

      {loading ? <SkeletonCard rows={3} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.length === 0 && <div style={{ fontSize: 13, color: "var(--muted2)", textAlign: "center", padding: "20px 0" }}>Load us up.</div>}
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
      <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color, textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item, i) => (
          editingIdx === i ? (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--surface2)", borderRadius: 10, padding: 12, border: `1px solid ${color}44` }}>
              <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submitEdit(); if (e.key === "Escape") setEditingIdx(null); }}
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 11px", color: "var(--text)", fontSize: 16, outline: "none", background: "var(--surface)" }}
              />
              {extraFields && extraFields.map(f => (
                f.type === "checkbox" ? (
                  <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)" }}>
                    <div onClick={() => setEditExtra(x => ({ ...x, [f.key]: !x[f.key] }))}
                      style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${editExtra[f.key] ? color : "var(--border)"}`, background: editExtra[f.key] ? color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                      {editExtra[f.key] && <svg width="11" height="11" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="var(--ml-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span style={{ fontSize: 13, color: "var(--text)", cursor: "pointer" }} onClick={() => setEditExtra(x => ({ ...x, [f.key]: !x[f.key] }))}>{f.placeholder}</span>
                  </div>
                ) : (
                  <input key={f.key} value={editExtra[f.key] || ""} onChange={e => setEditExtra(x => ({ ...x, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 11px", color: "var(--text)", fontSize: 16, outline: "none", background: "var(--surface)" }}
                  />
                )
              ))}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={submitEdit} style={{ flex: 1, padding: "7px", background: "var(--sage)", border: "none", borderRadius: 10, color: "#fff", fontSize: 12, fontWeight: 500 }}>Save</button>
                <button onClick={() => setEditingIdx(null)} style={{ padding: "7px 12px", background: "var(--surface)", border: "none", borderRadius: 10, color: "var(--muted)", fontSize: 12 }}>Cancel</button>
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
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 11px", color: "var(--text)", fontSize: 16, outline: "none", background: "var(--surface)" }}
            />
            {extraFields && extraFields.map(f => (
              f.type === "checkbox" ? (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", background: "var(--surface2)", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <div onClick={() => setExtra(x => ({ ...x, [f.key]: !x[f.key] }))}
                    style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${extra[f.key] ? color : "var(--border)"}`, background: extra[f.key] ? color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                    {extra[f.key] && <svg width="11" height="11" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="var(--ml-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span style={{ fontSize: 13, color: "var(--text)", cursor: "pointer" }} onClick={() => setExtra(x => ({ ...x, [f.key]: !x[f.key] }))}>{f.placeholder}</span>
                </div>
              ) : (
                <input key={f.key} value={extra[f.key] || ""} onChange={e => setExtra(x => ({ ...x, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 11px", color: "var(--text)", fontSize: 16, outline: "none", background: "var(--surface)" }}
                />
              )
            ))}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={submit} style={{ flex: 1, padding: "8px", background: "var(--sage)", border: "none", borderRadius: 10, color: "#fff", fontSize: 12, fontWeight: 500 }}>Add</button>
              <button onClick={() => { setAdding(false); setText(""); setExtra({}); }} style={{ padding: "8px 12px", background: "var(--surface2)", border: "none", borderRadius: 10, color: "var(--muted)", fontSize: 12 }}>Cancel</button>
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
        sb.from("josh_meeting_items").select("*").order("sort_order"),
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
      const { data, error } = await sb.from("josh_meeting_items")
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
      await sb.from("josh_meeting_items").delete().eq("text", text);
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
      await sb.from("josh_meeting_items").update({ text }).eq("text", oldText);
      setAgenda(ag => ag.map((a, i) => i === idx ? text : a));
    }
  };

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Header */}
      <div style={{ padding: "28px 20px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={onBack} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 16, boxShadow: "0 1px 4px rgba(28,26,24,0.06)" }}>←</button>
        <div>
          <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 32, fontWeight: 500, color: "var(--text)", letterSpacing: "-0.02em" }}>Edit Lists</div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase" }}>Tap a section to expand</div>
        </div>
      </div>

      {loading ? <SkeletonCard rows={3} /> : (
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


async function fetchAllCalendars(token) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Calendar list failed: ${msg}`);
  }
  const data = await res.json();
  return data.items || [];
}

function useGoogleCalendar() {
  const [token, setToken] = useState(() => getStoredToken() || getGCalToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Case 1: returning from Google with auth code in URL query string
    if (window.location.search.includes("code=") || new URLSearchParams(window.location.search).get("code")) {
      setLoading(true);
      exchangeCodeFromURL().then(tk => {
        if (tk) {
          setGCalToken(tk);
          setToken(tk);
          localStorage.setItem("gcal_ever_connected", "1");
        } else {
          // Exchange failed — clear ever_connected so we don't loop into refresh
          localStorage.removeItem("gcal_ever_connected");
          setError("Calendar connection failed. Check console for details.");
        }
        setLoading(false);
      });
      return;
    }
    // Case 2: valid token in storage
    const stored = getStoredToken();
    if (stored) { setGCalToken(stored); setToken(stored); return; }
    // Case 3: token expired but refresh token exists in Supabase — refresh silently
    if (localStorage.getItem("gcal_ever_connected")) {
      setLoading(true);
      refreshToken().then(tk => {
        if (tk) { setToken(tk); }
        setLoading(false);
      });
    }
  }, []);

  // Auto-refresh 5 minutes before expiry
  useEffect(() => {
    if (!token) return;
    const expiry = parseInt(localStorage.getItem("gcal_expiry") || "0", 10);
    const msUntilRefresh = expiry - Date.now() - 5 * 60 * 1000;
    if (msUntilRefresh <= 0) return;
    const t = setTimeout(async () => {
      const newToken = await refreshToken();
      if (newToken) setToken(newToken);
    }, msUntilRefresh);
    return () => clearTimeout(t);
  }, [token]);

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;

  const signIn = useCallback(async () => {
    // Always use redirect flow (works on iOS PWA and desktop)
    localStorage.setItem("gcal_ever_connected", "1");
    signInWithRedirect();
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem("gcal_token");
    localStorage.removeItem("gcal_expiry");
    localStorage.removeItem("gcal_ever_connected");
    setGCalToken(null);
    setToken(null);
  }, []);

  return { token, signIn, disconnect, loading, error };
}

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

  if (loading) return <SkeletonCard rows={3} />;
  if (error) return (
    <div style={{ padding: "0 20px" }}>
      <div style={{ padding: "16px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Calendar session expired.</div>
        <button onClick={signIn} style={{ padding: "8px 20px", background: "var(--planning)", border: "none", borderRadius: 10, color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Reconnect</button>
      </div>
    </div>
  );

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
                boxShadow: "0 1px 4px rgba(28,26,24,0.04)",
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
            (data.items || []).forEach(e => allEvents.push({ ...e, calendarColor: cal.backgroundColor || "var(--morning)", calendarName: cal.summary }));
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
      <div style={{ padding: "72px 20px 18px" }}>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 34, fontWeight: 400, color: "var(--text)", marginBottom: 4 }}>Calendar<span style={{ color: "var(--sage)" }}>.</span></div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase" }}>All your calendars</div>
      </div>
      <div style={{ padding: "0 20px" }}>
        <div style={{ padding: "24px 20px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontFamily: "'Lora', serif", color: "var(--text)", marginBottom: 8 }}>Connect Google Calendar</div>
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
      <div style={{ padding: "72px 20px 12px" }}>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 34, fontWeight: 400, color: "var(--text)", marginBottom: 4 }}>Calendar<span style={{ color: "var(--sage)" }}>.</span></div>
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
              <div style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: "var(--text)", letterSpacing: "0.18em" }}>{monthLabel}</div>
              <button onClick={() => { setMonthOffset(0); setSelectedDay(today.getDate()); }} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 20, background: monthOffset === 0 ? "var(--surface2)" : "var(--morning)", border: `1px solid ${monthOffset === 0 ? "var(--border)" : "transparent"}`, color: monthOffset === 0 ? "var(--muted)" : "#fff", fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em" }}>today</button>
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
          {loading ? <SkeletonCard rows={3} /> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayEvts = eventsForDay(day);
                const isToday = today.getDate() === day && today.getMonth() === viewDate.getMonth() && today.getFullYear() === viewDate.getFullYear();
                const isSelected = selectedDay === day;
                return (
                  <button key={day} onClick={() => setSelectedDay(isSelected ? null : day)} style={{
                    aspectRatio: "1/1", borderRadius: 10, border: "none",
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
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: 10 }}>
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



// ─── THINGS TO DO SCREEN ──────────────────────────────────────────────────────
const PLACES = [
  { name: "Aquarium", type: "Activity", setting: "Indoor" },
  { name: "Playtopia", type: "Activity", setting: "Indoor" },
  { name: "Gravity at Shoreline", type: "Activity", setting: "Indoor" },
  { name: "The Eden", type: "Activity", setting: "Indoor" },
  { name: "Multimaxx Bay Street", type: "Activity", setting: "Indoor" },
  { name: "Kidz World", type: "Activity", setting: "Indoor" },
  { name: "Play Cafe", type: "Activity", setting: "Indoor" },
  { name: "Multimaxx Pavi", type: "Activity", setting: "Indoor" },
  { name: "Library", type: "Activity", setting: "Indoor" },
  { name: "Rainforest Cafe", type: "Restaurant", setting: "Indoor" },
  { name: "Trattoria Riccardo", type: "Restaurant", setting: "Indoor" },
  { name: "Festacci", type: "Restaurant", setting: "Indoor" },
  { name: "Spinola Kids Park", type: "Play Area", setting: "Indoor" },
  { name: "Ohana", type: "Play Area", setting: "Indoor" },
  { name: "L-Arka ta Noe", type: "Activity", setting: "Outdoor" },
  { name: "Blue Grotto Cave", type: "Activity", setting: "Outdoor" },
  { name: "Montekristo Animal Park", type: "Activity", setting: "Outdoor" },
  { name: "Playmobil", type: "Activity", setting: "Both" },
  { name: "Esplora", type: "Activity", setting: "Both" },
  { name: "Popeye village", type: "Activity", setting: "Both" },
  { name: "Majjistral park near Radisson", type: "Hike", setting: "Outdoor" },
  { name: "Misrah Ghar il Kbir", type: "Hike", setting: "Outdoor" },
  { name: "Fawwara", type: "Hike", setting: "Outdoor" },
  { name: "Dingli cliffs", type: "Hike", setting: "Outdoor" },
  { name: "Wied il-Għasel", type: "Hike", setting: "Outdoor" },
  { name: "Wied Qirda", type: "Hike", setting: "Outdoor" },
  { name: "Ghajn Hadid", type: "Hike", setting: "Outdoor" },
  { name: "Qannotta Valley", type: "Hike", setting: "Outdoor" },
  { name: "Bingemma punic tombs", type: "Hike", setting: "Outdoor" },
  { name: "Xemxija Heritage Trail", type: "Hike", setting: "Outdoor" },
  { name: "Ghajn Znuber Tower trail", type: "Hike", setting: "Outdoor" },
  { name: "Calpham junction", type: "Hike", setting: "Outdoor" },
  { name: "Ras id Dawwara (Sunset)", type: "Hike", setting: "Outdoor" },
  { name: "Ghadira Nature Reserve", type: "Hike", setting: "Outdoor" },
  { name: "Foresta 2000", type: "Hike", setting: "Outdoor" },
  { name: "Dwejra", type: "Hike, Picnic", setting: "Outdoor" },
  { name: "Xrobb l ghagin", type: "Hike, Picnic", setting: "Outdoor" },
  { name: "Ahrax", type: "Picnic", setting: "Outdoor" },
  { name: "Ta'Qali", type: "Picnic, Playground, Stroller walk", setting: "Outdoor" },
  { name: "San Klement", type: "Picnic, Playground, Stroller walk", setting: "Outdoor" },
  { name: "Salini park", type: "Picnic, Playground, Stroller walk", setting: "Outdoor" },
  { name: "Gnien fuq il glaziz", type: "Picnic, Playground, Stroller walk", setting: "Outdoor" },
  { name: "Chinese Garden", type: "Picnic, Stroller walk", setting: "Outdoor" },
  { name: "Buskett", type: "Picnic, Stroller walk", setting: "Outdoor" },
  { name: "Chadwick lakes", type: "Picnic, Stroller walk", setting: "Outdoor" },
  { name: "Gnien Stazzjon Attard", type: "Playground", setting: "Outdoor" },
  { name: "Lapsi", type: "Playground, Stroller walk", setting: "Outdoor" },
  { name: "Romeo Romano Gardens", type: "Playground, Stroller walk", setting: "Outdoor" },
  { name: "Sant Antnin Family Park", type: "Playground, Stroller walk", setting: "Outdoor" },
  { name: "Gnien l Gharusa tal Mosta", type: "Playground, Stroller walk", setting: "Outdoor" },
  { name: "Pembroke Playground", type: "Playground, Stroller walk", setting: "Outdoor" },
  { name: "Qui-si-Sana Playground", type: "Playground, Stroller walk", setting: "Outdoor" },
  { name: "Wied fulija", type: "Stroller walk", setting: "Outdoor" },
  { name: "Simar Nature Reserve", type: "Stroller walk", setting: "Outdoor" },
  { name: "Birgu", type: "Stroller walk", setting: "Outdoor" },
  { name: "St Thomas to il Hofra il Kbira via munxar path", type: "Stroller walk", setting: "Outdoor" },
  { name: "Mdina", type: "Stroller walk", setting: "Outdoor" },
  { name: "Il Qolla", type: "Stroller walk", setting: "Outdoor" },
];

const PLACE_TYPES = ["All", "Activity", "Hike", "Picnic", "Playground", "Play Area", "Restaurant", "Stroller walk"];

const TYPE_COLORS = {
  Activity:        "var(--morning)",
  Hike:            "var(--sage)",
  Picnic:          "var(--morning)",
  Playground:      "var(--evening)",
  "Play Area":     "var(--admin)",
  Restaurant:      "var(--danger)",
  "Stroller walk": "var(--josh)",
};

function ThingsToDoScreen() {
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setting, setSetting] = useState("All");
  const [type, setType] = useState("All");

  useEffect(() => {
    sb.from("places").select("*").order("name").then(({ data }) => {
      setPlaces(data || []);
      setLoading(false);
    });
  }, []);

  const types = ["All", ...Array.from(new Set(places.map(p => p.type).filter(Boolean))).sort()];

  const filtered = places.filter(p => {
    const settingMatch = setting === "All" || p.setting === setting || p.setting === "Both";
    const typeMatch = type === "All" || p.type === type;
    return settingMatch && typeMatch;
  });

  return (
    <div className="fade" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "72px 20px 18px" }}>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 34, fontWeight: 400, color: "var(--text)", marginBottom: 4 }}>Things To Do<span style={{ color: "var(--sage)" }}>.</span></div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase" }}>{filtered.length} places</div>
      </div>

      {/* Indoor/Outdoor toggle */}
      <div style={{ padding: "0 20px 12px", display: "flex", gap: 6 }}>
        {["All", "Indoor", "Outdoor"].map(s => (
          <button key={s} onClick={() => setSetting(s)} style={{
            flex: 1, padding: "9px 4px", borderRadius: 20,
            background: setting === s ? "var(--text)" : "var(--surface)",
            border: `1px solid ${setting === s ? "transparent" : "var(--border)"}`,
            color: setting === s ? "var(--bg)" : "var(--muted)",
            fontSize: 12, fontWeight: setting === s ? 500 : 400, transition: "all 0.18s",
          }}>{s}</button>
        ))}
      </div>

      {/* Type filter */}
      <div style={{ padding: "0 20px 16px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {types.map(t => (
          <button key={t} onClick={() => setType(t)} style={{
            padding: "6px 12px", borderRadius: 20,
            background: type === t ? (TYPE_COLORS[t] || "var(--text)") : "var(--surface)",
            border: `1px solid ${type === t ? "transparent" : "var(--border)"}`,
            color: type === t ? "#fff" : "var(--muted)",
            fontSize: 11, transition: "all 0.18s",
          }}>{t}</button>
        ))}
      </div>

      {/* Places list */}
      {loading ? <SkeletonCard rows={3} /> : (
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && (
            <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "var(--muted)" }}>No places match these filters</div>
          )}
          {filtered.map(p => (
            <div key={p.id} style={{ padding: "12px 14px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 400 }}>{p.name}</div>
                {p.type && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>{p.type}</div>}
              </div>
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, flexShrink: 0, marginLeft: 8,
                background: p.setting === "Both" ? "var(--surface2)" : p.setting === "Indoor" ? "rgba(122,106,168,0.12)" : "rgba(124,158,138,0.14)",
                color: p.setting === "Both" ? "var(--muted)" : p.setting === "Indoor" ? "var(--admin)" : "var(--josh)",
                fontFamily: "'DM Mono', monospace" }}>
                {p.setting === "Both" ? "In/Out" : p.setting}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FREE TIME SCREEN ─────────────────────────────────────────────────────────
const FREE_TIME_OPTIONS = [
  { label: "Research", icon: "🔍", action: "link", url: "https://drive.google.com/drive/folders/1G1xtRQSf_3x1WVdNcsFI2OVFXCBT3WuQ?usp=drive_link", desc: "Open research folder" },
  { label: "Read", icon: "📖", action: "link", url: "kindle://", desc: "Open Kindle" },
  { label: "Netflix", icon: "🎬", action: "link", url: "https://netflix.com", desc: "Open Netflix" },
  { label: "Newsletters", icon: "📬", action: "link", url: "https://mail.google.com", desc: "Open Gmail" },
  { label: "Workout", icon: "💪", action: "none", desc: "Time to move" },
];

function FreeTimeScreen() {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sb.from("free_time_options").select("*").order("sort_order").then(({ data }) => {
      setOptions(data || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="fade" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "72px 20px 28px" }}>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 34, fontWeight: 400, color: "var(--text)", marginBottom: 4 }}>Free Time<span style={{ color: "var(--sage)" }}>.</span></div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase" }}>What will you do?</div>
      </div>
      {loading ? <SkeletonCard rows={3} /> : (
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {options.map(opt => (
            <a key={opt.id} href={opt.url || undefined}
              target="_blank" rel="noopener noreferrer"
              style={{ textDecoration: "none" }}>
              <div style={{ padding: "16px 18px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{opt.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, color: "var(--text)", fontWeight: 500 }}>{opt.label}</div>
                  {opt.description && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{opt.description}</div>}
                </div>
                {opt.url && <span style={{ fontSize: 14, color: "var(--muted2)" }}>→</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── KIDS TIME SCREEN ─────────────────────────────────────────────────────────
const KIDS_TIME_OPTIONS = [
  { label: "Read", icon: "📚", desc: "Story time together" },
  { label: "Board game", icon: "🎲", desc: "Pick a game and play" },
  { label: "Puzzle", icon: "🧩", desc: "Work on a puzzle" },
  { label: "Bible study", icon: "✝️", desc: "Faith time together" },
  { label: "Bake", icon: "🍪", desc: "Make something together" },
  { label: "Writing", icon: "✏️", desc: "Creative writing time" },
];

function KidsTimeScreen() {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sb.from("kids_time_options").select("*").order("sort_order").then(({ data }) => {
      setOptions(data || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="fade" style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "72px 20px 28px" }}>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 34, fontWeight: 400, color: "var(--text)", marginBottom: 4 }}>Kids Time<span style={{ color: "var(--sage)" }}>.</span></div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase" }}>Time with the little ones</div>
      </div>
      {loading ? <SkeletonCard rows={3} /> : (
        <div style={{ padding: "0 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {options.map(opt => (
            <div key={opt.id} style={{ padding: "20px 14px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
              <span style={{ fontSize: 32 }}>{opt.icon}</span>
              <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>{opt.label}</div>
              {opt.description && <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>{opt.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CONNECT SCREEN ───────────────────────────────────────────────────────────
const CONTACTS = [
  { id: "sharon",  name: "Sharon",  role: "Friend",  notes: "Works reduced hours. Afternoon meets. Weekend playdates.", phone: "35699367867" },
  { id: "vany",    name: "Vany",    role: "BFF",     notes: "BFF. Check-ins. Voice notes.", phone: "35699396772" },
  { id: "cristina",name: "Cristina",role: "BFF",     notes: "BFF. Random musings. Photos.", phone: "35679595179" },
  { id: "josh",    name: "Josh",    role: "Husband", notes: "Love of your life. Send some love.", phone: "35677108584" },
  { id: "lucia",   name: "Lucia",   role: "Friend",  notes: "Mum of 5 in the trenches. Playdates and casual hang outs.", phone: "35699115577" },
  { id: "steffi",  name: "Steffi",  role: "Friend",  notes: "Funny mummy neighbour. Playdates and group hangs.", phone: "35679836448" },
];

const AVATAR_COLORS = {
  sharon:  { bg: "rgba(212,168,160,0.18)", color: "var(--danger)"  },
  vany:    { bg: "rgba(122,106,168,0.12)", color: "var(--admin)"   },
  cristina:{ bg: "rgba(124,158,138,0.14)", color: "var(--josh)"    },
  josh:    { bg: "rgba(196,168,130,0.18)", color: "var(--morning)" },
  lucia:   { bg: "rgba(74,125,138,0.12)",  color: "var(--evening)" },
  steffi:  { bg: "rgba(124,158,138,0.14)", color: "var(--sage)"    },
};

function ContactCard({ contact, calToken }) {
  const [showMeetup, setShowMeetup] = useState(false);
  const [nextEvent, setNextEvent] = useState(null);
  const [eventLoading, setEventLoading] = useState(false);

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
            ? new Date(evt.start.dateTime).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Malta" })
            : new Date(evt.start.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
          setNextEvent({ title: evt.summary, date: dateStr });
        } else {
          setNextEvent({ title: null, date: null });
        }
      }
    } catch (e) { setNextEvent({ title: null, date: null }); }
    setEventLoading(false);
  };

  const handleMeetupToggle = () => {
    const next = !showMeetup;
    setShowMeetup(next);
    if (next) loadNextEvent();
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(28,26,24,0.04)" }}>

      {/* Card top — name, role, notes */}
      <div style={{ padding: "16px 14px 12px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 4 }}>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 15, fontWeight: 500, color: "var(--text)" }}>{contact.name}</div>
        <div style={{ fontSize: 10, color: "var(--muted2)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase" }}>{contact.role}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6, marginTop: 4 }}>{contact.notes}</div>
      </div>

      {/* Actions — WA always visible, meetup button toggles */}
      <div style={{ padding: "4px 14px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <a href={`https://wa.me/${contact.phone}`} target="_blank" rel="noopener noreferrer"
          style={{ width: 44, height: 44, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
          </svg>
        </a>

        <button
          onClick={handleMeetupToggle}
          style={{
            fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase",
            padding: "6px 16px", background: "transparent",
            border: `1px solid ${showMeetup ? "var(--sage)" : "var(--border)"}`,
            borderRadius: 999,
            color: showMeetup ? "var(--sage)" : "var(--muted)",
            cursor: "pointer", transition: "all 0.18s",
          }}>
          next meet up
        </button>
      </div>

      {/* Meetup panel */}
      {showMeetup && (
        <div style={{ margin: "0 14px 14px", padding: "12px 14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--muted2)", marginBottom: 6 }}>Next meetup</div>
          {eventLoading ? (
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.14em" }}>searching calendar…</div>
          ) : !calToken ? (
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.14em" }}>Connect calendar to see meetups</div>
          ) : nextEvent?.date ? (
            <>
              <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 16, fontWeight: 400, color: "var(--text)" }}>{nextEvent.date}</div>
              {nextEvent.title && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{nextEvent.title}</div>}
            </>
          ) : (
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "var(--muted2)", letterSpacing: "0.14em" }}>Nothing scheduled — book something in!</div>
          )}
        </div>
      )}
    </div>
  );
}

function ConnectScreen() {
  const { token } = useGoogleCalendar();

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "72px 20px 20px" }}>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 40, fontWeight: 400, color: "var(--text)", marginBottom: 4, letterSpacing: "-0.02em" }}>Connect<span style={{ color: "var(--sage)" }}>.</span></div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase" }}>Your people</div>
      </div>
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {CONTACTS.map(c => <ContactCard key={c.id} contact={c} calToken={token} />)}
      </div>
    </div>
  );
}

// ─── BOTTOM NAV ───────────────────────────────────────────────────────────────
const NAV_PRIMARY = [
  { key: "today", label: "Today", icon: "◎" },
  { key: "week",  label: "Week",  icon: "▦" },
  { key: "month", label: "Month", icon: "◫" },
  { key: "tasks", label: "Tasks", icon: "◈", albaOnly: true },
];

const NAV_MORE = [
  { key: "plan",     label: "Plan",    icon: "◷", albaOnly: true },
  { key: "connect",  label: "Connect", icon: "♡", albaOnly: true },
  { key: "todo",     label: "Do",      icon: "◉", albaOnly: true },
  { key: "freetime", label: "Me",      icon: "◌", albaOnly: true },
  { key: "kidstime", label: "Kids",    icon: "☆", albaOnly: true },
];

const NAV = [...NAV_PRIMARY, ...NAV_MORE];

function BottomNav({ active, onChange, who }) {
  const [showMore, setShowMore] = useState(false);
  const visibleMore = NAV_MORE.filter(n => !n.albaOnly || who === "alba");
  const isMoreActive = visibleMore.some(n => n.key === active);

  return (
    <>
      {/* More sheet overlay */}
      {showMore && (
        <div
          onClick={() => setShowMore(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 150,
            background: "rgba(28,26,24,0.35)", backdropFilter: "blur(4px)",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)",
              width: "calc(100% - 32px)", maxWidth: 448,
              background: "var(--surface)", borderRadius: 20,
              border: "1px solid var(--border)",
              boxShadow: "0 8px 40px rgba(28,26,24,0.18)",
              padding: "8px 0 4px",
            }}
          >
            <div style={{ padding: "4px 16px 10px", fontSize: 10, fontFamily: "'DM Mono', monospace", color: "var(--muted2)", textTransform: "uppercase", letterSpacing: "0.22em" }}>More</div>
            {visibleMore.map(n => (
              <button key={n.key} onClick={() => { onChange(n.key); setShowMore(false); }} style={{
                width: "100%", padding: "13px 20px", background: "none", border: "none",
                display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
                borderLeft: `3px solid ${active === n.key ? "var(--sage)" : "transparent"}`,
                color: active === n.key ? "var(--text)" : "var(--muted)",
                transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{n.icon}</span>
                <span style={{ fontSize: 14, fontFamily: "'Outfit', sans-serif" }}>{n.label}</span>
                {active === n.key && <div style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "var(--sage)" }} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto",
        background: "rgba(247,244,240,0.96)", backdropFilter: "blur(24px)",
        borderTop: "1px solid var(--border)",
        zIndex: 100, boxShadow: "0 -2px 16px rgba(28,26,24,0.06)",
      }}>
        <div style={{
          display: "flex", padding: "8px 0 env(safe-area-inset-bottom, 18px)",
        }}>
          {NAV_PRIMARY.filter(n => !n.albaOnly || who === "alba").map(n => (
            <button key={n.key} onClick={() => { setShowMore(false); onChange(n.key); }} style={{
              flex: 1, background: "none", border: "none",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "4px 4px",
              color: active === n.key ? "var(--text)" : "var(--muted2)",
              transition: "color 0.18s",
            }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>{n.icon}</span>
              <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase" }}>{n.label}</span>
              <div style={{ width: 16, height: 2, borderRadius: 1, background: active === n.key ? "var(--sage)" : "transparent", marginTop: 1, transition: "background 0.18s" }} />
            </button>
          ))}
          {/* More button — alba only */}
          {who === "alba" && <button onClick={() => setShowMore(s => !s)} style={{
            flex: 1, background: "none", border: "none",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            padding: "4px 4px",
            color: isMoreActive || showMore ? "var(--text)" : "var(--muted2)",
            transition: "color 0.18s",
          }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>•••</span>
            <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase" }}>More</span>
            <div style={{ width: 16, height: 2, borderRadius: 1, background: isMoreActive || showMore ? "var(--sage)" : "transparent", marginTop: 1, transition: "background 0.18s" }} />
          </button>}
        </div>
      </div>
    </>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
function SettingsIcon({ onPress }) {
  return (
    <button onClick={onPress} style={{
      position: "fixed", top: 16, right: 16, zIndex: 200,
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 12, width: 36, height: 36,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "var(--muted)", fontSize: 15,
      boxShadow: "0 1px 6px rgba(28,26,24,0.08)",
    }}>⚙</button>
  );
}

function WelcomeScreen({ onChoose }) {
  const [mentalVisible, setMentalVisible] = useState(false);
  const [typedChars, setTypedChars] = useState(0);
  const [restVisible, setRestVisible] = useState(false);

  const WORD = "load.";

  useEffect(() => {
    // mental fades in first
    const t1 = setTimeout(() => setMentalVisible(true), 150);

    // typewriter starts after mental settles — each char 110ms apart, period 280ms pause
    const timers = [];
    let elapsed = 1000;
    WORD.split("").forEach((char, i) => {
      const gap = char === "." ? 280 : 110;
      elapsed += (i === 0 ? 0 : gap);
      timers.push(setTimeout(() => setTypedChars(i + 1), elapsed));
      elapsed += (char === "." ? 0 : gap);
    });

    // rest appears after typing finishes
    const t2 = setTimeout(() => setRestVisible(true), elapsed + 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      timers.forEach(clearTimeout);
    };
  }, []);

  const typed = WORD.slice(0, typedChars);
  const loadPart = typed.replace(".", "");
  const hasPeriod = typed.includes(".");
  const isTyping = typedChars > 0 && typedChars < WORD.length;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 0, background: "var(--bg)" }}>

      {/* App name */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 52 }}>

        {/* "mental" — fades in, italic per brand spec */}
        <div style={{
          fontFamily: "'Lora', Georgia, serif", fontWeight: 400, fontStyle: "italic",
          fontSize: 40, color: "var(--text)", lineHeight: 1.1,
          letterSpacing: "-0.025em", textAlign: "center",
          opacity: mentalVisible ? 1 : 0,
          transform: mentalVisible ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 0.9s ease, transform 0.9s ease",
        }}>
          mental
        </div>

        {/* "load." — typed character by character, roman per brand spec */}
        <div style={{
          fontFamily: "'Lora', Georgia, serif", fontWeight: 500, fontStyle: "normal",
          fontSize: 40, lineHeight: 1.1, letterSpacing: "-0.025em", textAlign: "center",
          minHeight: "1.1em", display: "flex", alignItems: "baseline", justifyContent: "center",
        }}>
          <span style={{ color: "var(--text)" }}>{loadPart}</span>
          {hasPeriod && (
            <span style={{
              display: "inline-block", width: "0.16em", height: "0.16em",
              background: "var(--sage)", borderRadius: "50%",
              marginLeft: "0.04em", verticalAlign: "baseline", flexShrink: 0,
            }} />
          )}
          {isTyping && (
            <span style={{
              display: "inline-block", width: 2, height: "0.75em",
              background: "var(--text)", marginLeft: 1, verticalAlign: "middle",
              animation: "blink 0.7s step-end infinite",
            }} />
          )}
        </div>
      </div>

      {/* Who's here — appears after typing */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
        width: "100%", maxWidth: 280,
        opacity: restVisible ? 1 : 0,
        transform: restVisible ? "translateY(0)" : "translateY(10px)",
        transition: "opacity 0.7s ease, transform 0.7s ease",
      }}>
        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.22em", textTransform: "uppercase" }}>Who's here?</div>
        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          {[["alba", "var(--sage)"], ["josh", "var(--josh)"]].map(([w, c]) => (
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
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}

function AppInner() {
  const [who, chooseWho] = useWho();
  const [screen, setScreen] = useState("today");
  const [slideDir, setSlideDir] = useState("left");
  const [editing, setEditing] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
  const [desktop, setDesktop] = useState(isDesktop);

  const navigateTo = (next) => {
    const order = NAV.map(n => n.key);
    const from = order.indexOf(screen);
    const to   = order.indexOf(next);
    setSlideDir(to >= from ? "left" : "right");
    setScreen(next);
  };

  useEffect(() => {
    const handler = () => setDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    if (who === "josh" && !localStorage.getItem("push_registered_josh")) {
      setShowPushPrompt(true);
    }
  }, [who]);

  useEffect(() => {
    if (who) runPlanRollover();
  }, [who]);

  // ── Pull-to-refresh ──────────────────────────────────────────────────────────
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStart = useRef(null);
  const PULL_THRESHOLD = 80;

  useEffect(() => {
    const onTouchStart = (e) => {
      if (window.scrollY === 0) pullStart.current = e.touches[0].clientY;
      else pullStart.current = null;
    };
    const onTouchMove = (e) => {
      if (pullStart.current === null) return;
      const dy = e.touches[0].clientY - pullStart.current;
      if (dy > 0) setPullY(Math.min(dy, PULL_THRESHOLD + 20));
      else { pullStart.current = null; setPullY(0); }
    };
    const onTouchEnd = () => {
      if (pullY >= PULL_THRESHOLD && !refreshing) {
        setRefreshing(true);
        setTimeout(() => window.location.reload(), 400);
      } else {
        setPullY(0);
      }
      pullStart.current = null;
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [pullY, refreshing]);



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
    connect: <ConnectScreen />,
    todo: <ThingsToDoScreen />,
    freetime: <FreeTimeScreen />,
    kidstime: <KidsTimeScreen />,
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
        <div style={{ padding: "0 20px 28px", fontFamily: "'Lora', Georgia, serif", fontSize: 22, letterSpacing: "-0.025em", lineHeight: 1.0, color: "var(--text)", whiteSpace: "nowrap" }}>
          <span style={{ fontStyle: "italic", fontWeight: 400 }}>mental </span><span style={{ fontStyle: "normal", fontWeight: 500 }}>load<span style={{ display: "inline-block", width: "0.16em", height: "0.16em", background: "var(--sage)", borderRadius: "50%", marginLeft: "0.04em", verticalAlign: "baseline" }} /></span>
        </div>
        {NAV.filter(n => !n.albaOnly || who === "alba").map(n => (
          <button key={n.key} onClick={() => navigateTo(n.key)} className="press" style={{
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

      {/* Pull-to-refresh indicator */}
      {pullY > 0 && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
          display: "flex", justifyContent: "center",
          transform: `translateY(${Math.min(pullY - 30, 20)}px)`,
          transition: pullY >= PULL_THRESHOLD ? "none" : "transform 0.1s",
          pointerEvents: "none",
        }}>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 999, padding: "5px 14px",
            fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: "0.18em",
            color: pullY >= PULL_THRESHOLD ? "var(--sage)" : "var(--muted2)",
            boxShadow: "0 2px 8px rgba(28,26,24,0.1)",
            transition: "color 0.18s",
          }}>
            {refreshing ? "refreshing…" : pullY >= PULL_THRESHOLD ? "↑ release" : "↓ pull to refresh"}
          </div>
        </div>
      )}

      {/* Push notification prompt for Josh */}
      {showPushPrompt && who === "josh" && (
        <div style={{ position: "fixed", bottom: 90, left: 0, right: 0, zIndex: 300, padding: "0 16px" }}>
          <div style={{ background: "var(--text)", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 20px rgba(28,26,24,0.25)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 14, color: "var(--bg)", marginBottom: 2 }}>Enable notifications</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: "0.18em", color: "var(--muted2)" }}>Get notified when Alba assigns you tasks</div>
            </div>
            <button onClick={async () => {
              const ok = await registerPushForJosh();
              if (ok) setShowPushPrompt(false);
            }} style={{ background: "var(--sage)", border: "none", borderRadius: 10, padding: "8px 16px", color: "#fff", fontSize: 12, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", cursor: "pointer", flexShrink: 0 }}>
              Allow
            </button>
            <button onClick={() => { setShowPushPrompt(false); localStorage.setItem("push_registered_josh", "dismissed"); }} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>×</button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ marginLeft: desktop ? SIDEBAR_W : 0, paddingBottom: desktop ? 0 : 100 }}>
        <div key={screen} className={`slide-${slideDir}`} style={{ maxWidth: desktop ? 800 : "100%" }}>{screens[screen]}</div>
      </div>

      {/* Mobile bottom nav + settings */}
      {!desktop && <>
        <BottomNav active={screen} onChange={navigateTo} who={who} />
        {/* Mobile top bar — avatar + settings */}
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
          height: 60,
          background: "rgba(247,244,240,0.92)", backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center",
          padding: "0 16px", justifyContent: "space-between",
        }}>
          {/* Left: avatar + name */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: who === "alba" ? "var(--sage)" : "var(--josh)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 500, color: "#fff",
              fontFamily: "'Outfit', sans-serif",
            }}>{who === "alba" ? "A" : "J"}</div>
            <button onClick={() => { localStorage.removeItem("hb_who"); window.location.reload(); }} style={{
              background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4, padding: 0,
            }}>
              <span style={{ fontSize: 13, fontFamily: "'Outfit', sans-serif", color: "var(--text)", fontWeight: 500 }}>{who === "alba" ? "Alba" : "Josh"}</span>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>▾</span>
            </button>
          </div>
          {/* Right: settings */}
          <button onClick={() => setEditing(true)} style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 10, width: 34, height: 34,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--muted)", fontSize: 14,
            boxShadow: "0 1px 4px rgba(28,26,24,0.04)",
          }}>⚙</button>
        </div>
      </>}
    </div>
  );
}
