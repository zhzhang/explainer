"use server";

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type {
  ClaudeAttempt,
  DiffResult,
  ExplainerBlock,
  InvokeClaudeResult,
} from "./types";
import {
  formatIssuesForClaude,
  readAndValidateExplainer,
} from "./lib/validateExplainer";
import { assertRepoPath } from "./lib/repoPath";

const execFileAsync = promisify(execFile);

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const MAX_VALIDATION_RETRIES = 3;

export async function getDiff(repoPath: string): Promise<DiffResult> {
  const cwd = await assertRepoPath(repoPath);
  let rawDiff = "";
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "HEAD", "--no-color"],
      { cwd, maxBuffer: 64 * 1024 * 1024 },
    );
    rawDiff = stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string };
    if (e.stdout) {
      rawDiff = e.stdout;
    } else {
      throw new Error(`git diff failed: ${e.message}`);
    }
  }

  if (!rawDiff.trim()) {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["show", "HEAD", "--no-color"],
        { cwd, maxBuffer: 64 * 1024 * 1024 },
      );
      rawDiff = stdout;
    } catch {}
  }

  return { rawDiff, hasChanges: rawDiff.trim().length > 0 };
}

interface ClaudeRunResult {
  forkedSessionId: string | null;
  output: string;
  durationMs: number;
}

async function runClaude(
  cwd: string,
  prompt: string,
  resumeSessionId: string,
  fork: boolean,
): Promise<ClaudeRunResult> {
  const args = [
    "-p",
    prompt,
    "--resume",
    resumeSessionId,
    "--output-format",
    "json",
    "--permission-mode",
    "bypassPermissions",
  ];
  if (fork) args.push("--fork-session");

  const start = Date.now();
  const tag = `[claude ${new Date().toISOString()}]`;
  process.stdout.write(`${tag} spawning ${CLAUDE_BIN} (cwd=${cwd}, fork=${fork}, resume=${resumeSessionId})\n`);

  let stdout = "";
  let stderr = "";
  try {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(CLAUDE_BIN, args, { cwd });

      const timeoutMs = 10 * 60 * 1000;
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        rejectPromise(new Error(`claude invocation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        const s = chunk.toString("utf8");
        stdout += s;
        process.stdout.write(`${tag} stdout: ${s}`);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const s = chunk.toString("utf8");
        stderr += s;
        process.stdout.write(`${tag} stderr: ${s}`);
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        rejectPromise(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolvePromise();
        } else {
          rejectPromise(
            new Error(`claude exited with code ${code}`),
          );
        }
      });
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    throw new Error(
      `claude invocation failed: ${e.message}\nstderr: ${stderr}\nstdout: ${stdout}`,
    );
  }

  let forkedSessionId: string | null = null;
  let output = stdout;
  try {
    const parsed = JSON.parse(stdout);
    forkedSessionId =
      parsed.session_id ?? parsed.sessionId ?? parsed.forkedSessionId ?? null;
    output =
      typeof parsed.result === "string"
        ? parsed.result
        : typeof parsed.response === "string"
          ? parsed.response
          : stdout;
  } catch {}

  return {
    forkedSessionId,
    output: (output || "").trim() || stderr.trim(),
    durationMs: Date.now() - start,
  };
}

export async function invokeClaude(
  repoPath: string,
  sessionId: string,
): Promise<InvokeClaudeResult> {
  const cwd = await assertRepoPath(repoPath);
  if (!sessionId || typeof sessionId !== "string") {
    throw new Error("sessionId is required");
  }

  const initialPrompt =
    "Use the /explainer skill to produce explainer.yaml in the repo root. The schema is a YAML list of lists: each outer item is one narrative block (one coherent thought), each inner item is a sub-block with file, part (\"before\" or \"after\", default \"after\"), line_start, col_start, line_end, col_end, and text (one TTS clip per sub-block). Use part:after (default) for new or unchanged code with line numbers from the current file; use part:before to point at deleted or replaced lines using OLD line numbers from the diff's left gutter, and reach for it whenever the change rewrites or removes code whose old behavior is part of the explanation. Pair part:before with part:after in the same block to narrate why a rewrite happened. First output a short numbered outline in chat only, then write the file incrementally: after each block is done, rewrite explainer.yaml from scratch with all completed blocks so far so it stays valid YAML. Look at git diff HEAD (or git show HEAD if the working tree is clean). Save to explainer.yaml at the repo root and confirm with one line: Wrote explainer.yaml with N blocks (M sub-blocks).";

  const overallStart = Date.now();
  const attempts: ClaudeAttempt[] = [];

  const initial = await runClaude(cwd, initialPrompt, sessionId, true);
  let activeSessionId = initial.forkedSessionId ?? sessionId;

  const initialDiff = await getDiff(repoPath);
  let validation = await readAndValidateExplainer(
    repoPath,
    initialDiff.rawDiff,
  );

  attempts.push({
    attempt: 1,
    output: initial.output,
    validationIssues: validation.ok
      ? []
      : validation.issues.map((iss) => formatIssuesForClaude([iss])),
    durationMs: initial.durationMs,
  });

  let retryCount = 0;
  while (!validation.ok && retryCount < MAX_VALIDATION_RETRIES) {
    retryCount++;
    const issuesText = formatIssuesForClaude(validation.issues);

    const retryPrompt = `The explainer.yaml you wrote failed validation. Please re-read explainer.yaml, fix every issue listed below, and overwrite the file. Do not introduce new issues.

Validation errors (attempt ${retryCount} of ${MAX_VALIDATION_RETRIES}):
${issuesText}

Reminders from the /explainer skill:
- The file must be a list of lists (blocks containing sub-blocks), not a flat list.
- Use repo-relative forward-slash paths that appear in 'git diff HEAD'.
- 'part' is "before" or "after" (default "after"). part:after uses post-change line numbers from the file on disk. part:before uses pre-change line numbers from the diff's left gutter and MUST cover at least one deleted line; do not put part:before on unchanged context.
- All line numbers are 1-indexed and inclusive; line_end >= line_start.
- For part:after, line numbers must be within the current file's actual line count. For part:before, they must reference old lines that appear in the diff for that file.
- col_start defaults to 1; col_end can be 9999 for whole-line ranges.
- Read both the touched files and the diff (especially '-' lines and '@@' hunk headers) to confirm line numbers before writing the YAML.

After fixing, save explainer.yaml at the repo root and respond with one line: "Fixed explainer.yaml (attempt ${retryCount})".`;

    const retry = await runClaude(cwd, retryPrompt, activeSessionId, false);
    if (retry.forkedSessionId) activeSessionId = retry.forkedSessionId;

    const diffNow = await getDiff(repoPath);
    validation = await readAndValidateExplainer(repoPath, diffNow.rawDiff);

    attempts.push({
      attempt: retryCount + 1,
      output: retry.output,
      validationIssues: validation.ok
        ? []
        : validation.issues.map((iss) => formatIssuesForClaude([iss])),
      durationMs: retry.durationMs,
    });
  }

  if (!validation.ok) {
    const finalIssues = formatIssuesForClaude(validation.issues);
    throw new Error(
      `Claude could not produce a valid explainer.yaml after ${attempts.length} attempts.\n\nFinal validation errors:\n${finalIssues}`,
    );
  }

  return {
    forkedSessionId: activeSessionId,
    attempts,
    validated: true,
    totalDurationMs: Date.now() - overallStart,
  };
}

export async function getExplainer(
  repoPath: string,
): Promise<ExplainerBlock[]> {
  const cwd = await assertRepoPath(repoPath);
  const diff = await getDiff(repoPath);
  const result = await readAndValidateExplainer(cwd, diff.rawDiff);
  if (!result.ok) {
    throw new Error(
      `explainer.yaml failed validation:\n${formatIssuesForClaude(result.issues)}`,
    );
  }
  return result.blocks;
}
