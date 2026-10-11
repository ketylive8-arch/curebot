import { redirect } from "next/navigation";

// הכתובת הראשית מובילה לדף ההדגמה הציבורי, כדי שאפשר לשלוח ללקוחות קישור אחד קצר.
export default function Home() {
  redirect("/try");
}
