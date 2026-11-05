// ============================================================
//  אחסון המשרד — לקוחות ופגישות על הדיסק.
//  עד עכשיו כל הנתונים חיו בזיכרון ונמחקו בכל הפעלה מחדש.
//  כאן הם נשמרים בקובץ אחד (DATA_DIR/office.json) ושורדים ניתוקים,
//  עדכונים וקריסות — כדי שהסוכן באמת ינהל לקוחות ולא רק ישיב.
// ============================================================
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "office.json");

function empty() {
  return { clients: {}, appointments: [] };
}

let data = null;
let timer = null;

function load() {
  if (data) return data;
  try {
    data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (!data.clients) data.clients = {};
    if (!Array.isArray(data.appointments)) data.appointments = [];
  } catch {
    data = empty();
  }
  return data;
}

export function getData() {
  return load();
}

// שמירה מרוכזת (400ms) וכתיבה אטומית — כדי שכל הודעה לא תכתוב קובץ מחדש,
// ושקריסה באמצע כתיבה לא תשאיר קובץ פגום.
export function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.error("[store] שמירה נכשלה:", e.message);
    }
  }, 400);
}
