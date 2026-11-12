// ============================================================
//  אבטחה: כניסה בקוד, עוגיית התחברות חתומה, הגבלת ניסיונות, כותרות הגנה.
//  - מנהלת (קטי): ADMIN_CODE (או PANEL_KEY הקיים). רואה ומנהלת את כל החיבורים.
//  - משתמש/ת: קוד 6 ספרות אישי. רואה רק את החיבור שלו/ה.
// ============================================================
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { DATA_DIR, findByCode } from "./tenants.js";

const ADMIN_CODE = process.env.ADMIN_CODE || process.env.PANEL_KEY || "";
const COOKIE = "cb_s";
const MAX_AGE_S = 30 * 24 * 3600; // 30 יום — לא צריך להתחבר כל פעם

// סוד החתימה: מהגדרות השרת, אחרת נוצר פעם אחת ונשמר בדיסק הקבוע.
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA_DIR, "session.secret");
  try { return fs.readFileSync(f, "utf8").trim(); } catch { /* ignore */ }
  const s = crypto.randomBytes(32).toString("hex");
  try { fs.writeFileSync(f, s, { mode: 0o600 }); } catch { /* ignore */ }
  return s;
}
const SECRET = loadSecret();

const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (data) => crypto.createHmac("sha256", SECRET).update(data).digest("base64url");

function makeToken(payload) {
  const data = b64(JSON.stringify({ ...payload, exp: Date.now() + MAX_AGE_S * 1000 }));
  return `${data}.${sign(data)}`;
}
function readToken(tok) {
  if (!tok || !tok.includes(".")) return null;
  const [data, sig] = tok.split(".");
  const good = sign(data);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSession(res, payload) {
  const secure = process.env.NODE_ENV !== "development";
  res.setHeader("Set-Cookie",
    `${COOKIE}=${encodeURIComponent(makeToken(payload))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure ? "; Secure" : ""}`);
}
export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** מצרף לבקשה את זהות המשתמש (req.who): {role:"admin"} | {role:"tenant", t:id} | null */
export function identify(req, _res, next) {
  req.who = readToken(parseCookies(req)[COOKIE]);
  next();
}

function eqCode(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** בודק קוד: מנהלת או משתמש/ת. tenantId אופציונלי (מגיע מהקישור האישי). */
export function login(code, tenantId) {
  const c = String(code || "").trim();
  if (!c) return null;
  if (ADMIN_CODE && eqCode(c, ADMIN_CODE)) return { role: "admin" };
  const t = findByCode(c.replace(/\s/g, ""), tenantId || undefined);
  return t ? { role: "tenant", t: t.id } : null;
}

// הגבלת ניסיונות כניסה: 8 ניסיונות כושלים ל-15 דקות לכל כתובת IP.
const attempts = new Map();
export function loginAllowed(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now > a.until) return true;
  return a.n < 8;
}
export function loginFailed(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now > a.until) attempts.set(ip, { n: 1, until: now + 15 * 60 * 1000 });
  else a.n++;
}
export function loginOk(ip) { attempts.delete(ip); }

export const requireAdmin = (req, res, next) =>
  req.who?.role === "admin" ? next() : res.status(401).json({ error: "נדרשת כניסת מנהלת" });

/** גישה לחיבור מסוים: מנהלת — לכל חיבור; משתמש/ת — רק לחיבור שלו/ה. */
export const requireTenantAccess = (req, res, next) => {
  const w = req.who;
  if (w?.role === "admin" || (w?.role === "tenant" && w.t === req.params.id)) return next();
  res.status(401).json({ error: "אין הרשאה לחיבור הזה" });
};

/** כותרות אבטחה + מזהה חד-פעמי (nonce) לסקריפט של הדף */
export function securityHeaders(req, res, next) {
  res.locals.nonce = crypto.randomBytes(16).toString("base64");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Content-Security-Policy",
    `default-src 'self'; script-src 'nonce-${res.locals.nonce}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ` +
    `font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
  next();
}
