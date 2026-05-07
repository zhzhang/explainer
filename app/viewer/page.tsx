import Link from "next/link";
import { getDiff, getExplainer } from "../actions";
import type { ExplainerBlock } from "../types";
import ViewerClient from "./ViewerClient";

interface ViewerPageProps {
  searchParams: Promise<{
    repo?: string;
    fork?: string;
    generate?: string;
    sessionId?: string;
  }>;
}

type ViewerData =
  | {
      ok: true;
      rawDiff: string;
      blocks: ExplainerBlock[];
      pendingGeneration: boolean;
      sessionId: string;
    }
  | { ok: false; message: string };

async function loadViewerData(
  repo: string,
  opts: { generate?: string; sessionId?: string },
): Promise<ViewerData> {
  if (!repo) {
    return { ok: false, message: "Missing repo path. Return to the home page." };
  }

  const isGenerate = opts.generate === "1" || opts.generate === "true";

  if (isGenerate) {
    if (!opts.sessionId?.trim()) {
      return {
        ok: false,
        message:
          "Missing sessionId for generation. Return to the home page and submit with a Claude session ID.",
      };
    }
    try {
      const diffResult = await getDiff(repo);
      return {
        ok: true,
        rawDiff: diffResult.rawDiff,
        blocks: [],
        pendingGeneration: true,
        sessionId: opts.sessionId.trim(),
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  try {
    const [diffResult, blocks] = await Promise.all([
      getDiff(repo),
      getExplainer(repo),
    ]);
    if (blocks.length === 0) {
      return { ok: false, message: "explainer.yaml is empty." };
    }
    return {
      ok: true,
      rawDiff: diffResult.rawDiff,
      blocks,
      pendingGeneration: false,
      sessionId: "",
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export default async function ViewerPage({ searchParams }: ViewerPageProps) {
  const params = await searchParams;
  const repo = params.repo ?? "";
  const fork = params.fork ?? "";

  const data = await loadViewerData(repo, {
    generate: params.generate,
    sessionId: params.sessionId,
  });

  if (!data.ok) {
    return <ErrorView message={data.message} />;
  }

  const clientKey = data.pendingGeneration
    ? `gen-${data.sessionId}`
    : fork || "open";

  return (
    <ViewerClient
      key={clientKey}
      repo={repo}
      fork={fork}
      rawDiff={data.rawDiff}
      initialBlocks={data.blocks}
      pendingGeneration={data.pendingGeneration}
      initialSessionId={data.sessionId}
    />
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
        <pre className="text-xs text-[var(--del-fg)] bg-[#2a1414] border border-[#4d1f1f] rounded p-3 font-mono whitespace-pre-wrap text-left">
          {message}
        </pre>
        <div className="flex gap-3 justify-center mt-5">
          <Link
            href="/"
            className="h-10 px-5 inline-flex items-center rounded-full border border-[var(--border)] text-sm text-[#e8e8ee]"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
