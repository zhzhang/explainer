import { readFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";
import { explainerListSchema } from "./explainerSchema";
import { assertRepoPath } from "./repoPath";
import type { ExplainerBlock } from "../types";

export type PollExplainerStatus = "missing" | "invalid" | "ready";

export interface PollExplainerResult {
  status: PollExplainerStatus;
  blocks: ExplainerBlock[];
}

/**
 * Reads explainer.yaml at the repo root and validates it against the schema.
 * Lightweight by design — used as a polling endpoint while Claude is still
 * writing, so missing/half-written files are reported as "missing"/"invalid"
 * rather than throwing.
 */
export async function pollExplainer(
  repoPath: string,
): Promise<PollExplainerResult> {
  const cwd = await assertRepoPath(repoPath);
  const explainerPath = join(cwd, "explainer.yaml");

  let raw: string;
  try {
    raw = await readFile(explainerPath, "utf-8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return { status: "missing", blocks: [] };
    }
    return { status: "invalid", blocks: [] };
  }

  let parsedYaml: unknown;
  try {
    parsedYaml = yaml.load(raw);
  } catch {
    return { status: "invalid", blocks: [] };
  }

  const parsed = explainerListSchema.safeParse(parsedYaml);
  if (!parsed.success) {
    return { status: "invalid", blocks: [] };
  }

  return { status: "ready", blocks: parsed.data };
}
