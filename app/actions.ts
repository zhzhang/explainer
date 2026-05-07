"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { resolve, isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";
import yaml from "js-yaml";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { DiffResult, ExplainerBlock, InvokeClaudeResult } from "./types";

const execFileAsync = promisify(execFile);

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_flash_v2_5";

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

export async function invokeClaude(
  repoPath: string,
  sessionId: string,
): Promise<InvokeClaudeResult> {
  const cwd = await assertRepoPath(repoPath);
  if (!sessionId || typeof sessionId !== "string") {
    throw new Error("sessionId is required");
  }

  const prompt =
    "Use the /explainer skill to produce an explainer.yaml in the repo root that walks through the code changes from this session. Look at git diff HEAD (or git show HEAD if the working tree is clean), then write a YAML list of explainer blocks following the skill's schema exactly. Save it to explainer.yaml at the repo root and confirm with a one-line message.";

  const args = [
    "-p",
    prompt,
    "--resume",
    sessionId,
    "--fork-session",
    "--output-format",
    "json",
    "--permission-mode",
    "bypassPermissions",
  ];

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

export async function getExplainer(
  repoPath: string,
): Promise<ExplainerBlock[]> {
  const cwd = await assertRepoPath(repoPath);
  const explainerPath = join(cwd, "explainer.yaml");
  let raw: string;
  try {
    raw = await readFile(explainerPath, "utf-8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      throw new Error(
        `explainer.yaml not found at ${explainerPath}. Run invokeClaude first.`,
      );
    }
    throw new Error(`Failed to read explainer.yaml: ${e.message}`);
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`Failed to parse explainer.yaml: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("explainer.yaml must be a YAML list of explainer blocks");
  }

  const blocks: ExplainerBlock[] = parsed.map((entry, idx) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Entry ${idx} in explainer.yaml is not an object`);
    }
    const e = entry as Record<string, unknown>;
    const file = e.file;
    const text = e.text;
    if (typeof file !== "string" || !file.trim()) {
      throw new Error(`Entry ${idx}: missing or invalid 'file'`);
    }
    if (typeof text !== "string" || !text.trim()) {
      throw new Error(`Entry ${idx}: missing or invalid 'text'`);
    }
    const lineStart = Number(e.line_start);
    const colStart = Number(e.col_start ?? 1);
    const lineEnd = Number(e.line_end);
    const colEnd = Number(e.col_end ?? 9999);
    if (!Number.isFinite(lineStart) || lineStart < 1) {
      throw new Error(`Entry ${idx}: invalid line_start`);
    }
    if (!Number.isFinite(lineEnd) || lineEnd < lineStart) {
      throw new Error(`Entry ${idx}: invalid line_end`);
    }
    return {
      file,
      line_start: lineStart,
      col_start: colStart,
      line_end: lineEnd,
      col_end: colEnd,
      text: text.trim(),
    };
  });

  return blocks;
}

const ttsCache = new Map<string, string>();

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
