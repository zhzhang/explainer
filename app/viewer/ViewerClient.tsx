"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { invokeClaude } from "../actions";
import DiffViewer from "../components/DiffViewer";
import PlaybackControls from "../components/PlaybackControls";
import ExplainerOverlay from "../components/ExplainerOverlay";
import type { ExplainerBlock } from "../types";

interface ViewerClientProps {
  repo: string;
  fork: string;
  rawDiff: string;
  blocks: ExplainerBlock[];
}

export default function ViewerClient({
  repo,
  fork,
  rawDiff,
  blocks,
}: ViewerClientProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRegenerating, startRegenerate] = useTransition();
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const handleRegenerate = useCallback(() => {
    const sessionToUse = fork || prompt("Enter a Claude session ID to fork:");
    if (!sessionToUse) return;
    setRegenerateError(null);
    startRegenerate(async () => {
      try {
        const result = await invokeClaude(repo, sessionToUse);
        const params = new URLSearchParams({ repo });
        params.set("fork", result.forkedSessionId ?? sessionToUse);
        router.replace(`/viewer?${params.toString()}`);
        router.refresh();
      } catch (err) {
        setRegenerateError((err as Error).message);
      }
    });
  }, [repo, fork, router]);

  const activeBlock = blocks[currentIndex] ?? null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[#0c0c0e]">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/"
            className="text-[var(--accent)] font-semibold text-lg shrink-0"
          >
            diff-explainer
          </Link>
          <span className="text-[var(--muted)] text-xs shrink-0">/</span>
          <span className="text-sm font-mono text-[#e8e8ee] truncate">
            {repo}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {fork ? (
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-mono">
              fork: {fork.slice(0, 8)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="h-8 px-3 rounded-full border border-[var(--border)] text-xs text-[#e8e8ee] hover:border-[#3a3a41] disabled:opacity-40 transition-colors"
          >
            {isRegenerating ? "Regenerating…" : "Re-generate"}
          </button>
        </div>
      </header>

      {regenerateError ? (
        <div className="px-6 py-2 text-xs text-[var(--del-fg)] bg-[#2a1414] border-b border-[#4d1f1f] font-mono">
          {regenerateError}
        </div>
      ) : null}

      <main className="flex-1 overflow-y-auto pb-32 scrollbar-slim">
        <DiffViewer rawDiff={rawDiff} activeBlock={activeBlock} />
      </main>

      <ExplainerOverlay
        block={activeBlock}
        index={currentIndex}
        total={blocks.length}
      />

      <PlaybackControls
        blocks={blocks}
        currentIndex={currentIndex}
        onIndexChange={setCurrentIndex}
      />
    </div>
  );
}
