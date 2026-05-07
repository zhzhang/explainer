"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import {
  fileMatches,
  parseDiffToSideBySide,
  type ParsedFile,
  type SideLine,
} from "../lib/parseDiff";
import type { ExplainerBlock } from "../types";

interface DiffViewerProps {
  rawDiff: string;
  activeBlock: ExplainerBlock | null;
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
  activeBlock: ExplainerBlock | null;
  isActiveFile: boolean;
}

const FileBlock = memo(function FileBlock({
  file,
  fileIndex,
  activeBlock,
  isActiveFile,
}: FileBlockProps) {
  const status = file.isNew
    ? "new"
    : file.isDeleted
      ? "deleted"
      : file.isRename
        ? "renamed"
        : "modified";

  const isActiveOnRight = (lineNumber: number | null) => {
    if (!isActiveFile || !activeBlock || lineNumber == null) return false;
    return (
      lineNumber >= activeBlock.line_start && lineNumber <= activeBlock.line_end
    );
  };

  const isActiveOnLeft = (lineNumber: number | null) => {
    if (!isActiveFile || !activeBlock || lineNumber == null) return false;
    if (!file.isDeleted) return false;
    return (
      lineNumber >= activeBlock.line_start && lineNumber <= activeBlock.line_end
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

export default function DiffViewer({ rawDiff, activeBlock }: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const files = useMemo(() => parseDiffToSideBySide(rawDiff), [rawDiff]);

  const activeFileIndex = useMemo(() => {
    if (!activeBlock) return -1;
    return files.findIndex((f) => fileMatches(f, activeBlock.file));
  }, [files, activeBlock]);

  useEffect(() => {
    if (!activeBlock || !containerRef.current) return;
    const root = containerRef.current;
    const targetSelector =
      activeFileIndex >= 0
        ? `[data-file-index="${activeFileIndex}"] [data-side="right"][data-active="true"]`
        : `[data-side="right"][data-active="true"]`;
    const firstActive = root.querySelector<HTMLElement>(targetSelector);
    if (firstActive) {
      firstActive.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (activeFileIndex >= 0) {
      const fileEl = root.querySelector<HTMLElement>(
        `[data-file-index="${activeFileIndex}"]`,
      );
      fileEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeBlock, activeFileIndex]);

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
          activeBlock={activeBlock}
          isActiveFile={idx === activeFileIndex}
        />
      ))}
    </div>
  );
}
