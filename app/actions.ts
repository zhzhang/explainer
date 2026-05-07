"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
import { resolve, isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
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
import { ttsCache } from "./lib/ttsCache";

const execFileAsync = promisify(execFile);

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_flash_v2_5";
const MAX_VALIDATION_RETRIES = 3;

async function assertRepoPath(repoPath: string): Promise<string> {
  if (!repoPath || typeof repoPath !== "string") {
    throw new Error("repoPath is required");
  }
  if (!isAbsolute(repoPath)) {
    throw new Error("repoPath must be an absolute path");
  }
  const resolved = resolve(repoPath);
  let info;
  try {
    info = await stat(resolved);
  } catch {
    throw new Error(`Repo path does not exist: ${resolved}`);
  }
  if (!info.isDirectory()) {
    throw new Error(`Repo path is not a directory: ${resolved}`);
  }
  try {
    const gitDir = await stat(join(resolved, ".git"));
    if (!gitDir.isDirectory() && !gitDir.isFile()) {
      throw new Error(`Not a git repository: ${resolved}`);
    }
  } catch {
    throw new Error(`Not a git repository: ${resolved}`);
  }
  return resolved;
}

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
    } catch {
    }
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
  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync(CLAUDE_BIN, args, {
      cwd,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };
    throw new Error(
      `claude invocation failed: ${e.message}\nstderr: ${e.stderr ?? ""}\nstdout: ${e.stdout ?? ""}`,
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
  } catch {
  }

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
    "Use the /explainer skill to produce an explainer.yaml in the repo root that walks through the code changes from this session. Look at git diff HEAD (or git show HEAD if the working tree is clean), then write a YAML list of explainer blocks following the skill's schema exactly. Save it to explainer.yaml at the repo root and confirm with a one-line message.";

  const overallStart = Date.now();
  const attempts: ClaudeAttempt[] = [];

  const initial = await runClaude(cwd, initialPrompt, sessionId, true);
  let activeSessionId = initial.forkedSessionId ?? sessionId;

  const initialDiff = await getDiff(repoPath);
  let validation = await readAndValidateExplainer(repoPath, initialDiff.rawDiff);

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
- Use repo-relative forward-slash paths that appear in 'git diff HEAD'.
- All line numbers are 1-indexed and inclusive; line_end >= line_start; both must be within the file's actual line count.
- col_start defaults to 1; col_end can be 9999 for whole-line ranges.
- Read the touched files to confirm line numbers before writing the YAML.

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

export async function synthesizeSpeech(text: string): Promise<{
  audioBase64: string;
  mimeType: string;
}> {
  if (!text || typeof text !== "string" || !text.trim()) {
    throw new Error("text is required");
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to .env.local and restart the dev server.",
    );
  }

  const hash = createHash("sha256")
    .update(`${DEFAULT_VOICE_ID}::${DEFAULT_MODEL_ID}::${text}`)
    .digest("hex");

  const cached = ttsCache.get(hash);
  if (cached) {
    return { audioBase64: cached, mimeType: "audio/mpeg" };
  }

  const client = new ElevenLabsClient({ apiKey });
  const stream = await client.textToSpeech.convert(DEFAULT_VOICE_ID, {
    text,
    modelId: DEFAULT_MODEL_ID,
    outputFormat: "mp3_44100_128",
  });

  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  const audioBase64 = Buffer.from(merged).toString("base64");

  if (ttsCache.size > 200) {
    const firstKey = ttsCache.keys().next().value;
    if (firstKey) ttsCache.delete(firstKey);
  }
  ttsCache.set(hash, audioBase64);

  return { audioBase64, mimeType: "audio/mpeg" };
}
