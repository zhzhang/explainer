import type { NextRequest } from "next/server";
import { pollExplainer } from "@/app/lib/pollExplainer";

/**
 * Polling endpoint for the in-flight explainer.yaml.
 *
 * This is a Route Handler (not a server action) on purpose: server actions
 * share a single client-side queue, so while a long-running action like
 * `invokeClaude` is pending, every queued poll is blocked until it finishes.
 * A plain `fetch` to this route bypasses that queue and lets the viewer
 * stream blocks in as Claude writes them.
 */
export async function GET(request: NextRequest) {
  const repo = request.nextUrl.searchParams.get("repo");
  if (!repo) {
    return Response.json(
      { error: "repo query param is required" },
      { status: 400 },
    );
  }

  try {
    const result = await pollExplainer(repo);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
