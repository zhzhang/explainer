export const ttsCache = new Map<string, string>();

export function clearTtsCache(): number {
  const count = ttsCache.size;
  ttsCache.clear();
  return count;
}
