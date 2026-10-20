"use client";

import { useEffect, useState, useCallback } from "react";

type Conv = {
  key: string;
  channel: string;
  userId: string;
  name?: string;
  last: string;
  flag: "" | "hot" | "human" | "alert" | "ended";
  updated: number;
  created?: number;
  source?: string;
  paused?: boolean;
  lead?: Lead;
};
type Lead = { name?: string; phone?: string; email?: string; forWhom?: string; age?: string; city?: string; topic?: string; stage?: string; summary?: string };

const pretty = (p?: string) => (p ? ("0" + p.replace(/^972/, "")).replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3") : "");
const when = (t?: number) => (t ? new Date(t).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const srcLabel = (c: Conv) => c.channel === "whatsapp" ? "וואטסאפ" : c.channel === "try" ? "אתר" : c.channel === "demo" ? "דמו" : c.channel;
const PAGES: Record<string, string> = {
  "/": "דף הבית", "/anxiety-and-stress": "חרדה ולחץ", "/self-confidence": "ביטחון עצמי", "/procrastination": "דחיינות",
  "/emotional-coaching": "ליווי רגשי", "/cure-teens": "CURE Teens", "/method": "השיטה", "/about": "אודות", "/faq": "שאלות נפוצות",
  "/contact": "צור קשר", "/workshops": "סדנאות", "/programs": "תוכניות", "/gifts.html": "מתנות", "/personal": "ליווי אישי",
};
const SOURCES: Record<string, string> = { facebook: "פייסבוק", fb: "פייסבוק", instagram: "אינסטגרם", ig: "אינסטגרם", google: "גוגל", tiktok: "טיקטוק", whatsapp: "וואטסאפ", email: "מייל" };
function srcPretty(src?: string) {
  if (!src) return "";
  if (src.startsWith("הפניה:")) return src;
  try {
    const u = new URL(src, "https://ketysegev.com");
    const page = PAGES[u.pathname.replace(/\/$/, "") || "/"] || u.pathname;
    const from = u.searchParams.get("utm_source") || "";
    const camp = u.searchParams.get("utm_campaign") || "";
    return [`עמוד: ${page}`, from && `מקור: ${SOURCES[from.toLowerCase()] || from}`, camp && `קמפיין: ${camp}`].filter(Boolean).join(" · ");
  } catch { return src; }
}
function waHref(l?: Lead) {
  if (!l?.phone) return "";
  const hi = `היי${l.name ? " " + l.name : ""}, כאן קטי שגב 🙂 ראיתי שפנית אליי דרך האתר, אשמח לדבר.`;
  return `https://wa.me/${l.phone}?text=${encodeURIComponent(hi)}`;
}
function exportCsv(convs: Conv[]) {
  const head = ["תאריך", "מקור", "שם", "טלפון", "מייל", "למי", "גיל", "עיר", "נושא", "שלב", "סיכום", "עמוד/קמפיין"];
  const rows = convs.filter((c) => c.channel !== "demo").map((c) => [when(c.created || c.updated), srcLabel(c), c.lead?.name, pretty(c.lead?.phone), c.lead?.email, c.lead?.forWhom, c.lead?.age, c.lead?.city, c.lead?.topic, c.lead?.stage, c.lead?.summary, srcPretty(c.source)]);
  const csv = "\uFEFF" + [head, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `curebot-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
type ChatMsg = { role: "user" | "assistant"; content: string };

const FLAG: Record<string, { label: string; color: string }> = {
  hot: { label: "ליד חם", color: "#b9974a" },
  human: { label: "ביקש/ה אדם", color: "#c98a3c" },
  alert: { label: "מצוקה", color: "#c65b4e" },
  ended: { label: "הסתיים", color: "#7a8a7a" },
  "": { label: "", color: "#8a8178" },
};

export default function Admin() {
  const [key, setKey] = useState("");
  const [convs, setConvs] = useState<Conv[]>([]);
  const [globallyPaused, setGloballyPaused] = useState(false);
  const [open, setOpen] = useState<{ meta: Conv; history: ChatMsg[] } | null>(null);
  const [err, setErr] = useState("");
  const [onlyPhone, setOnlyPhone] = useState(false);

  const [pushState, setPushState] = useState<"" | "on" | "busy" | "denied" | "unsupported" | "ios-install">("");
  const [pendingConv, setPendingConv] = useState("");

  useEffect(() => {
    // המפתח נשמר בטלפון אחרי הכניסה הראשונה, כדי שהאייקון במסך הבית ייפתח בלי להקליד אותו שוב
    const q = new URLSearchParams(location.search);
    let k = q.get("key") || "";
    try { if (k) localStorage.setItem("cb-admin-key", k); else k = localStorage.getItem("cb-admin-key") || ""; } catch {}
    setKey(k);
    setPendingConv(q.get("c") || "");
    // אייקון במסך הבית ייפתח ישר ללוח, עם המפתח
    if (k) {
      const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (link) link.href = `/api/manifest?key=${encodeURIComponent(k)}`;
      if (!q.get("key")) history.replaceState(null, "", `/admin?key=${encodeURIComponent(k)}${q.get("c") ? "&c=" + encodeURIComponent(q.get("c")!) : ""}`);
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.openConversation) setPendingConv(e.data.openConversation); });
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") setPushState("on");
  }, []);

  async function enablePush() {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
      setPushState(isIOS && !standalone ? "ios-install" : "unsupported");
      return;
    }
    setPushState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPushState("denied"); return; }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch(`/api/admin/push?key=${encodeURIComponent(key)}`)).json();
      const pad = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const raw = atob((publicKey + pad).replace(/-/g, "+").replace(/_/g, "/"));
      const appKey = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey }));
      await fetch(`/api/admin/push?key=${encodeURIComponent(key)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), test: true }),
      });
      setPushState("on");
    } catch { setPushState("unsupported"); }
  }

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const r = await fetch(`/api/admin/conversations?key=${encodeURIComponent(key)}`);
      if (!r.ok) { setErr("מפתח שגוי או גישה נדחתה."); return; }
      const j = await r.json();
      setConvs(j.conversations || []);
      setGloballyPaused(!!j.globallyPaused);
      setErr("");
    } catch { setErr("שגיאת רשת."); }
  }, [key]);

  useEffect(() => {
    if (!key) return;
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [key, load]);

  useEffect(() => {
    if (!pendingConv || !convs.length) return;
    const c = convs.find((x) => x.key === pendingConv);
    if (c) { view(c); setPendingConv(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingConv, convs]);

  async function toggleGlobal() {
    await fetch(`/api/admin/pause?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "global", on: !globallyPaused }),
    });
    load();
  }
  async function togglePause(c: Conv) {
    await fetch(`/api/admin/pause?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "conversation", conversation: c.key, on: !c.paused }),
    });
    load();
  }
  async function view(c: Conv) {
    const r = await fetch(`/api/admin/conversations?key=${encodeURIComponent(key)}&conversation=${encodeURIComponent(c.key)}`);
    const j = await r.json();
    setOpen({ meta: c, history: j.history || [] });
  }

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #e6ddcf", borderRadius: 14, padding: 14, marginBottom: 10 };
  const btn: React.CSSProperties = { border: 0, borderRadius: 10, padding: "7px 13px", fontWeight: 700, cursor: "pointer", fontSize: 13 };

  if (!key) return <Wrap><p>נדרש מפתח גישה. פתחי את הכתובת עם <code>?key=…</code></p></Wrap>;
  if (err) return <Wrap><p style={{ color: "#c65b4e" }}>{err}</p></Wrap>;

  return (
    <Wrap>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>CURE <span style={{ color: "#b9974a" }}>MINDSET</span> · לוח בקרה</div>
        <button onClick={toggleGlobal} style={{ ...btn, background: globallyPaused ? "#c65b4e" : "#2e9e5b", color: "#fff" }}>
          {globallyPaused ? "⏸ הבוט מושהה כללית — הפעילי" : "▶️ הבוט פעיל — השהה הכל"}
        </button>
      </header>

      <div style={{ ...card, background: "#fbf4e6", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          {pushState === "on" ? "🔔 התראות פעילות בטלפון הזה: כל פנייה חדשה תקפוץ כהתראה."
            : pushState === "ios-install" ? "באייפון: לוחצים על כפתור השיתוף ← \"הוספה למסך הבית\", פותחים מהאייקון החדש, ולוחצים כאן שוב."
            : pushState === "denied" ? "ההתראות נחסמו בדפדפן. אפשר לאפשר אותן בהגדרות האתר בדפדפן."
            : pushState === "unsupported" ? "הדפדפן הזה לא תומך בהתראות. נסי מכרום באנדרואיד, או מהאייקון במסך הבית באייפון."
            : "רוצה לקבל התראה בטלפון על כל פנייה חדשה?"}
        </div>
        {pushState !== "on" && (
          <button onClick={enablePush} disabled={pushState === "busy"} style={{ ...btn, background: "#8a6a2f", color: "#fff" }}>
            {pushState === "busy" ? "מפעילה…" : "🔔 הפעלת התראות"}
          </button>
        )}
      </div>

      {convs.length === 0 && <p style={{ color: "#8a8178" }}>אין עדיין שיחות.</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <button onClick={() => setOnlyPhone(!onlyPhone)} style={{ ...btn, background: onlyPhone ? "#8a6a2f" : "#efe7d6", color: onlyPhone ? "#fff" : "#2b2723" }}>
          {onlyPhone ? "✓ רק לידים עם טלפון" : "רק לידים עם טלפון"}
        </button>
        <button onClick={() => exportCsv(convs)} style={{ ...btn, background: "#efe7d6" }}>⬇️ הורדת רשימת לידים (אקסל)</button>
      </div>

      {convs.filter((c) => !onlyPhone || c.lead?.phone).map((c) => (
        <div key={c.key} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
            <div>
              <span style={{ fontSize: 12, background: "#efe7d6", borderRadius: 8, padding: "1px 7px", marginInlineEnd: 6 }}>{srcLabel(c)}</span>
              <b>{c.lead?.name || c.name || (c.channel === "whatsapp" ? pretty(c.userId) : "פונה מהאתר")}</b>
              {c.flag && <span style={{ color: FLAG[c.flag].color, fontWeight: 700, fontSize: 13 }}> · {FLAG[c.flag].label}</span>}
              {c.paused && <span style={{ color: "#8a8178", fontSize: 13 }}> · מושהה</span>}
            </div>
            <span style={{ color: "#8a8178", fontSize: 12 }}>{when(c.updated)}</span>
          </div>
          {c.lead?.phone
            ? <div style={{ fontSize: 15, marginTop: 4, direction: "ltr", textAlign: "right" }}>{pretty(c.lead.phone)}</div>
            : c.channel === "try" && <div style={{ fontSize: 12.5, color: "#a0522d", marginTop: 4 }}>עוד לא השאיר/ה שם וטלפון, ולכן אי אפשר לחזור אליו/ה. הסוכן יבקש בהמשך השיחה.</div>}
          {(c.lead?.forWhom || c.lead?.topic) && (
            <div style={{ fontSize: 14, marginTop: 4 }}>{[c.lead?.forWhom, c.lead?.age && `גיל ${c.lead.age}`, c.lead?.city, c.lead?.topic].filter(Boolean).join(" · ")}</div>
          )}
          <div style={{ color: "#6b6560", fontSize: 14, marginTop: 4 }}>{c.lead?.summary || `"${c.last}"`}</div>
          {c.lead?.stage && <div style={{ fontSize: 12.5, color: "#8a6a2f", marginTop: 4 }}>שלב: {c.lead.stage}</div>}
          {c.source && <div style={{ fontSize: 12.5, color: "#8a8178", marginTop: 2 }}>{srcPretty(c.source)}</div>}
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {c.lead?.phone && <a href={waHref(c.lead)} target="_blank" rel="noopener noreferrer" style={{ ...btn, background: "#25d366", color: "#fff", textDecoration: "none" }}>💬 וואטסאפ</a>}
            {c.lead?.phone && <a href={`tel:+${c.lead.phone}`} style={{ ...btn, background: "#2b2723", color: "#fff", textDecoration: "none" }}>📞 חיוג</a>}
            <button onClick={() => view(c)} style={{ ...btn, background: "#efe7d6" }}>השיחה המלאה</button>
            <button onClick={() => togglePause(c)} style={{ ...btn, background: c.paused ? "#2e9e5b" : "#e0d6c4", color: c.paused ? "#fff" : "#2b2723" }}>
              {c.paused ? "המשך בוט" : "השהה בוט"}
            </button>
          </div>
        </div>
      ))}

      {open && (
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 16, maxWidth: 460, width: "100%", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>{open.meta.lead?.name || open.meta.name || "פונה מהאתר"} · {srcLabel(open.meta)}</div>
            {open.meta.lead && (
              <div style={{ background: "#fbf4e6", borderRadius: 12, padding: 10, marginBottom: 10, fontSize: 14, lineHeight: 1.6 }}>
                {open.meta.lead.phone && <div>טלפון: <span style={{ direction: "ltr", display: "inline-block" }}>{pretty(open.meta.lead.phone)}</span></div>}
                {open.meta.lead.email && <div>מייל: {open.meta.lead.email}</div>}
                {open.meta.lead.forWhom && <div>למי: {open.meta.lead.forWhom}{open.meta.lead.age ? ` · גיל ${open.meta.lead.age}` : ""}</div>}
                {open.meta.lead.city && <div>עיר: {open.meta.lead.city}</div>}
                {open.meta.lead.topic && <div>נושא: {open.meta.lead.topic}</div>}
                {open.meta.lead.stage && <div>שלב: {open.meta.lead.stage}</div>}
                {open.meta.lead.summary && <div style={{ marginTop: 4 }}><b>סיכום:</b> {open.meta.lead.summary}</div>}
                {open.meta.source && <div style={{ color: "#8a8178", fontSize: 12.5 }}>{srcPretty(open.meta.source)} · {when(open.meta.created)}</div>}
              </div>
            )}
            {open.history.map((m, i) => (
              <div key={i} style={{
                background: m.role === "user" ? "#efe7d6" : "#f3f6f2",
                border: m.role === "assistant" ? "1px solid #e2ece2" : "none",
                borderRadius: 12, padding: "8px 12px", marginBottom: 6, fontSize: 14, whiteSpace: "pre-wrap",
                alignSelf: m.role === "user" ? "flex-start" : "flex-end",
              }}>{m.content}</div>
            ))}
            <button onClick={() => setOpen(null)} style={{ ...btn, background: "#b9974a", color: "#fff", marginTop: 8 }}>סגירה</button>
          </div>
        </div>
      )}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <main style={{ maxWidth: 720, margin: "0 auto", padding: "18px 16px 40px" }}>{children}</main>;
}
