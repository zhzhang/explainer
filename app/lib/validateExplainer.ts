import { readFile, stat } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { ZodError } from "zod";
import yaml from "js-yaml";
import {
  explainerListSchema,
  type ExplainerBlockParsed,
} from "./explainerSchema";
import { parseDiffToSideBySide, normalizePath } from "./parseDiff";

export interface ValidationIssue {
  index: number | null;
  field: string | null;
  message: string;
}

export type ValidationResult =
  | { ok: true; blocks: ExplainerBlockParsed[] }
  | { ok: false; issues: ValidationIssue[]; raw: string };

function safelyJoinRepoFile(repoPath: string, relFile: string): string | null {
  if (isAbsolute(relFile)) return null;
  if (relFile.includes("..")) return null;
  const full = resolve(repoPath, relFile);
  if (!full.startsWith(resolve(repoPath))) return null;
  return full;
}

function zodErrorToIssues(err: ZodError): ValidationIssue[] {
  return err.issues.map((iss): ValidationIssue => {
    const path = iss.path;
    const idx = typeof path[0] === "number" ? path[0] : null;
    const fieldParts = path.slice(idx == null ? 0 : 1);
    return {
      index: idx,
      field: fieldParts.length ? fieldParts.join(".") : null,
      message: iss.message,
    };
  });
}

export async function readAndValidateExplainer(
  repoPath: string,
  rawDiff: string,
): Promise<ValidationResult> {
  const explainerPath = join(repoPath, "explainer.yaml");

  let raw: string;
  try {
    raw = await readFile(explainerPath, "utf-8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    return {
      ok: false,
      raw: "",
      issues: [
        {
          index: null,
          field: null,
          message:
            e.code === "ENOENT"
              ? "explainer.yaml not found at the repo root."
              : `Could not read explainer.yaml: ${e.message}`,
        },
      ],
    };
  }

  let parsedYaml: unknown;
  try {
    parsedYaml = yaml.load(raw);
  } catch (err) {
    return {
      ok: false,
      raw,
      issues: [
        {
          index: null,
          field: null,
          message: `explainer.yaml is not valid YAML: ${(err as Error).message}`,
        },
      ],
    };
  }

  const parsed = explainerListSchema.safeParse(parsedYaml);
  if (!parsed.success) {
    return { ok: false, raw, issues: zodErrorToIssues(parsed.error) };
  }

  const blocks = parsed.data;
  const issues: ValidationIssue[] = [];

  const diffFiles = parseDiffToSideBySide(rawDiff);
  const changedFileSet = new Set<string>();
  for (const f of diffFiles) {
    if (f.newName && f.newName !== "/dev/null") {
      changedFileSet.add(normalizePath(f.newName));
    }
    if (f.oldName && f.oldName !== "/dev/null") {
      changedFileSet.add(normalizePath(f.oldName));
    }
    changedFileSet.add(normalizePath(f.displayName));
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const normalized = normalizePath(b.file);

    if (changedFileSet.size > 0 && !changedFileSet.has(normalized)) {
      issues.push({
        index: i,
        field: "file",
        message: `'${b.file}' is not present in the current diff. Files in the diff: [${[...changedFileSet].join(", ")}].`,
      });
    }

    const fullPath = safelyJoinRepoFile(repoPath, b.file);
    if (!fullPath) {
      issues.push({
        index: i,
        field: "file",
        message: `'${b.file}' is not a safe repo-relative path.`,
      });
      continue;
    }

    let info;
    try {
      info = await stat(fullPath);
    } catch {
      const isDeletedInDiff = diffFiles.some(
        (f) => f.isDeleted && normalizePath(f.oldName) === normalized,
      );
      if (isDeletedInDiff) {
        continue;
      }
      issues.push({
        index: i,
        field: "file",
        message: `'${b.file}' does not exist on disk at ${fullPath}.`,
      });
      continue;
    }
    if (!info.isFile()) {
      issues.push({
        index: i,
        field: "file",
        message: `'${b.file}' is not a regular file.`,
      });
      continue;
    }

    let content: string;
    try {
      content = await readFile(fullPath, "utf-8");
    } catch (err) {
      issues.push({
        index: i,
        field: "file",
        message: `Could not read '${b.file}': ${(err as Error).message}`,
      });
      continue;
    }

    const lines = content.split(/\r?\n/);
    const totalLines = lines.length;

    if (b.line_start > totalLines) {
      issues.push({
        index: i,
        field: "line_start",
        message: `line_start (${b.line_start}) is past end of '${b.file}' which has ${totalLines} lines.`,
      });
    }
    if (b.line_end > totalLines) {
      issues.push({
        index: i,
        field: "line_end",
        message: `line_end (${b.line_end}) is past end of '${b.file}' which has ${totalLines} lines.`,
      });
    }

    if (b.line_start <= totalLines) {
      const startLineLen = lines[b.line_start - 1]?.length ?? 0;
      if (b.col_start > startLineLen + 1 && startLineLen > 0) {
        issues.push({
          index: i,
          field: "col_start",
          message: `col_start (${b.col_start}) is past end of line ${b.line_start} in '${b.file}' (length ${startLineLen}).`,
        });
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, raw, issues };
  }

  return { ok: true, blocks };
}

export function formatIssuesForClaude(issues: ValidationIssue[]): string {
  return issues
    .map((iss, n) => {
      const prefix =
        iss.index != null
          ? `Block ${iss.index}${iss.field ? `.${iss.field}` : ""}`
          : iss.field
            ? iss.field
            : "Top-level";
      return `${n + 1}. ${prefix}: ${iss.message}`;
    })
    .join("\n");
}
