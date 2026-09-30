# CureBot

הסוכן של CURE MINDSET בוואטסאפ. ארכיטקטורה ושכפול: `docs/ARCHITECTURE.md`.

## איך משנים דברים

- **אופי הסוכן, גבולות ובטיחות:** `lib/prompt.ts`
- **תוכן, שאלות נפוצות, התנגדויות, מה אסור לומר:** `lib/knowledge.ts`
- **כרטיס הסיום והודעת הגיבוי:** בסוף `lib/prompt.ts`

אחרי שינוי: שמירה בגיטהאב, ו-Vercel מעלה גרסה חדשה לבד.

## איך רואים לידים ומשהים

`https://<הכתובת שלך>/admin?key=<ADMIN_KEY>`

רשימת שיחות עם סימון (ליד חם, ביקש אדם, מצוקה, הסתיים), צפייה בשיחה, "השהה בוט" לשיחה בודדת, וכפתור השהיה כללית.

## איך רואים את הסוכן עובד בלי וואטסאפ

`https://<הכתובת שלך>/demo?key=<ADMIN_KEY>`

חמישה תרחישים בלחיצה: אמא של מתבגר עם חרדה, מחיר, סקפטית, רכזת בית ספר, מצוקה חריפה.

## הקמה (חד-פעמית)

1. **Vercel:** Add New → Project → לבחור את הריפו `curebot`, ולבחור את הענף `cloud-api` (Production Branch).
2. **Redis:** בפרויקט ב-Vercel, Storage → Upstash Redis → Create. המשתנים נוספים לבד.
3. **משתני סביבה:** Vercel → Project → Settings → Environment Variables. ההדבקה של המפתחות נעשית רק שם. הרשימה המלאה ב-`.env.example`. המינימום להפעלת הדמו: `ANTHROPIC_API_KEY`, `MODEL`, `ADMIN_KEY`.
4. **Meta:** אפליקציה, מספר וואטסאפ, טוקן קבוע של System User, ו-Webhook על הכתובת `/api/meta/webhook` עם `META_VERIFY_TOKEN`, מנוי לשדה `messages`.

## בדיקות

```
npm test
npx tsc --noEmit
npm run build
```
