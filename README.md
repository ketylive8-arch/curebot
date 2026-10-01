# CureBot

הסוכן של CURE MINDSET בוואטסאפ. ארכיטקטורה ושכפול: `docs/ARCHITECTURE.md`.

## איך משנים דברים

- **אופי הסוכן, גבולות ובטיחות:** `lib/prompt.ts`
- **תוכן, שאלות נפוצות, התנגדויות, מה אסור לומר:** `lib/knowledge.ts`
- **כרטיס הסיום והודעת הגיבוי:** בסוף `lib/prompt.ts`

אחרי שינוי: שמירה בגיטהאב, ו-Render מעלה גרסה חדשה לבד.

## איך רואים לידים ומשהים

`https://<הכתובת שלך>/admin?key=<ADMIN_KEY>`

רשימת שיחות עם סימון (ליד חם, ביקש אדם, מצוקה, הסתיים), צפייה בשיחה, "השהה בוט" לשיחה בודדת, וכפתור השהיה כללית.

## איך רואים את הסוכן עובד בלי וואטסאפ

`https://<הכתובת שלך>/demo?key=<ADMIN_KEY>`

חמישה תרחישים בלחיצה: אמא של מתבגר עם חרדה, מחיר, סקפטית, רכזת בית ספר, מצוקה חריפה.

## הקמה

**איפה זה רץ כרגע:** Render, שירות `curebot-agent` (ענף `cloud-api`). שינוי בגיטהאב מעלה גרסה חדשה לבד.

**משתני סביבה:** Render → השירות → Environment. הרשימה המלאה ב-`.env.example` וב-`render.yaml`.
- להפעלת הדמו והלוח: `ANTHROPIC_API_KEY`, `MODEL`, `ADMIN_KEY`.
- לוואטסאפ: `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, ובשדה Webhook של Meta הכתובת `https://<הכתובת>/api/meta/webhook`.
- לזיכרון קבוע: `UPSTASH_REDIS_REST_URL` ו-`UPSTASH_REDIS_REST_TOKEN`. בלעדיהם הזיכרון וההשהיות מתאפסים בכל הפעלה מחדש, ובתוכנית החינמית של Render השרת נרדם אחרי 15 דקות בלי פניות.

**שכפול לעסק אחר:** Render → New → Blueprint → הריפו. `render.yaml` מגדיר הכול. אחר כך מחליפים את `lib/prompt.ts` ו-`lib/knowledge.ts`.

**Vercel במקום Render:** אפשרי. הקוד אותו קוד (Next.js), והמשתנים אותם משתנים.

## בדיקות

```
npm test
npx tsc --noEmit
npm run build
```
