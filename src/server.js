// ============================================================
//  CureBot — מערכת חיבורי וואטסאפ (מרובת משתמשים), בסגנון Base44.
//  קטי (מנהלת) רואה ומנהלת את כל החיבורים; כל משתמש/ת נכנס/ת בקישור + קוד
//  ורואה רק את החיבור שלו/ה. כל חיבור = מספר וואטסאפ אחד בסריקת QR.
// ============================================================
import express from "express";
import { page } from "./ui.js";
import { identify, login, setSession, clearSession, loginAllowed, loginFailed, loginOk, requireAdmin, requireTenantAccess, securityHeaders } from "./auth.js";
import { listTenants, getTenant, createTenant, updateTenant, resetCode, removeTenant, publicTenant, ensureDefaultTenant, setHubspot, setCrm } from "./tenants.js";
import { verifyToken } from "./hubspot.js";
import { verifyCrm, CRM_PROVIDERS } from "./crm.js";
import { startSession, getSession, dropSession } from "./session.js";
import { aiState, diagnoseOpenAI, createBrain } from "./brain.js";
import { sanitizeProfile } from "./business.js";
import { generateDraft } from "./generate.js";
import crypto from "node:crypto";
import { notifyOwner } from "./notify.js";
import { startWatchdog } from "./watchdog.js";

// יציבות: שגיאה בודדת של Baileys/הצפנה לא מפילה את כל השרת.
process.on("uncaughtException", (e) => console.error("[server] uncaughtException:", e?.message || e));
process.on("unhandledRejection", (e) => console.error("[server] unhandledRejection:", e?.message || e));

// השתקת רעש ענק של libsignal שמעמיס על מכונה של 512MB.
const _log = console.log.bind(console);
console.log = (...a) => {
  const f = typeof a[0] === "string" ? a[0] : "";
  if (/^(Closing session|Opening session|SessionEntry|\s*(baseKey|remoteIdentityKey|ephemeralKeyPair|rootKey|chainKey|_chains|currentRatchet|indexInfo|pendingPreKey|registrationId|previousCounter)\b)/.test(f) || /<Buffer /.test(f)) return;
  _log(...a);
};

const PORT = process.env.PORT || 3000;
const MAX_TENANTS = Number(process.env.MAX_TENANTS || 6); // כל חיבור צורך זיכרון; 512MB ≈ עד 6
const ID_RE = /^[a-f0-9]{10}$/;

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(securityHeaders);
app.use(identify);

const baseUrl = (req) => `${req.protocol}://${req.get("host")}`;
const ipOf = (req) => req.ip || req.socket?.remoteAddress || "?";

// הגנת CSRF: כל פעולה שמשנה משהו חייבת להגיע כ-JSON מהדף עצמו.
app.use("/api", (req, res, next) => {
  if (req.method === "GET") return next();
  if (!req.is("application/json")) return res.status(415).json({ error: "בקשה לא תקינה" });
  next();
});

function sendPage(req, res, tenantHint = "") {
  res.set("Cache-Control", "no-store");
  res.type("html").send(page({ nonce: res.locals.nonce, tenantHint: ID_RE.test(tenantHint) ? tenantHint : "" }));
}

// ── דפים ──
// בלי פרטים מזהים: כמה חיבורים מחוברים מתוך כמה (לבדיקה מבחוץ שהכל עובד).
app.get("/health", (_req, res) => {
  const all = listTenants().map(t => getSession(t.id)?.state.status || "stopped");
  res.json({ ok: true, connected: all.filter(x => x === "connected").length, total: all.length });
});

app.get("/", (req, res) => {
  // תאימות לקישור הישן (?key=...) — נכנסים ומנקים את הקוד מהכתובת.
  if (req.query.key) {
    const who = loginAllowed(ipOf(req)) ? login(req.query.key) : null;
    if (who?.role === "admin") { loginOk(ipOf(req)); setSession(res, who); return res.redirect(302, "/"); }
    loginFailed(ipOf(req));
  }
  sendPage(req, res);
});

app.get("/u/:id", (req, res) => {
  const id = String(req.params.id);
  // קישור כניסה ישיר: /u/<id>?c=<קוד> — נכנסים ומנקים את הקוד מהכתובת.
  if (req.query.c && ID_RE.test(id)) {
    const who = loginAllowed(ipOf(req)) ? login(req.query.c, id) : null;
    if (who) { loginOk(ipOf(req)); setSession(res, who); return res.redirect(302, "/"); }
    loginFailed(ipOf(req));
  }
  sendPage(req, res, id);
});

// ── כניסה ──
app.post("/api/login", (req, res) => {
  const ip = ipOf(req);
  if (!loginAllowed(ip)) return res.status(429).json({ error: "יותר מדי ניסיונות. נסי שוב בעוד 15 דקות." });
  const tenantId = ID_RE.test(String(req.body?.tenantId || "")) ? req.body.tenantId : undefined;
  const who = login(req.body?.code, tenantId);
  if (!who) { loginFailed(ip); return res.status(401).json({ error: "הקוד לא נכון. נסי שוב." }); }
  loginOk(ip);
  setSession(res, who);
  res.json({ ok: true, role: who.role });
});
app.post("/api/logout", (_req, res) => { clearSession(res); res.json({ ok: true }); });

app.get("/api/me", (req, res) => {
  const w = req.who;
  if (!w) return res.status(401).json({ error: "לא מחובר/ת" });
  if (w.role === "tenant" && !getTenant(w.t)) { clearSession(res); return res.status(401).json({ error: "החיבור נמחק" }); }
  res.json({ role: w.role, t: w.t || null, ai: aiState() });
});

// ── חיבורים ──
const statusOf = (id) => {
  const s = getSession(id);
  return s ? s.view() : { status: "stopped" };
};

app.get("/api/tenants", requireAdmin, (_req, res) => {
  res.json({ tenants: listTenants().map(t => { const s = statusOf(t.id); return { ...t, status: { status: s.status, me: s.me || null } }; }) });
});

app.post("/api/tenants", requireAdmin, (req, res) => {
  if (listTenants().length >= MAX_TENANTS) return res.status(400).json({ error: `אפשר עד ${MAX_TENANTS} חיבורים בשרת הנוכחי.` });
  const { tenant, code } = createTenant({ name: req.body?.name, ownerNumber: req.body?.ownerNumber, adminOwned: req.body?.mine === true, kind: req.body?.kind === "curemindset" ? "curemindset" : "business" });
  startSession(tenant.id).catch(e => console.error(`[${tenant.id}] start:`, e.message));
  const link = `${baseUrl(req)}/u/${tenant.id}`;
  res.json({ tenant, code, link, directLink: `${link}?c=${code}` });
});

app.get("/api/tenants/:id", requireTenantAccess, (req, res) => {
  const t = getTenant(req.params.id);
  if (!t) return res.status(404).json({ error: "החיבור לא נמצא" });
  const full = statusOf(t.id);
  // פרטיות: על חיבור של מישהו אחר, המנהלת מקבלת רק סטטוס ומונים — בלי תוכן הודעות ובלי מספרי פונים.
  const isPrivateForViewer = req.who.role === "admin" && !t.adminOwned;
  const status = isPrivateForViewer
    ? { status: full.status, me: full.me || null, lastEvent: full.lastEvent, qrDataUrl: full.qrDataUrl, pairingCode: full.pairingCode, handled: full.handled || 0, activeChats: full.activeChats || 0 }
    : full;
  res.json({ tenant: publicTenant(t), status, private: isPrivateForViewer, ai: aiState() });
});

app.patch("/api/tenants/:id", requireTenantAccess, (req, res) => {
  const t = updateTenant(req.params.id, { ...(req.body || {}) }, { byAdmin: req.who.role === "admin" });
  if (!t) return res.status(404).json({ error: "החיבור לא נמצא" });
  res.json({ tenant: t });
});

app.post("/api/tenants/:id/disconnect", requireTenantAccess, async (req, res) => {
  if (!getTenant(req.params.id)) return res.status(404).json({ error: "החיבור לא נמצא" });
  const s = getSession(req.params.id) || await startSession(req.params.id);
  s.disconnect().catch(e => console.error(`[${req.params.id}] disconnect:`, e.message));
  res.json({ ok: true });
});

app.post("/api/tenants/:id/pair", requireTenantAccess, async (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: "החיבור לא נמצא" });
  try { res.json({ code: await s.pairingCode(req.body?.phone) }); }
  catch (e) { res.status(400).json({ error: e.message || "לא הצלחתי ליצור קוד, נסי שוב" }); }
});

// "החזר את הבוט לשיחה" — אחרי שיצא ממנה (ענית בעצמך) או נעצר (הצפה).
app.post("/api/tenants/:id/resume", requireTenantAccess, (req, res) => {
  const s = getSession(req.params.id);
  const key = String(req.body?.key || "");
  if (!s || !/^[\w.:-]+@(s\.whatsapp\.net|lid)$/.test(key)) return res.status(400).json({ error: "שיחה לא תקינה" });
  s.resumeChat(key);
  res.json({ ok: true });
});

// "צור לי שאלות ותשובות": מתוך תיאור העסק (טיוטה — לא נשמרת עד שלוחצים שמירה).
app.post("/api/tenants/:id/generate", requireTenantAccess, async (req, res) => {
  const t = getTenant(req.params.id);
  if (!t) return res.status(404).json({ error: "החיבור לא נמצא" });
  const p = sanitizeProfile(req.body?.profile || {}, t.profile);
  if (!(p.about || "").trim() && !(p.businessType || "").trim()) {
    return res.status(400).json({ error: "קודם כתבי במשפט-שניים מה העסק עושה (או את סוג העסק)" });
  }
  res.json(await generateDraft(p));
});

// "בדיקת תשובה": מקלידים הודעה כמו לקוח/ה ורואים מה הבוט יענה — בלי לשלוח בוואטסאפ.
// אפשר לבדוק גם טיוטה של פרופיל לפני שמירה. כל בדיקה מתחילה שיחה חדשה ולא נשמרת.
const previewChats = new Map();
app.post("/api/tenants/:id/preview", requireTenantAccess, async (req, res) => {
  const t = getTenant(req.params.id);
  if (!t) return res.status(404).json({ error: "החיבור לא נמצא" });
  const text = String(req.body?.text || "").trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: "כתבי הודעה לבדיקה" });
  const profile = req.body?.profile ? sanitizeProfile(req.body.profile, t.profile) : t.profile;
  const key = `${t.id}:${req.who.role}`;
  if (req.body?.reset || !previewChats.has(key)) {
    const holder = { p: profile };
    previewChats.set(key, { holder, brain: createBrain(() => holder.p) });
  }
  const pv = previewChats.get(key);
  pv.holder.p = profile; // תמיד לפי הטיוטה הנוכחית
  const out = await pv.brain.think("preview", text);
  res.json({ reply: out.reply, human: !!out.human, alert: !!out.alert, unanswered: !!out.unanswered, mode: aiState().mode });
});

// HubSpot: כל עסק מחבר את החשבון שלו. מנהלת המערכת לא מחברת CRM לחיבור פרטי של מישהו אחר.
app.post("/api/tenants/:id/hubspot", requireTenantAccess, async (req, res) => {
  const t = getTenant(req.params.id);
  if (!t) return res.status(404).json({ error: "החיבור לא נמצא" });
  if (req.who.role === "admin" && !t.adminOwned) return res.status(403).json({ error: "רק בעל/ת החיבור יכול/ה לחבר את ה-HubSpot שלו/ה" });
  const token = String(req.body?.token || "").trim();
  const v = await verifyToken(token);
  if (!v.ok) return res.status(400).json({ error: v.error });
  res.json({ tenant: setHubspot(t.id, token) });
});
app.delete("/api/tenants/:id/hubspot", requireTenantAccess, (req, res) => {
  const t = getTenant(req.params.id);
  if (!t) return res.status(404).json({ error: "החיבור לא נמצא" });
  if (req.who.role === "admin" && !t.adminOwned) return res.status(403).json({ error: "רק בעל/ת החיבור יכול/ה לנתק" });
  res.json({ tenant: setHubspot(t.id, null) });
});

// CRM נוסף (Pipedrive / monday / Fireberry / Webhook): בודקים שהחיבור עובד (קריאה) ורק אז שומרים.
app.post("/api/tenants/:id/crm", requireTenantAccess, async (req, res) => {
  const t = getTenant(req.params.id);
  if (!t) return res.status(404).json({ error: "החיבור לא נמצא" });
  if (req.who.role === "admin" && !t.adminOwned) return res.status(403).json({ error: "רק בעל/ת החיבור יכול/ה לחבר את ה-CRM שלו/ה" });
  const provider = String(req.body?.provider || "");
  if (!CRM_PROVIDERS[provider]) return res.status(400).json({ error: "בחרי מערכת CRM" });
  const cfg = { provider };
  for (const k of CRM_PROVIDERS[provider].fields) cfg[k] = String(req.body?.[k] || "").trim().slice(0, 500);
  if (cfg.token) cfg.token = cfg.token.replace(/\s/g, "");
  const v = await verifyCrm(cfg);
  if (!v.ok) return res.status(400).json({ error: v.error });
  if (v.extra?.phoneCol) cfg.phoneCol = v.extra.phoneCol;
  if (v.extra?.account) cfg.account = String(v.extra.account).slice(0, 80);
  res.json({ tenant: setCrm(t.id, cfg) });
});
app.delete("/api/tenants/:id/crm", requireTenantAccess, (req, res) => {
  const t = getTenant(req.params.id);
  if (!t) return res.status(404).json({ error: "החיבור לא נמצא" });
  if (req.who.role === "admin" && !t.adminOwned) return res.status(403).json({ error: "רק בעל/ת החיבור יכול/ה לנתק" });
  res.json({ tenant: setCrm(t.id, null) });
});

app.post("/api/tenants/:id/reset-code", requireAdmin, (req, res) => {
  const t = getTenant(req.params.id);
  if (!t) return res.status(404).json({ error: "החיבור לא נמצא" });
  const code = resetCode(t.id);
  const link = `${baseUrl(req)}/u/${t.id}`;
  res.json({ code, link, directLink: `${link}?c=${code}` });
});

app.delete("/api/tenants/:id", requireAdmin, async (req, res) => {
  if (!getTenant(req.params.id)) return res.status(404).json({ error: "החיבור לא נמצא" });
  await dropSession(req.params.id);
  removeTenant(req.params.id);
  res.json({ ok: true });
});

// התראה לקטי מסוכן (מאיה וכו'): טקסט + קולי, רק למספר של קטי. מוגן במפתח NOTIFY_KEY.
app.post("/api/notify", async (req, res) => {
  const key = String(req.get("x-notify-key") || "");
  const want = process.env.NOTIFY_KEY || "";
  const ok = want && key.length === want.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(want));
  if (!ok) return res.status(401).json({ error: "אין הרשאה" });
  const text = String(req.body?.text || "").trim().slice(0, 3000);
  if (!text) return res.status(400).json({ error: "חסר טקסט" });
  try {
    const out = await notifyOwner({ text, voice: req.body?.voice !== false, speech: req.body?.speech ? String(req.body.speech).slice(0, 3500) : undefined });
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.use((_req, res) => res.status(404).json({ error: "לא נמצא" }));

app.listen(PORT, () => {
  console.log(`[server] פועל על פורט ${PORT}`);
  const created = ensureDefaultTenant();
  if (created) console.log(`[server] נוצר חיבור ראשון: ${created.tenant.name} (${created.tenant.id})`);
  for (const t of listTenants()) {
    startSession(t.id).catch(e => console.error(`[${t.id}] start:`, e.message));
  }
  diagnoseOpenAI();
  startWatchdog();
});
