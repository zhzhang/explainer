import { readFile, stat } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { ZodError } from "zod";
import yaml from "js-yaml";
import {
  explainerListSchema,
  type ExplainerBlockParsed,
} from "./explainerSchema";
import { fileMatches, parseDiffToSideBySide, normalizePath } from "./parseDiff";

export interface ValidationIssue {
  blockIndex: number | null;
  subIndex: number | null;
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
    let blockIndex: number | null = null;
    let subIndex: number | null = null;
    let fieldStart = 0;
    if (typeof path[0] === "number") {
      blockIndex = path[0];
      fieldStart = 1;
      if (typeof path[1] === "number") {
        subIndex = path[1];
        fieldStart = 2;
      }
    }
    const fieldParts = path.slice(fieldStart);
    return {
      blockIndex,
      subIndex,
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
          blockIndex: null,
          subIndex: null,
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
          blockIndex: null,
          subIndex: null,
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

  for (let g = 0; g < blocks.length; g++) {
    const group = blocks[g];
    for (let s = 0; s < group.length; s++) {
      const b = group[s];
      const normalized = normalizePath(b.file);

      if (changedFileSet.size > 0 && !changedFileSet.has(normalized)) {
        issues.push({
          blockIndex: g,
          subIndex: s,
          field: "file",
          message: `'${b.file}' is not present in the current diff. Files in the diff: [${[...changedFileSet].join(", ")}].`,
        });
      }

      // "before" parts point at the pre-change file (left side of the diff).
      // The line numbers refer to the OLD file, so we cannot validate them
      // against the on-disk version; we validate against the diff itself
      // and require the range to actually overlap a deletion.
      if (b.part === "before") {
        const matched = diffFiles.find((f) => fileMatches(f, b.file));
        if (!matched) {
          // Already reported via the changedFileSet check above; nothing
          // more we can validate without the diff entry.
          continue;
        }

        let hasDeletionInRange = false;
        let maxOldLineSeen = 0;
        for (const row of matched.rows) {
          if (row.hunkHeader) continue;
          const oldLn = row.left.lineNumber;
          if (oldLn == null) continue;
          if (oldLn > maxOldLineSeen) maxOldLineSeen = oldLn;
          if (
            row.left.kind === "del" &&
            oldLn >= b.line_start &&
            oldLn <= b.line_end
          ) {
            hasDeletionInRange = true;
          }
        }

        if (!hasDeletionInRange) {
          issues.push({
            blockIndex: g,
            subIndex: s,
            field: "line_start",
            message: `'${b.file}' part:before range L${b.line_start}-${b.line_end} does not cover any deleted line in the diff. Use part:after for unchanged code, or pick a range that includes a removed/replaced line.`,
          });
        }

        if (maxOldLineSeen > 0 && b.line_start > maxOldLineSeen) {
          issues.push({
            blockIndex: g,
            subIndex: s,
            field: "line_start",
            message: `line_start (${b.line_start}) is past the last pre-change line shown in the diff for '${b.file}' (${maxOldLineSeen}). For part:before, line numbers must reference the OLD file.`,
          });
        }
        continue;
      }

      // part === "after": validate against the file on disk (post-change).
      const fullPath = safelyJoinRepoFile(repoPath, b.file);
      if (!fullPath) {
        issues.push({
          blockIndex: g,
          subIndex: s,
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
          issues.push({
            blockIndex: g,
            subIndex: s,
            field: "part",
            message: `'${b.file}' was deleted in the diff, so part:after has nothing to point at. Use part:before to highlight the removed code.`,
          });
          continue;
        }
        issues.push({
          blockIndex: g,
          subIndex: s,
          field: "file",
          message: `'${b.file}' does not exist on disk at ${fullPath}.`,
        });
        continue;
      }
      if (!info.isFile()) {
        issues.push({
          blockIndex: g,
          subIndex: s,
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
          blockIndex: g,
          subIndex: s,
          field: "file",
          message: `Could not read '${b.file}': ${(err as Error).message}`,
        });
        continue;
      }

      const lines = content.split(/\r?\n/);
      const totalLines = lines.length;

      if (b.line_start > totalLines) {
        issues.push({
          blockIndex: g,
          subIndex: s,
          field: "line_start",
          message: `line_start (${b.line_start}) is past end of '${b.file}' which has ${totalLines} lines.`,
        });
      }
      if (b.line_end > totalLines) {
        issues.push({
          blockIndex: g,
          subIndex: s,
          field: "line_end",
          message: `line_end (${b.line_end}) is past end of '${b.file}' which has ${totalLines} lines.`,
        });
      }

      if (b.line_start <= totalLines) {
        const startLineLen = lines[b.line_start - 1]?.length ?? 0;
        if (b.col_start > startLineLen + 1 && startLineLen > 0) {
          issues.push({
            blockIndex: g,
            subIndex: s,
            field: "col_start",
            message: `col_start (${b.col_start}) is past end of line ${b.line_start} in '${b.file}' (length ${startLineLen}).`,
          });
        }
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
      let prefix: string;
      if (iss.blockIndex != null && iss.subIndex != null) {
        prefix = `Block ${iss.blockIndex + 1}.${iss.subIndex + 1}`;
      } else if (iss.blockIndex != null) {
        prefix = `Block ${iss.blockIndex + 1}`;
      } else {
        prefix = "Top-level";
      }
      if (iss.field) prefix += `.${iss.field}`;
      return `${n + 1}. ${prefix}: ${iss.message}`;
    })
    .join("\n");
}
