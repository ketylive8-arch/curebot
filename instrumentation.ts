// רץ פעם אחת בעליית השרת.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logDigest } = await import("./lib/digest");
  setTimeout(() => logDigest().catch((e) => console.error("[digest]", (e as Error).message)), 3000);
  const { startWaWorker } = await import("./lib/waspawn");
  setTimeout(() => startWaWorker(), 5000);
}
