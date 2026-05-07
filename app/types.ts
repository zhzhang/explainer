export interface ExplainerBlock {
  file: string;
  line_start: number;
  col_start: number;
  line_end: number;
  col_end: number;
  text: string;
}

export interface InvokeClaudeResult {
  forkedSessionId: string | null;
  output: string;
  durationMs: number;
}

export interface DiffResult {
  rawDiff: string;
  hasChanges: boolean;
}
