import ChatDemo from "@/components/ChatDemo";

export const metadata = { title: "העוזרת של קטי שגב" };

// חלון שיחה קומפקטי שמוטמע באתר ketysegev.com (בתוך iframe). אותו מוח ואותן מגבלות כמו /try.
export default function Embed() {
  return (
    <ChatDemo
      endpoint="/api/try"
      needKey={false}
      compact
      title="העוזרת של קטי שגב"
      subtitle="CURE MINDSET · עונה עכשיו"
      note="אין צורך לשתף פרטים אישיים. במצב חירום: ער״ן 1201."
    />
  );
}
