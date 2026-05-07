"use client";

import { useMicrophoneLevel } from "../lib/useMicrophoneLevel";

const NUM_BARS = 5;

export default function MicIndicator() {
  const { isActive, isStarting, level, error, toggle } = useMicrophoneLevel();

  // Boost the perceived range so quiet speech still moves the meter.
  const normalized = Math.min(1, Math.max(0, level * 4));
  const filled = Math.round(normalized * NUM_BARS);
  const isHot = normalized > 0.7;

  const buttonTitle = error
    ? error
    : isStarting
      ? "Requesting microphone…"
      : isActive
        ? "Microphone on — click to mute"
        : "Microphone off — click to enable";

  return (
    <div className="flex items-center gap-2" title={buttonTitle}>
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
        onClick={toggle}
        disabled={isStarting}
        aria-pressed={isActive}
        aria-label={
          isActive ? "Turn microphone off" : "Turn microphone on"
        }
        className={`relative w-9 h-9 flex items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${
          isActive
            ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-dim)]"
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
    </div>
  );
}
