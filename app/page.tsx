"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();
  const didResetOnMount = useRef(false);
  const [repoPath, setRepoPath] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (didResetOnMount.current) return;
    didResetOnMount.current = true;
    const lastRepoPath =
      typeof window !== "undefined"
        ? window.localStorage.getItem("diff-explainer:last-repo") ?? undefined
        : undefined;
    void fetch("/api/reset", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath: lastRepoPath }),
    });
  }, []);

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const repo = repoPath.trim();
    const session = sessionId.trim();
    if (!repo || !session) {
      setError("Enter repo path and Claude session ID");
      return;
    }
    const params = new URLSearchParams({
      repo,
      generate: "1",
      sessionId: session,
    });
    window.localStorage.setItem("diff-explainer:last-repo", repo);
    router.push(`/viewer?${params.toString()}`);
  }

  function handleSkipClaude() {
    if (!repoPath.trim()) {
      setError("Enter a repo path first");
      return;
    }
    const repo = repoPath.trim();
    window.localStorage.setItem("diff-explainer:last-repo", repo);
    const params = new URLSearchParams({ repo });
    router.push(`/viewer?${params.toString()}`);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        <header className="mb-10">
          <h1 className="text-4xl font-semibold tracking-tight mb-2">
            <span className="text-[var(--accent)]">diff-explainer</span>
          </h1>
          <p className="text-[var(--muted)] text-sm leading-relaxed">
            Point at a local repository and replay an AI-generated walkthrough
            of the changes, with synced highlighting and TTS narration.
          </p>
        </header>

        <form
          onSubmit={handleGenerate}
          className="space-y-5 bg-[var(--panel)] border border-[var(--border)] rounded-xl p-6"
        >
          <div>
            <label
              htmlFor="repo"
              className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-2"
            >
              Local repo path
            </label>
            <input
              id="repo"
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="/Users/you/projects/your-repo"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0a0a0c] border border-[var(--border)] rounded-md text-sm font-mono text-[#e8e8ee] placeholder-[#4a4a52] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)] transition-colors"
            />
            <p className="mt-1.5 text-[11px] text-[var(--muted)]">
              Absolute path. Must be a git repository.
            </p>
          </div>

          <div>
            <label
              htmlFor="session"
              className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-2"
            >
              Claude session ID
            </label>
            <input
              id="session"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0a0a0c] border border-[var(--border)] rounded-md text-sm font-mono text-[#e8e8ee] placeholder-[#4a4a52] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)] transition-colors"
            />
            <p className="mt-1.5 text-[11px] text-[var(--muted)]">
              The session that just produced your code changes. diff-explainer
              will fork it so the original is untouched. The viewer opens
              immediately and streams blocks as they are written.
            </p>
          </div>

          {error ? (
            <div className="text-xs text-[var(--del-fg)] bg-[#2a1414] border border-[#4d1f1f] rounded p-3 font-mono whitespace-pre-wrap">
              {error}
            </div>
          ) : null}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={!repoPath.trim() || !sessionId.trim()}
              className="flex-1 h-11 rounded-full bg-[var(--accent)] text-black font-semibold text-sm hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 transition-transform"
            >
              Generate explainer
            </button>
            <button
              type="button"
              onClick={handleSkipClaude}
              className="h-11 px-5 rounded-full border border-[var(--border)] text-sm text-[#e8e8ee] hover:border-[#3a3a41] transition-colors"
              title="Skip Claude — open the viewer using whatever explainer.yaml is already in the repo"
            >
              Open existing
            </button>
          </div>
        </form>

        <p className="mt-6 text-[11px] text-[var(--muted)] leading-relaxed">
          Requires the <code className="font-mono">claude</code> CLI in your
          PATH and the global <code className="font-mono">/explainer</code>{" "}
          skill at <code className="font-mono">~/.claude/skills/explainer/</code>.{" "}
          Set <code className="font-mono">ELEVENLABS_API_KEY</code> in{" "}
          <code className="font-mono">.env.local</code> before starting{" "}
          <code className="font-mono">next dev</code>.
        </p>
      </div>
    </main>
  );
}
