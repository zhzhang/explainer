"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMicrophoneLevel } from "../lib/useMicrophoneLevel";

const NUM_BARS = 5;

interface MicIndicatorProps {
  /** Block index (0-based outer list) at the moment PTT is activated. */
  activationBlockGroupIndex: number;
  /** Fired after release with the block index captured at activation and the recorded audio. */
  onPttRecordingComplete?: (
    blockIndex: number,
    blob: Blob,
  ) => void | Promise<void>;
  /** When true, PTT is ignored (e.g. long-running clarification). */
  disabled?: boolean;
  /** Spinner to the right of the hotkey while STT / Claude clarification runs. */
  clarificationLoading?: boolean;
}

// The "tilde" key — same physical key as backtick on US keyboards. Using
// `event.code` so it works regardless of whether Shift is held.
const PTT_KEY_CODE = "Backquote";

type PressSource = "key" | "pointer";

export default function MicIndicator({
  activationBlockGroupIndex,
  onPttRecordingComplete,
  disabled = false,
  clarificationLoading = false,
}: MicIndicatorProps) {
  const latestGroupIndexRef = useRef(activationBlockGroupIndex);
  useEffect(() => {
    latestGroupIndexRef.current = activationBlockGroupIndex;
  }, [activationBlockGroupIndex]);

  const blockIndexAtActivationRef = useRef(activationBlockGroupIndex);

  const micOpts = useMemo(
    () =>
      onPttRecordingComplete && !disabled
        ? {
            onRecording: (blob: Blob) => {
              void onPttRecordingComplete(
                blockIndexAtActivationRef.current,
                blob,
              );
            },
          }
        : {},
    [onPttRecordingComplete, disabled],
  );

  const { isActive, isStarting, level, error, start, stop } =
    useMicrophoneLevel(micOpts);

  // Track every input that is currently asking for the mic to be live.
  // The mic stays open until *all* sources are released.
  const heldSources = useRef<Set<PressSource>>(new Set());

  useEffect(() => {
    if (!disabled) return;
    heldSources.current.clear();
    stop();
  }, [disabled, stop]);

  const press = useCallback(
    (source: PressSource) => {
      if (disabled) return;
      if (heldSources.current.has(source)) return;
      heldSources.current.add(source);
      blockIndexAtActivationRef.current = latestGroupIndexRef.current;
      void start();
    },
    [disabled, start],
  );

  const release = useCallback(
    (source: PressSource) => {
      if (!heldSources.current.delete(source)) return;
      if (heldSources.current.size === 0) {
        stop();
      }
    },
    [stop],
  );

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable) return true;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.code !== PTT_KEY_CODE) return;
      if (isTypingTarget(e.target)) return;
      // Suppress key auto-repeat — we only care about the initial press.
      if (e.repeat) return;
      e.preventDefault();
      press("key");
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.code !== PTT_KEY_CODE) return;
      if (!heldSources.current.has("key")) return;
      e.preventDefault();
      release("key");
    };

    const onWindowBlur = () => {
      if (heldSources.current.size === 0) return;
      heldSources.current.clear();
      stop();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [disabled, press, release, stop]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    press("pointer");
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    release("pointer");
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    release("pointer");
  };

  // Boost the perceived range so quiet speech still moves the meter.
  const normalized = Math.min(1, Math.max(0, level * 4));
  const filled = Math.round(normalized * NUM_BARS);
  const isHot = normalized > 0.7;

  const buttonTitle = error
    ? error
    : isStarting
      ? "Requesting microphone…"
      : isActive
        ? "Listening — release ` to stop"
        : "Hold ` (tilde) or this button to talk";

  return (
    <div
      className="flex items-center gap-2"
      title={buttonTitle}
      aria-busy={clarificationLoading ? true : undefined}
    >
      <div
        className="flex items-end gap-[2px] h-5 w-7"
        aria-hidden="true"
        aria-label="Microphone level"
      >
        {Array.from({ length: NUM_BARS }).map((_, i) => {
          const active = isActive && i < filled;
          const heightPct = 25 + (i / (NUM_BARS - 1)) * 75;
          return (
            <span
              key={i}
              className="w-[3px] rounded-sm transition-colors duration-75"
              style={{
                height: `${heightPct}%`,
                backgroundColor: active
                  ? isHot
                    ? "var(--del-fg)"
                    : "var(--accent)"
                  : "#2a2a31",
              }}
            />
          );
        })}
      </div>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={isActive}
        aria-keyshortcuts="`"
        aria-label="Push to talk (hold tilde or this button)"
        className={`relative w-9 h-9 flex items-center justify-center rounded-full border transition-colors select-none touch-none ${
          disabled
            ? "border-[var(--border)] text-[#4a4a52] opacity-40 cursor-not-allowed"
            : isActive
              ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-dim)]"
              : isStarting
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border)] text-[#cfcfd6] hover:text-white hover:border-[#3a3a41]"
        }`}
      >
        {isActive ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" />
            <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 1 0 2 0v-3.08A7 7 0 0 0 19 11z" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M15 11V6a3 3 0 0 0-5.91-.75l5.85 5.85A3 3 0 0 0 15 11z" />
            <path d="M19 11a1 1 0 1 0-2 0 4.97 4.97 0 0 1-.62 2.4l1.46 1.46A6.96 6.96 0 0 0 19 11z" />
            <path d="M4.27 3 3 4.27l5.18 5.18V11a3 3 0 0 0 4.55 2.57l1.34 1.34a4.96 4.96 0 0 1-2.07.57 5 5 0 0 1-5-5 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 1 0 2 0v-3.08c.95-.13 1.83-.45 2.6-.92L19.73 21 21 19.73 4.27 3z" />
          </svg>
        )}
        {isActive ? (
          <span
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-[var(--accent)]"
            style={{
              opacity: 0.25 + normalized * 0.75,
              transform: `scale(${1 + normalized * 0.18})`,
              transition: "transform 80ms linear, opacity 80ms linear",
            }}
          />
        ) : null}
      </button>
      <kbd
        className={`hidden sm:inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded border text-[10px] font-mono leading-none transition-colors ${
          isActive
            ? "border-[var(--accent)] text-[var(--accent)]"
            : "border-[var(--border)] text-[var(--muted)]"
        }`}
        aria-hidden="true"
      >
        `
      </kbd>
      {clarificationLoading ? (
        <span
          className="flex items-center shrink-0 text-[var(--accent)]"
          role="status"
          aria-label="Processing your question"
          title="Processing your question…"
        >
          <svg
            className="animate-spin"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.2-8.55" />
          </svg>
        </span>
      ) : null}
    </div>
  );
}
