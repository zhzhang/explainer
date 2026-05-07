import { transcribeSpeechFromBlob } from "@/app/lib/transcribeSpeech";

/**
 * Speech-to-text for push-to-talk clarifications (ElevenLabs).
 * Accepts multipart form with field `audio` (Blob/File).
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Body must be multipart form-data." }, {
      status: 400,
    });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return Response.json(
      { error: "Form field 'audio' must be a file or blob." },
      { status: 400 },
    );
  }

  try {
    const transcript = await transcribeSpeechFromBlob(audio);
    return Response.json({ transcript }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
