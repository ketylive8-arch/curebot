"use client";

import { useEffect, useRef, useState } from "react";

type Bubble = { from: "me" | "bot" | "sys"; text: string };

const SCENARIOS: { label: string; text: string }[] = [
  { label: "אמא של מתבגר עם חרדה", text: "היי, הבת שלי בת 15 והיא סובלת מחרדות, כמעט לא יוצאת מהבית. מה אתם עושים?" },
  { label: "שואלת מחיר", text: "שלום, כמה עולה טיפול אצל קטי?" },
  { label: "סקפטי", text: "זה באמת עובד? ניסיתי כבר המון דברים ושום דבר לא עזר" },
  { label: "רכזת מבית ספר", text: "שלום, אני רכזת חברתית בבית ספר ורוצה סדנת חוסן רגשי לכיתות ט'" },
  { label: "מצוקה חריפה", text: "אני לא רואה טעם להמשיך, נמאס לי מהכול" },
];

function newSession() {
  return "d" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default function Demo() {
  const [key, setKey] = useState("");
  const [session, setSession] = useState(newSession);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setKey(new URLSearchParams(location.search).get("key") || "");
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles, busy]);

  async function send(text: string) {
    text = text.trim();
    if (!text || busy) return;
    setInput("");
    setBubbles((b) => [...b, { from: "me", text }]);
    setBusy(true);
    try {
      const r = await fetch(`/api/demo?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session }),
      });
      if (!r.ok) {
        setBubbles((b) => [...b, { from: "sys", text: "גישה נדחתה — בדקי שהכתובת כוללת ?key=…" }]);
      } else {
        const j = await r.json();
        if (j.skipped === "paused") {
          setBubbles((b) => [...b, { from: "sys", text: "הבוט מושהה בשיחה הזו — היא הועברה לקטי. (בשיחה אמיתית הוא שותק עד שקטי חוזרת.)" }]);
        } else {
          for (const rep of j.replies as string[]) setBubbles((b) => [...b, { from: "bot", text: rep }]);
          if (j.alert) setBubbles((b) => [...b, { from: "sys", text: "🔴 סומן כמצוקה: קטי מקבלת התראה מיידית והבוט מושהה בשיחה." }]);
          else if (j.human) setBubbles((b) => [...b, { from: "sys", text: "🟠 ביקשו אדם: קטי מקבלת התראה והבוט מושהה בשיחה." }]);
        }
      }
    } catch {
      setBubbles((b) => [...b, { from: "sys", text: "שגיאת רשת. נסי שוב." }]);
    }
    setBusy(false);
  }

  function reset() {
    setSession(newSession());
    setBubbles([]);
  }

  if (!key) return <main style={{ padding: 24 }}>נדרש מפתח גישה: פתחי את הכתובת עם <code>?key=…</code></main>;

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", height: "100dvh", display: "flex", flexDirection: "column", background: "#e5ddd5" }}>
      <header style={{ background: "#075e54", color: "#fff", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700 }}>CURE MINDSET</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>דמו · אותו מוח כמו בוואטסאפ</div>
        </div>
        <button onClick={reset} style={{ background: "rgba(255,255,255,.18)", color: "#fff", border: 0, borderRadius: 10, padding: "6px 12px", cursor: "pointer" }}>
          שיחה חדשה
        </button>
      </header>

      <div style={{ padding: "8px 10px", display: "flex", gap: 6, flexWrap: "wrap", background: "#f0f0f0" }}>
        {SCENARIOS.map((s) => (
          <button key={s.label} onClick={() => send(s.text)} disabled={busy}
            style={{ border: "1px solid #cfcfcf", background: "#fff", borderRadius: 16, padding: "5px 11px", fontSize: 12.5, cursor: "pointer" }}>
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {bubbles.length === 0 && <div style={{ textAlign: "center", color: "#667", fontSize: 13, marginTop: 20 }}>לחצי על תרחיש למעלה או כתבי הודעה כמו לקוחה.</div>}
        {bubbles.map((b, i) => (
          <div key={i} style={{
            alignSelf: b.from === "me" ? "flex-start" : b.from === "bot" ? "flex-end" : "center",
            background: b.from === "me" ? "#dcf8c6" : b.from === "bot" ? "#fff" : "#fff3cd",
            maxWidth: b.from === "sys" ? "92%" : "82%", padding: "8px 12px", borderRadius: 12,
            lineHeight: 1.5, whiteSpace: "pre-wrap", boxShadow: "0 1px 1px rgba(0,0,0,.12)",
            fontStyle: b.from === "sys" ? "italic" : "normal", fontSize: b.from === "sys" ? 12.5 : 14.5,
          }}>{b.text}</div>
        ))}
        {busy && <div style={{ alignSelf: "flex-end", color: "#667", fontSize: 13 }}>מקלידה…</div>}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} style={{ display: "flex", gap: 8, padding: 10, background: "#f0f0f0" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="כתבי הודעה…"
          style={{ flex: 1, border: 0, borderRadius: 20, padding: "10px 14px", fontSize: 15 }} />
        <button type="submit" disabled={busy} style={{ border: 0, background: "#075e54", color: "#fff", borderRadius: 20, padding: "0 18px", fontWeight: 700 }}>שליחה</button>
      </form>
    </main>
  );
}
