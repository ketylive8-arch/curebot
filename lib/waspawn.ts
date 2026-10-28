// מפעיל את חיבור הוואטסאפ (wa/worker.mjs) כתהליך נפרד, ומרים אותו מחדש אם נפל.
// כבוי אם WA_ENABLED=0 או שאין Redis (שם נשמרים פרטי ההתחברות).
import { spawn } from "child_process";
import path from "path";

export function startWaWorker() {
  if (process.env.WA_ENABLED === "0" || !process.env.REDIS_URL) return;
  const run = () => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "wa", "worker.mjs")], { env: process.env, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) return; // נעצר בכוונה (למשל חיבור חדש תפס את המקום בעדכון גרסה)
      console.error(`[wa] התהליך נפל (קוד ${code}) — מפעיל מחדש בעוד 10 שניות`);
      setTimeout(run, 10000);
    });
  };
  run();
}
