// התראות לקטי על ליד חם / בקשה לאדם / מצוקה.
// עד שתבנית ה-WhatsApp (lead_alert) מאושרת — שולחים מייל דרך Resend,
// ובכל מקרה רושמים בלוג (ונשמר בלוח הבקרה דרך ה-meta של השיחה).

import { Resend } from "resend";

const OWNER_EMAIL = process.env.OWNER_EMAIL || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const OWNER_NUMBER = (process.env.OWNER_NUMBER || "").replace(/\D/g, "");
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v21.0";
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || "";
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";
const TEMPLATE_NAME = process.env.LEAD_ALERT_TEMPLATE || ""; // ריק עד שהתבנית מאושרת

export type AlertKind = "hot" | "human" | "alert";

const LABEL: Record<AlertKind, string> = {
  hot: "🟡 ליד חם",
  human: "🟠 ביקש/ה אדם",
  alert: "🔴 מצוקה — דורש התייחסות מיידית",
};

export type LeadAlert = {
  kind: AlertKind;
  from: string; // מספר הפונה
  name?: string;
  summary: string; // מה כתב/ה
};

/** מפעיל את כל ערוצי ההתראה הזמינים. לעולם לא זורק — התראה שנכשלה לא תפיל בקשה. */
export async function notifyOwner(a: LeadAlert): Promise<void> {
  const title = LABEL[a.kind];
  console.log(`[alert] ${title} | מ:${a.from} ${a.name ? "(" + a.name + ")" : ""} | "${a.summary.slice(0, 80)}"`);

  // 1) תבנית WhatsApp מאושרת (מחוץ לחלון 24 השעות) — אם הוגדרה.
  if (TEMPLATE_NAME && OWNER_NUMBER && ACCESS_TOKEN && PHONE_NUMBER_ID) {
    try {
      await sendTemplate(a, title);
    } catch (e) {
      console.error("[alert] תבנית וואטסאפ נכשלה:", (e as Error).message);
    }
  }

  // 2) מייל דרך Resend — גיבוי אמין עד שהתבנית מאושרת.
  if (RESEND_API_KEY && OWNER_EMAIL) {
    try {
      const resend = new Resend(RESEND_API_KEY);
      await resend.emails.send({
        from: "CureBot <onboarding@resend.dev>",
        to: OWNER_EMAIL,
        subject: `${title} — CureBot`,
        text: `${title}\nמ: ${a.from}${a.name ? " (" + a.name + ")" : ""}\n\nכתבו:\n${a.summary}`,
      });
    } catch (e) {
      console.error("[alert] מייל נכשל:", (e as Error).message);
    }
  }
}

async function sendTemplate(a: LeadAlert, title: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: OWNER_NUMBER,
      type: "template",
      template: {
        name: TEMPLATE_NAME,
        language: { code: "he" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: a.name || a.from },
              { type: "text", text: a.from },
              { type: "text", text: title },
              { type: "text", text: a.summary.slice(0, 200) },
            ],
          },
        ],
      },
    }),
  });
  if (!res.ok) throw new Error(`template ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
