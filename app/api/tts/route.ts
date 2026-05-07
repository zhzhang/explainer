import { synthesizeSpeech } from "@/app/lib/synthesizeSpeech";

/**
 * Text-to-speech endpoint backed by ElevenLabs.
 *
 * This is a Route Handler (not a server action) so playback can request
 * audio while a long-running server action like `invokeClaude` is in flight.
 * Server actions all share a single client-side queue; plain `fetch`es do
 * not, so the play button can't get stuck behind generation.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const text =
    typeof body === "object" && body !== null && "text" in body
      ? (body as { text: unknown }).text
      : undefined;

  if (typeof text !== "string" || !text.trim()) {
    return Response.json(
      { error: "Body must include a non-empty 'text' string." },
      { status: 400 },
    );
  }

  try {
    const { audio, mimeType } = await synthesizeSpeech(text);
    return new Response(new Blob([audio], { type: mimeType }), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
