"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { synthesizeSpeech } from "../actions";
import type { ExplainerBlock } from "../types";
import MicIndicator from "./MicIndicator";

interface PlaybackControlsProps {
  blocks: ExplainerBlock[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

export default function PlaybackControls({
  blocks,
  currentIndex,
  onIndexChange,
}: PlaybackControlsProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioCache = useRef<Map<number, string>>(new Map());
  const wantToPlay = useRef(false);

  const total = blocks.length;
  const currentBlock = blocks[currentIndex];

  const prefetchAudio = useCallback(
    async (index: number): Promise<string | null> => {
      const block = blocks[index];
      if (!block) return null;
      const cached = audioCache.current.get(index);
      if (cached) return cached;
      try {
        const { audioBase64, mimeType } = await synthesizeSpeech(block.text);
        const url = base64ToBlobUrl(audioBase64, mimeType);
        audioCache.current.set(index, url);
        return url;
      } catch {
        return null;
      }
    },
    [blocks],
  );

  const loadAudio = useCallback(
    async (index: number): Promise<string | null> => {
      const cached = audioCache.current.get(index);
      if (cached) return cached;
      const block = blocks[index];
      if (!block) return null;
      setIsLoading(true);
      setError(null);
      try {
        const { audioBase64, mimeType } = await synthesizeSpeech(block.text);
        const url = base64ToBlobUrl(audioBase64, mimeType);
        audioCache.current.set(index, url);
        return url;
      } catch (err) {
        setError((err as Error).message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [blocks],
  );

  useEffect(() => {
    const cache = audioCache.current;
    return () => {
      for (const url of cache.values()) {
        URL.revokeObjectURL(url);
      }
      cache.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const audio = audioRef.current;
    if (!audio || !currentBlock) return;

    audio.pause();
    setProgress(0);
    setDuration(0);

    (async () => {
      const url = await loadAudio(currentIndex);
      if (cancelled || !url || !audioRef.current) return;
      audioRef.current.src = url;
      audioRef.current.load();
      if (wantToPlay.current) {
        try {
          await audioRef.current.play();
        } catch {
        }
      }
      if (blocks[currentIndex + 1]) {
        void prefetchAudio(currentIndex + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentIndex, currentBlock, blocks, loadAudio, prefetchAudio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnd = () => {
      setIsPlaying(false);
      if (currentIndex < total - 1) {
        wantToPlay.current = true;
        onIndexChange(currentIndex + 1);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [currentIndex, total, onIndexChange]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !currentBlock) return;
    if (audio.paused) {
      wantToPlay.current = true;
      if (!audio.src) {
        const url = await loadAudio(currentIndex);
        if (url) {
          audio.src = url;
          audio.load();
        }
      }
      try {
        await audio.play();
      } catch (err) {
        setError((err as Error).message);
      }
    } else {
      wantToPlay.current = false;
      audio.pause();
    }
  }, [currentBlock, currentIndex, loadAudio]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      wantToPlay.current = isPlaying;
      onIndexChange(currentIndex - 1);
    }
  }, [currentIndex, isPlaying, onIndexChange]);

  const goNext = useCallback(() => {
    if (currentIndex < total - 1) {
      wantToPlay.current = isPlaying;
      onIndexChange(currentIndex + 1);
    }
  }, [currentIndex, total, isPlaying, onIndexChange]);

  const replay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    wantToPlay.current = true;
    void audio.play();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        void togglePlay();
      } else if (e.code === "ArrowRight") {
        goNext();
      } else if (e.code === "ArrowLeft") {
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, goNext, goPrev]);

  const seekPct = duration > 0 ? (progress / duration) * 100 : 0;

  function formatTime(s: number) {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[#0c0c0e] backdrop-blur">
      <audio ref={audioRef} preload="auto" />
      <div className="max-w-7xl mx-auto px-6 py-3 grid grid-cols-3 items-center gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            {total > 0 ? `Block ${currentIndex + 1} of ${total}` : "No blocks"}
          </div>
          <div className="text-sm truncate text-[#e8e8ee]">
            {currentBlock?.file ?? "—"}
          </div>
          {error ? (
            <div className="text-[11px] text-[var(--del-fg)] truncate">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={currentIndex === 0}
              aria-label="Previous block"
              className="w-9 h-9 flex items-center justify-center rounded-full text-[#cfcfd6] hover:text-white disabled:opacity-30 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zM9.5 12l8.5 6V6z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={replay}
              aria-label="Replay current block"
              className="w-9 h-9 flex items-center justify-center rounded-full text-[#cfcfd6] hover:text-white transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={togglePlay}
              disabled={!currentBlock}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-[var(--accent)] text-black hover:scale-105 transition-transform disabled:opacity-40 disabled:hover:scale-100"
            >
              {isLoading && !isPlaying ? (
                <svg
                  className="animate-spin"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M21 12a9 9 0 1 1-6.2-8.55" />
                </svg>
              ) : isPlaying ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={currentIndex >= total - 1}
              aria-label="Next block"
              className="w-9 h-9 flex items-center justify-center rounded-full text-[#cfcfd6] hover:text-white disabled:opacity-30 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 w-full max-w-xl">
            <span className="text-[10px] tabular-nums text-[var(--muted)] w-9 text-right">
              {formatTime(progress)}
            </span>
            <div
              className="relative flex-1 h-1.5 bg-[#26262c] rounded-full overflow-hidden cursor-pointer"
              onClick={(e) => {
                const audio = audioRef.current;
                if (!audio || !duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                audio.currentTime = pct * duration;
              }}
            >
              <div
                className="absolute inset-y-0 left-0 bg-[var(--accent)]"
                style={{ width: `${seekPct}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-[var(--muted)] w-9">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4">
          <div className="flex items-center gap-1.5">
            {blocks.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  wantToPlay.current = isPlaying;
                  onIndexChange(i);
                }}
                aria-label={`Jump to block ${i + 1}`}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentIndex
                    ? "bg-[var(--accent)] w-6"
                    : i < currentIndex
                      ? "bg-[#4a4a52]"
                      : "bg-[#2a2a31] hover:bg-[#3a3a41]"
                }`}
              />
            ))}
          </div>
          <div className="h-6 w-px bg-[var(--border)]" aria-hidden="true" />
          <MicIndicator />
        </div>
      </div>
    </div>
  );
}
