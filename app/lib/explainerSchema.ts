import { z } from "zod";

/**
 * `part` selects which side of the diff a sub-block highlights:
 * - "after"  (default): line numbers refer to the post-change file; the
 *   right (added/current) side is highlighted. Use for new or unchanged code.
 * - "before": line numbers refer to the pre-change file; the left
 *   (deleted/old) side is highlighted. Use to point at code that was
 *   removed or replaced and explain why it was there.
 */
export const explainerPartSchema = z.enum(["before", "after"]);
export const explainerTurnSchema = z.enum(["user", "agent"]);

export const explainerSubBlockSchema = z
  .object({
    file: z
      .string()
      .min(1, "must be non-empty")
      .refine((s) => !s.startsWith("/") && !/^[a-zA-Z]:\\/.test(s), {
        message: "must be a repo-relative path (no leading slash or drive)",
      }),
    part: explainerPartSchema.default("after"),
    turn: explainerTurnSchema.default("agent"),
    line_start: z.coerce.number().int().min(1, "must be >= 1"),
    col_start: z.coerce.number().int().min(1, "must be >= 1").default(1),
    line_end: z.coerce.number().int().min(1, "must be >= 1"),
    col_end: z.coerce.number().int().min(1, "must be >= 1").default(9999),
    text: z.string().trim().min(1, "must be non-empty"),
  })
  .refine((v) => v.line_end >= v.line_start, {
    message: "line_end must be >= line_start",
    path: ["line_end"],
  });

/** One narrative block: non-empty list of sub-blocks (each sub-block = one TTS clip + range). */
export const explainerBlockSchema = z.array(explainerSubBlockSchema).min(1, {
  message: "each block must contain at least one sub-block",
});

/** Full explainer: list of blocks. */
export const explainerListSchema = z.array(explainerBlockSchema).min(1, {
  message: "explainer.yaml must contain at least one block",
});

export type ExplainerSubBlockParsed = z.infer<typeof explainerSubBlockSchema>;
export type ExplainerBlockParsed = z.infer<typeof explainerBlockSchema>;
export type ExplainerListParsed = z.infer<typeof explainerListSchema>;
