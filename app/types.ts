/**
 * Which side of the diff a sub-block points at. "after" (default) means the
 * post-change file (right side of the split diff); "before" means the
 * pre-change file (left side) and is used to explain deletions or
 * modifications relative to what used to be there.
 */
export type ExplainerPart = "before" | "after";

/** Who is speaking in this sub-block; the player skips `user` (no TTS). */
export type ExplainerTurn = "user" | "agent";

/** One TTS segment + code range; several sub-blocks form one on-screen "block". */
export interface ExplainerSubBlock {
  file: string;
  part: ExplainerPart;
  /** Defaults to `agent` when omitted (YAML / Zod default). */
  turn?: ExplainerTurn;
  line_start: number;
  col_start: number;
  line_end: number;
  col_end: number;
  text: string;
}

/** One coherent thought in the UI: ordered sub-blocks narrated one clip at a time. */
export type ExplainerBlock = ExplainerSubBlock[];

export interface ClaudeAttempt {
  attempt: number;
  output: string;
  validationIssues: string[];
  durationMs: number;
}

export interface InvokeClaudeResult {
  forkedSessionId: string | null;
  attempts: ClaudeAttempt[];
  validated: boolean;
  totalDurationMs: number;
}

export interface InvokeClaudeClarificationResult {
  forkedSessionId: string | null;
  blocks: ExplainerBlock[];
  attempts: ClaudeAttempt[];
  validated: boolean;
  totalDurationMs: number;
}

export interface DiffResult {
  rawDiff: string;
  hasChanges: boolean;
}
