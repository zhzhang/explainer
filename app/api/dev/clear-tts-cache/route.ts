import { clearTtsCache } from "@/app/lib/ttsCache";

export function DELETE() {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const cleared = clearTtsCache();
  return Response.json({ cleared });
}
