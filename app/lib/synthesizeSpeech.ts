import { createHash } from "node:crypto";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { ttsCache } from "./ttsCache";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_flash_v2_5";
const MAX_CACHE_ENTRIES = 200;

export interface SynthesizedSpeech {
  audio: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

/**
 * Synthesizes a single TTS clip via ElevenLabs and caches the bytes by
 * (voice, model, text) hash. The cache is process-local and cleared via the
 * `/api/dev/clear-tts-cache` route handler in development.
 */
export async function synthesizeSpeech(
  text: string,
): Promise<SynthesizedSpeech> {
  if (!text || typeof text !== "string" || !text.trim()) {
    throw new Error("text is required");
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to .env.local and restart the dev server.",
    );
  }

  const hash = createHash("sha256")
    .update(`${DEFAULT_VOICE_ID}::${DEFAULT_MODEL_ID}::${text}`)
    .digest("hex");

  const cached = ttsCache.get(hash);
  if (cached) {
    return { audio: cached, mimeType: "audio/mpeg" };
  }

  const client = new ElevenLabsClient({ apiKey });
  const stream = await client.textToSpeech.convert(DEFAULT_VOICE_ID, {
    text,
    modelId: DEFAULT_MODEL_ID,
    outputFormat: "mp3_44100_128",
  });

  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }

  if (ttsCache.size > MAX_CACHE_ENTRIES) {
    const firstKey = ttsCache.keys().next().value;
    if (firstKey) ttsCache.delete(firstKey);
  }
  ttsCache.set(hash, merged);

  return { audio: merged, mimeType: "audio/mpeg" };
}
