import { resetSessionState } from "@/app/lib/resetSessionState";

export async function POST(request: Request) {
  let repoPath: string | undefined;
  try {
    const body = (await request.json()) as { repoPath?: unknown };
    if (typeof body?.repoPath === "string") {
      repoPath = body.repoPath;
    }
  } catch {}

  try {
    const result = await resetSessionState(repoPath);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
