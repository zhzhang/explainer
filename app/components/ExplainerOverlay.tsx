"use client";

import type { HighlightKind } from "../lib/parseDiff";
import type { ExplainerBlock } from "../types";

interface ExplainerOverlayProps {
  block: ExplainerBlock | null;
  index: number;
  total: number;
  kind: HighlightKind | null;
}

const KIND_LABEL: Record<HighlightKind, string> = {
  change: "change",
  context: "context",
  missing: "missing",
};

const KIND_DESCRIPTION: Record<HighlightKind, string> = {
  change: "Highlighting code that was added in this diff.",
  context: "Highlighting existing code referenced for background.",
  missing: "This file isn't in the current diff.",
};

function KindBadge({ kind }: { kind: HighlightKind }) {
  const styles: Record<HighlightKind, string> = {
    change:
      "bg-[rgba(46,160,67,0.18)] text-[var(--add-fg)] border-[rgba(46,160,67,0.4)]",
    context:
      "bg-[rgba(120,140,170,0.15)] text-[#aab4c4] border-[rgba(120,140,170,0.35)]",
    missing:
      "bg-[rgba(248,81,73,0.15)] text-[var(--del-fg)] border-[rgba(248,81,73,0.4)]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider font-medium ${styles[kind]}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          backgroundColor:
            kind === "change"
              ? "var(--add-fg)"
              : kind === "missing"
                ? "var(--del-fg)"
                : "#8a96aa",
        }}
      />
      {KIND_LABEL[kind]}
    </span>
  );
}

export default function ExplainerOverlay({
  block,
  index,
  total,
  kind,
}: ExplainerOverlayProps) {
  if (!block) return null;
  return (
    <div className="fixed left-6 bottom-28 z-30 max-w-md">
      <div className="bg-[var(--panel-2)]/95 backdrop-blur border border-[var(--border)] rounded-xl p-4 shadow-2xl">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">
          <span>
            Block {index + 1} / {total}
          </span>
          <span className="opacity-50">·</span>
          <span className="font-mono truncate">{block.file}</span>
          <span className="opacity-50 text-[var(--muted)]">
            L{block.line_start}–{block.line_end}
          </span>
          {kind ? (
            <span className="ml-auto">
              <KindBadge kind={kind} />
            </span>
          ) : null}
        </div>
        {kind ? (
          <p className="text-[11px] text-[var(--muted)] mb-2 italic">
            {KIND_DESCRIPTION[kind]}
          </p>
        ) : null}
        <p className="text-sm leading-relaxed text-[#e8e8ee]">{block.text}</p>
      </div>
    </div>
  );
}
