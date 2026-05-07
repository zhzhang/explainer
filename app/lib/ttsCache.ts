export const ttsCache = new Map<string, Uint8Array<ArrayBuffer>>();

export function clearTtsCache(): number {
  const count = ttsCache.size;
  ttsCache.clear();
  return count;
}
