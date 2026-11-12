// ============================================================
//  CureBot — מערכת חיבורי וואטסאפ (מרובת משתמשים), בסגנון Base44.
//  קטי (מנהלת) רואה ומנהלת את כל החיבורים; כל משתמש/ת נכנס/ת בקישור + קוד
//  ורואה רק את החיבור שלו/ה. כל חיבור = מספר וואטסאפ אחד בסריקת QR.
// ============================================================
import express from "express";
import { page } from "./ui.js";
import { identify, login, setSession, clearSession, loginAllowed, loginFailed, loginOk, requireAdmin, requireTenantAccess, securityHeaders } from "./auth.js";
import { listTenants, getTenant, createTenant, updateTenant, resetCode, removeTenant, publicTenant, ensureDefaultTenant } from "./tenants.js";
import { startSession, getSession, dropSession } from "./session.js";
import { aiState, diagnoseOpenAI } from "./brain.js";

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
app.get("/health", (_req, res) => res.json({ ok: true }));

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
  const { tenant, code } = createTenant({ name: req.body?.name, ownerNumber: req.body?.ownerNumber });
  startSession(tenant.id).catch(e => console.error(`[${tenant.id}] start:`, e.message));
  const link = `${baseUrl(req)}/u/${tenant.id}`;
  res.json({ tenant, code, link, directLink: `${link}?c=${code}` });
});

app.get("/api/tenants/:id", requireTenantAccess, (req, res) => {
  const t = getTenant(req.params.id);
  if (!t) return res.status(404).json({ error: "החיבור לא נמצא" });
  res.json({ tenant: publicTenant(t), status: statusOf(t.id), ai: aiState() });
});

app.patch("/api/tenants/:id", requireTenantAccess, (req, res) => {
  const t = updateTenant(req.params.id, req.body || {});
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

app.use((_req, res) => res.status(404).json({ error: "לא נמצא" }));

app.listen(PORT, () => {
  console.log(`[server] פועל על פורט ${PORT}`);
  const created = ensureDefaultTenant();
  if (created) console.log(`[server] נוצר חיבור ראשון: ${created.tenant.name} (${created.tenant.id})`);
  for (const t of listTenants()) {
    startSession(t.id).catch(e => console.error(`[${t.id}] start:`, e.message));
  }
  diagnoseOpenAI();
});
