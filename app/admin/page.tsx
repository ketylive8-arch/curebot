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
  paused?: boolean;
};
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

  useEffect(() => {
    setKey(new URLSearchParams(location.search).get("key") || "");
  }, []);

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

      {convs.length === 0 && <p style={{ color: "#8a8178" }}>אין עדיין שיחות.</p>}

      {convs.map((c) => (
        <div key={c.key} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              <b>{c.name || c.userId}</b>{" "}
              {c.flag && <span style={{ color: FLAG[c.flag].color, fontWeight: 700, fontSize: 13 }}>· {FLAG[c.flag].label}</span>}
              {c.paused && <span style={{ color: "#8a8178", fontSize: 13 }}> · מושהה</span>}
              <div style={{ color: "#8a8178", fontSize: 14, marginTop: 3 }}>"{c.last}"</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <button onClick={() => view(c)} style={{ ...btn, background: "#efe7d6" }}>צפייה</button>
              <button onClick={() => togglePause(c)} style={{ ...btn, background: c.paused ? "#2e9e5b" : "#e0d6c4", color: c.paused ? "#fff" : "#2b2723" }}>
                {c.paused ? "המשך בוט" : "השהה בוט"}
              </button>
            </div>
          </div>
        </div>
      ))}

      {open && (
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 16, maxWidth: 460, width: "100%", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>{open.meta.name || open.meta.userId}</div>
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
