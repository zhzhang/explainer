"use client";

import type { ExplainerBlock } from "../types";

interface ExplainerOverlayProps {
  block: ExplainerBlock | null;
  index: number;
  total: number;
}

export default function ExplainerOverlay({
  block,
  index,
  total,
}: ExplainerOverlayProps) {
  if (!block) return null;
  return (
    <div className="fixed left-6 bottom-28 z-30 max-w-md">
      <div className="bg-[var(--panel-2)]/95 backdrop-blur border border-[var(--border)] rounded-xl p-4 shadow-2xl">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--muted)] mb-2">
          <span className="text-[var(--accent)]">●</span>
          <span>
            Block {index + 1} / {total}
          </span>
          <span className="opacity-50">·</span>
          <span className="font-mono truncate">{block.file}</span>
          <span className="opacity-50 text-[var(--muted)]">
            L{block.line_start}–{block.line_end}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-[#e8e8ee]">{block.text}</p>
      </div>
    </div>
  );
}
