"use client";

import type { HighlightKind } from "../lib/parseDiff";
import type { ExplainerSubBlock } from "../types";

interface ExplainerOverlayProps {
  group: ExplainerSubBlock[];
  activeSubIndexInGroup: number;
  groupIndex: number;
  groupTotal: number;
  activeSubBlock: ExplainerSubBlock | null;
  kind: HighlightKind | null;
}

type Part = "before" | "after";

const KIND_LABEL: Record<HighlightKind, string> = {
  change: "change",
  context: "context",
  missing: "missing",
};

function describeKind(kind: HighlightKind, part: Part): string {
  if (kind === "missing") return "This file isn't in the current diff.";
  if (part === "before") {
    return kind === "change"
      ? "Highlighting code that was removed or replaced in this diff."
      : "Highlighting pre-change code referenced for background.";
  }
  return kind === "change"
    ? "Highlighting code that was added in this diff."
    : "Highlighting existing code referenced for background.";
}

function KindBadge({ kind, part }: { kind: HighlightKind; part: Part }) {
  const styles: Record<HighlightKind, string> = {
    change:
      part === "before"
        ? "bg-[rgba(248,81,73,0.18)] text-[var(--del-fg)] border-[rgba(248,81,73,0.4)]"
        : "bg-[rgba(46,160,67,0.18)] text-[var(--add-fg)] border-[rgba(46,160,67,0.4)]",
    context:
      "bg-[rgba(120,140,170,0.15)] text-[#aab4c4] border-[rgba(120,140,170,0.35)]",
    missing:
      "bg-[rgba(248,81,73,0.15)] text-[var(--del-fg)] border-[rgba(248,81,73,0.4)]",
  };
  const dotColor =
    kind === "missing"
      ? "var(--del-fg)"
      : kind === "change"
        ? part === "before"
          ? "var(--del-fg)"
          : "var(--add-fg)"
        : "#8a96aa";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider font-medium ${styles[kind]}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      {KIND_LABEL[kind]}
    </span>
  );
}

function PartBadge({ part }: { part: Part }) {
  const styles =
    part === "before"
      ? "bg-[rgba(248,81,73,0.12)] text-[var(--del-fg)] border-[rgba(248,81,73,0.35)]"
      : "bg-[rgba(46,160,67,0.12)] text-[var(--add-fg)] border-[rgba(46,160,67,0.35)]";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-wider font-medium ${styles}`}
      title={
        part === "before"
          ? "Pointing at the pre-change (left) side of the diff"
          : "Pointing at the post-change (right) side of the diff"
      }
    >
      {part}
    </span>
  );
}

export default function ExplainerOverlay({
  group,
  activeSubIndexInGroup,
  groupIndex,
  groupTotal,
  activeSubBlock,
  kind,
}: ExplainerOverlayProps) {
  if (!activeSubBlock || group.length === 0) return null;

  const activePart: Part = activeSubBlock.part ?? "after";

  return (
    <div className="fixed left-6 bottom-28 z-30 max-w-md">
      <div className="bg-[var(--panel-2)]/95 backdrop-blur border border-[var(--border)] rounded-xl p-4 shadow-2xl">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2 flex-wrap">
          <span>
            Block {groupIndex + 1} / {groupTotal}
          </span>
          <span className="opacity-50">·</span>
          <span>
            Part {activeSubIndexInGroup + 1} / {group.length}
          </span>
          <span className="opacity-50">·</span>
          <span className="font-mono truncate max-w-[140px]">
            {activeSubBlock.file}
          </span>
          <span className="opacity-50 text-[var(--muted)] font-mono">
            L{activeSubBlock.line_start}–{activeSubBlock.line_end}
          </span>
          <PartBadge part={activePart} />
          {kind ? (
            <span className="ml-auto">
              <KindBadge kind={kind} part={activePart} />
            </span>
          ) : null}
        </div>
        {kind ? (
          <p className="text-[11px] text-[var(--muted)] mb-2 italic">
            {describeKind(kind, activePart)}
          </p>
        ) : null}
        <div className="space-y-2">
          {group.map((sub, i) => {
            const isActive = i === activeSubIndexInGroup;
            const isUserTurn = sub.turn === "user";
            if (isUserTurn) {
              return (
                <div
                  key={`user-${sub.file}-${sub.line_start}-${i}`}
                  className={`rounded-lg border border-[#3a3a52] bg-[#141418] px-3 py-2.5 ${
                    isActive ? "ring-1 ring-[var(--accent-dim)]" : "opacity-80"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">
                    You asked
                  </div>
                  <p className="text-sm leading-relaxed text-[#e8e8ee]/90 italic">
                    {sub.text}
                  </p>
                </div>
              );
            }
            return (
              <p
                key={`${sub.file}-${sub.line_start}-${i}`}
                className={`text-sm leading-relaxed pl-2 border-l-2 transition-opacity ${
                  isActive
                    ? "text-[#e8e8ee] border-[var(--accent)] opacity-100"
                    : "text-[#e8e8ee]/55 border-transparent opacity-75"
                }`}
              >
                {isActive ? (
                  <span className="text-[var(--accent)] mr-1.5" aria-hidden>
                    ▸
                  </span>
                ) : null}
                {sub.text}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
