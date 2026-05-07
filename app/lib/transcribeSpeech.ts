import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

function extractTranscript(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  if (typeof d.text === "string" && d.text.trim()) return d.text.trim();
  const transcripts = d.transcripts;
  if (Array.isArray(transcripts) && transcripts.length > 0) {
    const first = transcripts[0] as Record<string, unknown> | undefined;
    if (first && typeof first.text === "string" && first.text.trim()) {
      return first.text.trim();
    }
  }
  return "";
}

/**
 * Transcribes a short voice clip via ElevenLabs speech-to-text (scribe_v2).
 */
export async function transcribeSpeechFromBlob(blob: Blob): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to .env.local and restart the dev server.",
    );
  }
  if (!blob || blob.size < 100) {
    throw new Error("Recording too short — hold the key a little longer.");
  }

  const client = new ElevenLabsClient({ apiKey });
  const data = await client.speechToText.convert({
    file: blob,
    modelId: "scribe_v2",
  });

  const text = extractTranscript(data);
  if (!text) {
    throw new Error("Transcription returned empty text.");
  }
  return text;
}
