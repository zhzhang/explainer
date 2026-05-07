"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { invokeClaude } from "../actions";
import DiffViewer from "../components/DiffViewer";
import PlaybackControls from "../components/PlaybackControls";
import ExplainerOverlay from "../components/ExplainerOverlay";
import {
  classifyHighlight,
  fileMatches,
  parseDiffToSideBySide,
} from "../lib/parseDiff";
import type { ExplainerBlock } from "../types";

type ExplainerSnapshot = {
  status: "missing" | "invalid" | "ready";
  blocks: ExplainerBlock[];
};

/**
 * Polls the explainer.yaml via a Route Handler instead of a server action.
 * Plain fetches bypass the Next.js client-side server-action queue, so polls
 * keep firing while `invokeClaude` is in flight and the viewer can stream
 * blocks in as Claude writes them.
 */
async function fetchExplainerSnapshot(
  repo: string,
): Promise<ExplainerSnapshot> {
  try {
    const res = await fetch(
      `/api/explainer?repo=${encodeURIComponent(repo)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return { status: "invalid", blocks: [] };
    }
    return (await res.json()) as ExplainerSnapshot;
  } catch {
    return { status: "invalid", blocks: [] };
  }
}

interface ViewerClientProps {
  repo: string;
  fork: string;
  rawDiff: string;
  initialBlocks: ExplainerBlock[];
  pendingGeneration: boolean;
  initialSessionId: string;
}

export default function ViewerClient({
  repo,
  fork,
  rawDiff,
  initialBlocks,
  pendingGeneration,
  initialSessionId,
}: ViewerClientProps) {
  const router = useRouter();
  const [groups, setGroups] = useState<ExplainerBlock[]>(initialBlocks);
  const [currentSubIndex, setCurrentSubIndex] = useState(0);
  const blockCountRef = useRef(initialBlocks.length);

  const [isRegenerating, startRegenerate] = useTransition();
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(pendingGeneration);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [liveFork, setLiveFork] = useState<string | null>(fork || null);

  const subBlocks = useMemo(() => groups.flat(), [groups]);
  const groupStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const g of groups) {
      starts.push(acc);
      acc += g.length;
    }
    return starts;
  }, [groups]);

  const groupOfSubIndex = useMemo(() => {
    const out: number[] = [];
    groups.forEach((g, gi) => {
      for (let i = 0; i < g.length; i++) out.push(gi);
    });
    return out;
  }, [groups]);

  const activeGroupIndex =
    subBlocks.length > 0 ? (groupOfSubIndex[currentSubIndex] ?? 0) : 0;
  const activeGroup = groups[activeGroupIndex] ?? [];
  const activeSubBlock = subBlocks[currentSubIndex] ?? null;
  const activeSubIndexInGroup = useMemo(() => {
    if (!activeGroup.length || !activeSubBlock) return 0;
    const start = groupStarts[activeGroupIndex] ?? 0;
    return Math.max(0, currentSubIndex - start);
  }, [
    activeGroup.length,
    activeSubBlock,
    groupStarts,
    activeGroupIndex,
    currentSubIndex,
  ]);

  useEffect(() => {
    blockCountRef.current = groups.length;
  }, [groups.length]);

  useEffect(() => {
    if (!pendingGeneration || !initialSessionId) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setGenerationError(null);
      try {
        const result = await invokeClaude(repo, initialSessionId);
        if (cancelled) return;
        if (result.forkedSessionId) {
          setLiveFork(result.forkedSessionId);
          const params = new URLSearchParams({ repo });
          params.set("fork", result.forkedSessionId);
          router.replace(`/viewer?${params.toString()}`);
        }
        const snap = await fetchExplainerSnapshot(repo);
        if (!cancelled && snap.status === "ready" && snap.blocks.length > 0) {
          setGroups(snap.blocks);
          blockCountRef.current = snap.blocks.length;
          const fl = snap.blocks.flat().length;
          setCurrentSubIndex((i) => Math.min(i, Math.max(0, fl - 1)));
        }
      } catch (err) {
        if (!cancelled) {
          setGenerationError((err as Error).message);
        }
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingGeneration, initialSessionId, repo, router]);

  useEffect(() => {
    if (!generating) return;
    const id = setInterval(() => {
      void (async () => {
        const r = await fetchExplainerSnapshot(repo);
        if (r.status !== "ready" || r.blocks.length === 0) return;
        if (r.blocks.length > blockCountRef.current) {
          blockCountRef.current = r.blocks.length;
          setGroups(r.blocks);
          const fl = r.blocks.flat().length;
          setCurrentSubIndex((i) => Math.min(i, Math.max(0, fl - 1)));
        }
      })();
    }, 750);
    return () => clearInterval(id);
  }, [generating, repo]);

  const handleRegenerate = useCallback(() => {
    const sessionToUse = liveFork || prompt("Enter a Claude session ID to fork:");
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
  }, [repo, liveFork, router]);

  const parsedFiles = useMemo(() => parseDiffToSideBySide(rawDiff), [rawDiff]);

  const activeKind = useMemo(() => {
    if (!activeSubBlock) return null;
    const file = parsedFiles.find((f) => fileMatches(f, activeSubBlock.file));
    return classifyHighlight(file, activeSubBlock);
  }, [parsedFiles, activeSubBlock]);

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
          {generating ? (
            <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-[var(--accent-dim)] text-[var(--accent)] flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              Generating…
            </span>
          ) : null}
          {liveFork ? (
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-mono">
              fork: {liveFork.slice(0, 8)}
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

      {generationError ? (
        <div className="px-6 py-2 text-xs text-[var(--del-fg)] bg-[#2a1414] border-b border-[#4d1f1f] font-mono whitespace-pre-wrap">
          {generationError}
        </div>
      ) : null}

      {regenerateError ? (
        <div className="px-6 py-2 text-xs text-[var(--del-fg)] bg-[#2a1414] border-b border-[#4d1f1f] font-mono">
          {regenerateError}
        </div>
      ) : null}

      <main className="flex-1 overflow-y-auto pb-32 scrollbar-slim">
        <DiffViewer rawDiff={rawDiff} activeSubBlock={activeSubBlock} />
      </main>

      <ExplainerOverlay
        group={activeGroup}
        activeSubIndexInGroup={activeSubIndexInGroup}
        groupIndex={activeGroupIndex}
        groupTotal={groups.length}
        activeSubBlock={activeSubBlock}
        kind={activeKind}
      />

      <PlaybackControls
        groups={groups}
        subBlocks={subBlocks}
        groupStarts={groupStarts}
        currentSubIndex={currentSubIndex}
        onSubIndexChange={setCurrentSubIndex}
      />
    </div>
  );
}
