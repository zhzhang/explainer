import { parse } from "diff2html/lib/diff-parser";
import { LineType, type DiffFile } from "diff2html/lib/types";

export type SideKind = "add" | "del" | "ctx" | "empty";

export interface SideLine {
  kind: SideKind;
  lineNumber: number | null;
  content: string;
}

export interface PairRow {
  left: SideLine;
  right: SideLine;
  hunkHeader?: string;
}

export interface ParsedFile {
  oldName: string;
  newName: string;
  displayName: string;
  language: string;
  isNew: boolean;
  isDeleted: boolean;
  isRename: boolean;
  isBinary: boolean;
  addedLines: number;
  deletedLines: number;
  rows: PairRow[];
}

const EMPTY: SideLine = { kind: "empty", lineNumber: null, content: "" };

function pairBlock(block: DiffFile["blocks"][number]): PairRow[] {
  const rows: PairRow[] = [];
  const lines = block.lines;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === LineType.CONTEXT) {
      rows.push({
        left: {
          kind: "ctx",
          lineNumber: line.oldNumber ?? null,
          content: line.content.replace(/^[ +-]/, ""),
        },
        right: {
          kind: "ctx",
          lineNumber: line.newNumber ?? null,
          content: line.content.replace(/^[ +-]/, ""),
        },
      });
      i++;
      continue;
    }
    if (line.type === LineType.DELETE) {
      const dels: typeof lines = [];
      const adds: typeof lines = [];
      while (i < lines.length && lines[i].type === LineType.DELETE) {
        dels.push(lines[i]);
        i++;
      }
      while (i < lines.length && lines[i].type === LineType.INSERT) {
        adds.push(lines[i]);
        i++;
      }
      const max = Math.max(dels.length, adds.length);
      for (let k = 0; k < max; k++) {
        const d = dels[k];
        const a = adds[k];
        rows.push({
          left: d
            ? {
                kind: "del",
                lineNumber: d.oldNumber ?? null,
                content: d.content.replace(/^[ +-]/, ""),
              }
            : EMPTY,
          right: a
            ? {
                kind: "add",
                lineNumber: a.newNumber ?? null,
                content: a.content.replace(/^[ +-]/, ""),
              }
            : EMPTY,
        });
      }
      continue;
    }
    if (line.type === LineType.INSERT) {
      const adds: typeof lines = [];
      while (i < lines.length && lines[i].type === LineType.INSERT) {
        adds.push(lines[i]);
        i++;
      }
      for (const a of adds) {
        rows.push({
          left: EMPTY,
          right: {
            kind: "add",
            lineNumber: a.newNumber ?? null,
            content: a.content.replace(/^[ +-]/, ""),
          },
        });
      }
      continue;
    }
    i++;
  }
  return rows;
}

export function parseDiffToSideBySide(rawDiff: string): ParsedFile[] {
  if (!rawDiff.trim()) return [];
  const files = parse(rawDiff);
  return files.map((f) => {
    const displayName =
      f.newName && f.newName !== "/dev/null"
        ? f.newName
        : f.oldName ?? "(unknown)";
    const rows: PairRow[] = [];
    for (const block of f.blocks) {
      rows.push({
        left: { kind: "empty", lineNumber: null, content: "" },
        right: { kind: "empty", lineNumber: null, content: "" },
        hunkHeader: block.header,
      });
      rows.push(...pairBlock(block));
    }
    return {
      oldName: f.oldName,
      newName: f.newName,
      displayName,
      language: f.language ?? "",
      isNew: !!f.isNew,
      isDeleted: !!f.isDeleted,
      isRename: !!f.isRename,
      isBinary: !!f.isBinary,
      addedLines: f.addedLines ?? 0,
      deletedLines: f.deletedLines ?? 0,
      rows,
    };
  });
}

export function normalizePath(p: string): string {
  return p.replace(/^[ab]\//, "").replace(/\\/g, "/");
}

export function fileMatches(parsed: ParsedFile, target: string): boolean {
  const t = normalizePath(target);
  return (
    normalizePath(parsed.displayName) === t ||
    normalizePath(parsed.newName) === t ||
    normalizePath(parsed.oldName) === t ||
    normalizePath(parsed.displayName).endsWith("/" + t) ||
    t.endsWith("/" + normalizePath(parsed.displayName))
  );
}

export type HighlightKind = "change" | "context" | "missing";

export function classifyHighlight(
  file: ParsedFile | undefined,
  range: { line_start: number; line_end: number; part?: "before" | "after" },
): HighlightKind {
  if (!file) return "missing";
  const part = range.part ?? "after";
  for (const row of file.rows) {
    if (row.hunkHeader) continue;
    if (part === "before") {
      const ln = row.left.lineNumber;
      if (ln == null) continue;
      if (ln >= range.line_start && ln <= range.line_end) {
        if (row.left.kind === "del") return "change";
      }
    } else {
      const ln = row.right.lineNumber;
      if (ln == null) continue;
      if (ln >= range.line_start && ln <= range.line_end) {
        if (row.right.kind === "add") return "change";
      }
    }
  }
  return "context";
}
