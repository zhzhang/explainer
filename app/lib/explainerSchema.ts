import { z } from "zod";

export const explainerBlockSchema = z
  .object({
    file: z
      .string()
      .min(1, "must be non-empty")
      .refine((s) => !s.startsWith("/") && !/^[a-zA-Z]:\\/.test(s), {
        message: "must be a repo-relative path (no leading slash or drive)",
      }),
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

export const explainerListSchema = z.array(explainerBlockSchema).min(1, {
  message: "explainer.yaml must contain at least one block",
});

export type ExplainerBlockParsed = z.infer<typeof explainerBlockSchema>;
