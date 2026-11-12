// ============================================================
//  רשימת החיבורים (משתמשים) — כל חיבור = מספר וואטסאפ אחד + קוד גישה משלו.
//  נשמר בדיסק הקבוע (DATA_DIR/tenants.json). קודי הגישה נשמרים רק כ-hash
//  (scrypt), כך שגם מי שרואה את הקובץ לא יכול לשחזר אותם.
// ============================================================
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const DATA_DIR = process.env.DATA_DIR || (fs.existsSync("/data") ? "/data" : path.join(process.cwd(), "data"));
const FILE = path.join(DATA_DIR, "tenants.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; }
}
function save(list) {
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, FILE); // כתיבה אטומית — לא משאירה קובץ חצי-כתוב
}

let tenants = load();

export function hashCode(code) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(code), salt, 32).toString("hex");
  return `${salt}:${hash}`;
}
export function checkCode(code, stored) {
  if (!stored || !code) return false;
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(code), salt, 32);
  const real = Buffer.from(hash, "hex");
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}
function newCode() {
  // 6 ספרות — קל להקליד בטלפון, מוגן בהגבלת ניסיונות בשרת.
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}
function normPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  return d.startsWith("972") ? d : "972" + d.replace(/^0/, "");
}

/** מה שמותר להחזיר לדפדפן — בלי ה-hash של הקוד */
export function publicTenant(t) {
  if (!t) return null;
  const { codeHash, ...rest } = t;
  return rest;
}

export const listTenants = () => tenants.map(publicTenant);
export const getTenant = (id) => tenants.find(t => t.id === id) || null;
export const authDirOf = (id) => path.join(DATA_DIR, "tenants", id, "auth");

export function createTenant({ name, ownerNumber }) {
  const id = crypto.randomBytes(5).toString("hex");
  const code = newCode();
  const t = {
    id,
    name: String(name || "חיבור חדש").slice(0, 60),
    ownerNumber: normPhone(ownerNumber),
    codeHash: hashCode(code),
    settings: { active: true, onlyNonContacts: true },
    createdAt: new Date().toISOString()
  };
  tenants.push(t);
  save(tenants);
  return { tenant: publicTenant(t), code };
}

export function updateTenant(id, patch) {
  const t = getTenant(id);
  if (!t) return null;
  if (typeof patch.name === "string" && patch.name.trim()) t.name = patch.name.trim().slice(0, 60);
  if (patch.ownerNumber !== undefined) t.ownerNumber = normPhone(patch.ownerNumber);
  if (patch.settings && typeof patch.settings === "object") {
    for (const k of ["active", "onlyNonContacts"]) {
      if (typeof patch.settings[k] === "boolean") t.settings[k] = patch.settings[k];
    }
  }
  save(tenants);
  return publicTenant(t);
}

export function resetCode(id) {
  const t = getTenant(id);
  if (!t) return null;
  const code = newCode();
  t.codeHash = hashCode(code);
  save(tenants);
  return code;
}

export function removeTenant(id) {
  tenants = tenants.filter(t => t.id !== id);
  save(tenants);
  try { fs.rmSync(path.join(DATA_DIR, "tenants", id), { recursive: true, force: true }); } catch { /* ignore */ }
}

/** מוצא את החיבור שהקוד שייך לו (לכניסה עם קוד בלבד). */
export function findByCode(code, id) {
  const pool = id ? tenants.filter(t => t.id === id) : tenants;
  return pool.find(t => checkCode(code, t.codeHash)) || null;
}

/** בפעם הראשונה: יוצרים את החיבור של קטי, כדי שהמערכת לא תיפתח ריקה. */
export function ensureDefaultTenant() {
  if (tenants.length) return null;
  return createTenant({ name: "קטי שגב · CURE MINDSET", ownerNumber: process.env.OWNER_NUMBER || "972543032349" });
}
