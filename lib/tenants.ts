// מערכת הלקוחות: כל לקוח (עסק) מקבל בוט משלו — אותו מוח של CureBot, עם ההגדרות
// שהלקוח מילא בשאלון. ההגדרות נשמרות ב-Redis ומהן נבנה הפרומפט; אין קוד נפרד ללקוח.
import { randomBytes } from "crypto";
import { kv } from "./kv";

export type Tenant = {
  id: string;
  adminKey: string; // מפתח הניהול של הלקוח (לוח הבקרה שלו)
  created: number;
  updated: number;
  status: "draft" | "live";
  // פרטי העסק
  business: string;
  owner: string;
  phone: string;
  email: string;
  website: string;
  // השאלון
  about: string;
  audience: string;
  goal: string;
  services: string;
  prices: string;
  booking: string;
  location: string;
  tone: string;
  faq: string;
  limits: string;
};

export type Field = { key: keyof Tenant; label: string; hint: string; long?: boolean };

// פרטי בסיס (למעלה בטופס)
export const BASIC: Field[] = [
  { key: "business", label: "שם העסק", hint: "כפי שהלקוחות מכירים אותו" },
  { key: "owner", label: "שם בעל/ת העסק", hint: "הבוט יציג את עצמו כעוזר/ת הדיגיטלי/ת של השם הזה" },
  { key: "phone", label: "טלפון לחזרה ללקוחות", hint: "למשל 050-1234567" },
  { key: "email", label: "מייל", hint: "לא חובה" },
  { key: "website", label: "אתר", hint: "לא חובה" },
];

// עשר השאלות — אותו שאלון לכל עסק
export const QUESTIONS: Field[] = [
  { key: "about", label: "1. מה העסק עושה?", hint: "במשפט או שניים, במילים שלך", long: true },
  { key: "audience", label: "2. מי פונה אלייך בדרך כלל?", hint: "למשל: הורים לבני נוער, נשים אחרי לידה, בעלי עסקים קטנים", long: true },
  { key: "goal", label: "3. מה המטרה של הבוט בשיחה?", hint: "למשל: להרגיע ולקבוע שיחת היכרות, לאסוף שם וטלפון, לענות על שאלות", long: true },
  { key: "services", label: "4. אילו שירותים או תוכניות יש?", hint: "שם, למי זה מתאים, משך, פורמט. כל שירות בשורה", long: true },
  { key: "prices", label: "5. מה עונים כששואלים כמה זה עולה?", hint: "מחיר מדויק, טווח, או \"נדבר על זה בשיחה\"", long: true },
  { key: "booking", label: "6. איך קובעים פגישה?", hint: "קישור ליומן (Calendly וכדומה) או \"נחזור אלייך\"" },
  { key: "location", label: "7. איפה ומתי?", hint: "עיר / זום / פרונטלי, ימים ושעות פעילות", long: true },
  { key: "tone", label: "8. איך את/ה מדבר/ת עם לקוחות?", hint: "חם, ענייני, הומוריסטי... אפשר להדביק הודעה אמיתית ששלחת ללקוח", long: true },
  { key: "faq", label: "9. השאלות שחוזרות הכי הרבה — ומה עונים?", hint: "שאלה ותשובה, כל אחת בשורה", long: true },
  { key: "limits", label: "10. מה אסור לבוט להגיד, ומתי להעביר אלייך מיד?", hint: "למשל: לא לתת ייעוץ רפואי, להעביר מיד כשמבקשים החזר", long: true },
];

const id6 = () => randomBytes(4).toString("hex").slice(0, 6);
const secret = () => randomBytes(12).toString("hex");

export async function createTenant(business = ""): Promise<Tenant> {
  const now = Date.now();
  const t: Tenant = {
    id: id6(), adminKey: secret(), created: now, updated: now, status: "draft",
    business, owner: "", phone: "", email: "", website: "",
    about: "", audience: "", goal: "", services: "", prices: "", booking: "", location: "", tone: "", faq: "", limits: "",
  };
  await kv.set(`studio:tenant:${t.id}`, t);
  await kv.zadd("studio:tenants", now, t.id);
  return t;
}

export async function getTenant(id: string): Promise<Tenant | null> {
  if (!/^[a-f0-9]{6}$/.test(id)) return null;
  return kv.get<Tenant>(`studio:tenant:${id}`);
}

export async function listTenants(): Promise<Tenant[]> {
  const ids = await kv.zrevrange("studio:tenants", 200);
  const all = await Promise.all(ids.map((id) => getTenant(id)));
  return all.filter((t): t is Tenant => !!t);
}

const EDITABLE = [...BASIC, ...QUESTIONS].map((f) => f.key);

export async function updateTenant(t: Tenant, patch: Partial<Tenant>): Promise<Tenant> {
  const next = { ...t } as Record<string, unknown>;
  for (const k of EDITABLE) {
    const v = (patch as Record<string, unknown>)[k];
    if (typeof v === "string") next[k] = v.slice(0, 4000);
  }
  if (patch.status === "live" || patch.status === "draft") next.status = patch.status;
  next.updated = Date.now();
  await kv.set(`studio:tenant:${t.id}`, next);
  return next as Tenant;
}

/** מפתח הלקוח או מפתח הניהול של קטי (ADMIN_KEY) פותחים את הניהול. */
export function canManage(t: Tenant, key: string | null): boolean {
  if (!key) return false;
  return key === t.adminKey || (!!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY);
}

export function publicView(t: Tenant) {
  return { id: t.id, business: t.business, owner: t.owner, status: t.status };
}

const line = (label: string, v: string) => (v.trim() ? `${label}:\n${v.trim()}\n` : "");

/** הפרומפט של הלקוח — אותו שלד של CureBot (קצר, אנושי, שאלה אחת), עם התוכן שלו. */
export function buildTenantPrompt(t: Tenant): string {
  const owner = t.owner.trim() || "בעל/ת העסק";
  const biz = t.business.trim() || "העסק";
  return `את/ה העוזר/ת הדיגיטלי/ת של ${owner} מ"${biz}". עונים לפונים בצ'אט ובוואטסאפ, בשם העסק.
את/ה לא ${owner} ולא מתחזה ל${owner}. אם שואלים — אומרים בפשטות שזה עוזר/ת דיגיטלי/ת, ו${owner} זמינ/ה להמשך.

=== מה שצריך לדעת על העסק (מקור האמת היחיד) ===
${line("מה העסק עושה", t.about)}${line("מי פונה", t.audience)}${line("שירותים ותוכניות", t.services)}${line("מחירים — מה עונים", t.prices)}${line("קביעת פגישה", t.booking)}${line("מיקום ושעות", t.location)}${line("שאלות נפוצות ותשובות", t.faq)}${line("טלפון", t.phone)}${line("אתר", t.website)}
=== המטרה בשיחה ===
${t.goal.trim() || `להבין מה הפונה צריך, לענות בקצרה, ולחבר אותו ל${owner} (פגישה או שיחה חוזרת).`}

=== הסגנון ===
${t.tone.trim() ? `כך ${owner} מדבר/ת עם לקוחות — כותבים באותה רוח (לא מעתיקים משפטים):\n${t.tone.trim()}\n` : ""}- עברית של יום-יום, חמה וישירה. 1–3 משפטים בהודעה, כמו הודעת וואטסאפ.
- שאלה אחת בכל הודעה, ספציפית ואמיתית. לא "ספר/י לי עוד".
- בלי רשימות, כוכביות וכותרות. בלי שפה שיווקית ובלי התלהבות מזויפת.
- משתמשים במילים של הפונה. לא פותחים כל הודעה באותה צורה.
- פונים בלשון שמתאימה לפונה; אם לא ידוע — בניסוח ניטרלי.

=== מה אסור ===
- להמציא פרטים שלא כתובים למעלה (מחירים, שעות, משכים, הבטחות). אם אין מידע — אומרים ש${owner} יחזור/תחזור עם תשובה, ומבקשים שם וטלפון.
- להבטיח תוצאות.
${t.limits.trim() ? t.limits.trim() + "\n" : ""}
=== פרטים לחזרה ===
כשיש עניין (רוצה פגישה, שואל/ת על מחיר או התאמה), ואחרי שהבנת במה מדובר — מבקשים בעדינות פעם אחת שם ומספר טלפון כדי ש${owner} יחזור/תחזור. לא לוחצים.

=== בטיחות ===
אם מישהו כותב במפורש על רצון למות, פגיעה עצמית או סכנה מיידית — עונים בחום ובקצרה, מפנים לער"ן 1201 (24/7) או למד"א 101 בסכנה מיידית, ואומרים ש${owner} יקבל/תקבל הודעה. בסוף הודעה כזו, בשורה נפרדת: [[ALERT]].

=== סמנים (לא מופיעים בשום מצב אחר, תמיד בשורה נפרדת) ===
- מבקשים לדבר עם ${owner} או עם בן אדם, או שהמקרה דורש את ${owner} — עונים שמעבירים, ומוסיפים [[HUMAN]].
- השיחה הגיעה לסיום טבעי (נקבעה פגישה, נפרדו, אין התאמה) — מוסיפים [[END]]. לא כותבים בעצמך קישורים ופרטי קשר בסיום; המערכת שולחת אותם.`;
}

/** כרטיס הסיום של הלקוח — נשלח פעם אחת אחרי [[END]]. */
export function closingCard(t: Tenant): string {
  return [
    [t.business, t.owner].filter((s) => s.trim()).join(" · "),
    t.website.trim() && `🌐 ${t.website.trim()}`,
    /^https?:\/\//.test(t.booking.trim()) && `📅 קביעת פגישה: ${t.booking.trim()}`,
    t.phone.trim() && `📞 ${t.phone.trim()}`,
  ].filter(Boolean).join("\n");
}

/** כמה מהשאלון מולא — לסרגל ההתקדמות. */
export function completeness(t: Tenant): number {
  const keys = ["business", "owner", "phone", ...QUESTIONS.map((q) => q.key)] as (keyof Tenant)[];
  return Math.round((keys.filter((k) => String(t[k] || "").trim()).length / keys.length) * 100);
}
