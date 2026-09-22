import type { ReactNode } from "react";

export const metadata = {
  title: "CURE MINDSET · CureBot",
  description: "המענה הדיגיטלי של הקליניקה",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Arial, sans-serif", background: "#f5f1ea", color: "#2b2723" }}>
        {children}
      </body>
    </html>
  );
}
