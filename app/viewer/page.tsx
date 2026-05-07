import Link from "next/link";
import { getDiff, getExplainer } from "../actions";
import type { ExplainerBlock } from "../types";
import ViewerClient from "./ViewerClient";

interface ViewerPageProps {
  searchParams: Promise<{
    repo?: string;
    fork?: string;
  }>;
}

type ViewerData =
  | { ok: true; rawDiff: string; blocks: ExplainerBlock[] }
  | { ok: false; message: string };

async function loadViewerData(repo: string): Promise<ViewerData> {
  if (!repo) {
    return { ok: false, message: "Missing repo path. Return to the home page." };
  }
  try {
    const [diffResult, blocks] = await Promise.all([
      getDiff(repo),
      getExplainer(repo),
    ]);
    if (blocks.length === 0) {
      return { ok: false, message: "explainer.yaml is empty." };
    }
    return { ok: true, rawDiff: diffResult.rawDiff, blocks };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export default async function ViewerPage({ searchParams }: ViewerPageProps) {
  const params = await searchParams;
  const repo = params.repo ?? "";
  const fork = params.fork ?? "";

  const data = await loadViewerData(repo);

  if (!data.ok) {
    return <ErrorView message={data.message} />;
  }

  return (
    <ViewerClient
      repo={repo}
      fork={fork}
      rawDiff={data.rawDiff}
      blocks={data.blocks}
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
