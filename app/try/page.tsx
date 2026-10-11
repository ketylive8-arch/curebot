import ChatDemo from "@/components/ChatDemo";

export const metadata = { title: "CureBot · CURE MINDSET" };

// דף ציבורי להצגה ללקוחות: אותו מוח כמו בוואטסאפ, בלי מפתח, עם הגבלת קצב בשרת.
export default function Try() {
  return (
    <ChatDemo
      endpoint="/api/try"
      needKey={false}
      title="CureBot · CURE MINDSET"
      subtitle="העוזרת הדיגיטלית של קטי שגב"
      note="זו הדגמה של העוזרת הדיגיטלית שעונה בוואטסאפ של הקליניקה. אין צורך לשתף פרטים אישיים. במצב חירום: ער״ן 1201."
    />
  );
}
