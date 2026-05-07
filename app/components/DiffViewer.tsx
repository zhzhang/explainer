"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import {
  fileMatches,
  parseDiffToSideBySide,
  type ParsedFile,
  type SideLine,
} from "../lib/parseDiff";
import type { ExplainerSubBlock } from "../types";

interface DiffViewerProps {
  rawDiff: string;
  activeSubBlock: ExplainerSubBlock | null;
}

function lineClass(kind: SideLine["kind"]) {
  switch (kind) {
    case "add":
      return "diff-line add";
    case "del":
      return "diff-line del";
    case "ctx":
      return "diff-line ctx";
    case "empty":
      return "diff-line empty";
  }
}

interface FileBlockProps {
  file: ParsedFile;
  fileIndex: number;
  activeSubBlock: ExplainerSubBlock | null;
  isActiveFile: boolean;
}

const FileBlock = memo(function FileBlock({
  file,
  fileIndex,
  activeSubBlock,
  isActiveFile,
}: FileBlockProps) {
  const status = file.isNew
    ? "new"
    : file.isDeleted
      ? "deleted"
      : file.isRename
        ? "renamed"
        : "modified";

  const activePart = activeSubBlock?.part ?? "after";

  const isActiveOnRight = (lineNumber: number | null) => {
    if (!isActiveFile || !activeSubBlock || lineNumber == null) return false;
    if (activePart !== "after") return false;
    return (
      lineNumber >= activeSubBlock.line_start &&
      lineNumber <= activeSubBlock.line_end
    );
  };

  const isActiveOnLeft = (lineNumber: number | null) => {
    if (!isActiveFile || !activeSubBlock || lineNumber == null) return false;
    if (activePart === "before") {
      return (
        lineNumber >= activeSubBlock.line_start &&
        lineNumber <= activeSubBlock.line_end
      );
    }
    // Legacy fallback for fully-deleted files referenced with part:after.
    if (!file.isDeleted) return false;
    return (
      lineNumber >= activeSubBlock.line_start &&
      lineNumber <= activeSubBlock.line_end
    );
  };

  return (
    <section
      className="rounded-lg overflow-hidden border border-[var(--border)] mb-6 bg-[var(--panel)]"
      data-file-index={fileIndex}
      data-file-name={file.displayName}
    >
      <header className="diff-file-header">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[#26262c] text-[var(--muted)]">
            {status}
          </span>
          <span className="truncate">{file.displayName}</span>
        </div>
        <div className="diff-file-stats">
          <span className="added">+{file.addedLines}</span>
          <span className="deleted">-{file.deletedLines}</span>
        </div>
      </header>

      {file.isBinary ? (
        <div className="p-4 text-sm text-[var(--muted)]">
          Binary file — diff not shown.
        </div>
      ) : (
        <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
          <div className="overflow-x-auto scrollbar-slim">
            {file.rows.map((row, i) =>
              row.hunkHeader ? (
                <div className="diff-hunk-header col-span-1" key={`l-h-${i}`}>
                  {row.hunkHeader}
                </div>
              ) : (
                <div
                  key={`l-${i}`}
                  className={`${lineClass(row.left.kind)} ${
                    isActiveOnLeft(row.left.lineNumber) ? "active-highlight" : ""
                  }`}
                  data-side="left"
                  data-line={row.left.lineNumber ?? ""}
                  data-active={
                    isActiveOnLeft(row.left.lineNumber) ? "true" : "false"
                  }
                >
                  <div className="gutter">{row.left.lineNumber ?? ""}</div>
                  <div className="code">{row.left.content || "\u00A0"}</div>
                </div>
              ),
            )}
          </div>
          <div className="overflow-x-auto scrollbar-slim">
            {file.rows.map((row, i) =>
              row.hunkHeader ? (
                <div className="diff-hunk-header col-span-1" key={`r-h-${i}`}>
                  {row.hunkHeader}
                </div>
              ) : (
                <div
                  key={`r-${i}`}
                  className={`${lineClass(row.right.kind)} ${
                    isActiveOnRight(row.right.lineNumber)
                      ? "active-highlight"
                      : ""
                  }`}
                  data-side="right"
                  data-line={row.right.lineNumber ?? ""}
                  data-active={
                    isActiveOnRight(row.right.lineNumber) ? "true" : "false"
                  }
                >
                  <div className="gutter">{row.right.lineNumber ?? ""}</div>
                  <div className="code">{row.right.content || "\u00A0"}</div>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </section>
  );
});

export default function DiffViewer({
  rawDiff,
  activeSubBlock,
}: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const files = useMemo(() => parseDiffToSideBySide(rawDiff), [rawDiff]);

  const activeFileIndex = useMemo(() => {
    if (!activeSubBlock) return -1;
    return files.findIndex((f) => fileMatches(f, activeSubBlock.file));
  }, [files, activeSubBlock]);

  useEffect(() => {
    if (!activeSubBlock || !containerRef.current) return;
    const root = containerRef.current;
    const side = activeSubBlock.part === "before" ? "left" : "right";
    const targetSelector =
      activeFileIndex >= 0
        ? `[data-file-index="${activeFileIndex}"] [data-side="${side}"][data-active="true"]`
        : `[data-side="${side}"][data-active="true"]`;
    const firstActive = root.querySelector<HTMLElement>(targetSelector);
    if (firstActive) {
      firstActive.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (activeFileIndex >= 0) {
      const fileEl = root.querySelector<HTMLElement>(
        `[data-file-index="${activeFileIndex}"]`,
      );
      fileEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeSubBlock, activeFileIndex]);

  if (files.length === 0) {
    return (
      <div className="p-12 text-center text-[var(--muted)]">
        No changes to display.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="px-6 py-4">
      {files.map((file, idx) => (
        <FileBlock
          key={`${file.displayName}-${idx}`}
          file={file}
          fileIndex={idx}
          activeSubBlock={activeSubBlock}
          isActiveFile={idx === activeFileIndex}
        />
      ))}
    </div>
  );
}
