export interface ExplainerBlock {
  file: string;
  line_start: number;
  col_start: number;
  line_end: number;
  col_end: number;
  text: string;
}

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

export interface DiffResult {
  rawDiff: string;
  hasChanges: boolean;
}
