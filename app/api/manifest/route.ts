// מניפסט לאפליקציה במסך הבית. כשקטי מוסיפה את לוח הבקרה למסך הבית, האייקון נפתח
// ישר ללוח (עם המפתח שלה), בלי לבקש ממנה קוד כניסה. המפתח נבדק מול ADMIN_KEY.
import { NextRequest } from "next/server";

export const runtime = "nodejs";
const ADMIN_KEY = process.env.ADMIN_KEY || "";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || "";
  const start = ADMIN_KEY && key === ADMIN_KEY ? `/admin?key=${encodeURIComponent(key)}` : "/admin";
  return new Response(
    JSON.stringify({
      name: "CureBot · CURE MINDSET",
      short_name: "CureBot",
      description: "לוח הבקרה של העוזרת הדיגיטלית של קטי שגב",
      start_url: start,
      scope: "/",
      display: "standalone",
      dir: "rtl",
      lang: "he",
      background_color: "#f5f1ea",
      theme_color: "#8a6a2f",
      icons: [
        { src: "/icon.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
        { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    }),
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } },
  );
}
