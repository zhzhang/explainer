---
description: Produces a structured explainer walkthrough of code changes (or recently authored code) as a YAML script. Triggers when the user asks for an explainer, walkthrough, voiceover script, or asks you to "explain what you just built/changed". Always runs after a coding task when invoked headlessly by the diff-explainer app.
---

# Code Explainer

You are producing an explainer script that will be played back as a Spotify-like audio walkthrough alongside a GitHub-style split diff view. A separate web app (diff-explainer) reads the YAML you write and uses the line/column ranges to highlight code while text-to-speech narrates each **sub-block** (one audio clip per sub-block).

## When to use this skill

Run this skill when:

- The user asks for an explainer, walkthrough, narration, voiceover, or "explain what you built/changed"
- You are invoked headlessly (e.g. `claude -p ...`) and the prompt mentions producing or updating `explainer.yaml`
- You have just finished a coding task and the user wants the changes narrated

## What to produce

Write a single file at `explainer.yaml` in the **repository root** (the cwd of the session).

The file MUST be a **YAML list of lists**: each **outer** item is one **block** (one coherent thought for the UI). Each block is a non-empty list of **sub-blocks**. Each sub-object has **exactly** these fields:

```yaml
- - file: <repo-relative path, forward slashes>
    line_start: <1-indexed line where the range begins>
    col_start: <1-indexed column where the range begins, use 1 for whole lines>
    line_end: <1-indexed line where the range ends, inclusive>
    col_end: <1-indexed column where the range ends, inclusive>
    text: |
      Natural-language segment for this sub-block, 1-4 sentences. Spoken by TTS
      as its own clip: short sentences, no bullet points, no markdown, no code
      symbols pronounced literally.
  - file: <same or other file>
    line_start: ...
    col_start: 1
    line_end: ...
    col_end: 999
    text: |
      Another segment that belongs to the same coherent thought as the first
      sub-block (e.g. zoom from a function to its caller).
- - file: src/other.ts
    line_start: 1
    col_start: 1
    line_end: 20
    col_end: 999
    text: |
      A new block: a separate narrative beat (need, architecture, or tricky logic).
```

### Block vs sub-block

- **Block** (outer list item): one coherent thought. The front end shows **all** sub-block `text` in that block together and highlights the code range for whichever sub-block is currently being narrated.
- **Sub-block** (inner list item): one line/column range + one TTS clip. **Use multiple sub-blocks whenever the thought touches more than one range** — this is the main mechanism for connecting code that lives in different places. Use a single sub-block only when one range fully supports the idea on its own.

### Narrative shape (don't walk top-to-bottom)

Order ranges by **how the reader's understanding builds**, not by where they sit in the diff. The UI already shows the diff next to your audio, so a linear file walkthrough is redundant — the reader can see that for themselves.

Default to **multi-sub-block blocks** whenever a concept lives in more than one place. A block is most useful when it pins one idea down by pointing at every range that idea touches, in any order.

Common cross-reference patterns (use these by name in your plan):

- **Definition ↔ use site.** Anchor on a schema, type, or function, then point at the place that consumes it. Often it is clearer to start with the **use site** and zoom back to the definition once the reader knows why it matters.
- **Producer ↔ consumer.** A server action and the component that calls it. A reducer and the dispatch site. Show both ranges in one block and have the audio bridge them ("…and the UI fires that action here, when the user clicks play").
- **Cause ↔ effect.** An event handler and the state or DOM it ends up changing.
- **Boundary pair.** Server-side code and the client-side code on the other side of the boundary, narrated as one thought.
- **Invariant + enforcement.** State the invariant once on the data shape, then point at every range that protects it.

When you do walk a single file, prefer **outside-in** (entry point first, dependencies after) or **interesting-first** (the surprising line first, then the surrounding context) over top-to-bottom.

### Incremental writes (critical)

The app polls `explainer.yaml` while you work. **After each block is finalized**, rewrite `explainer.yaml` **from scratch** with every completed block so far. The file must always be **valid YAML** matching the schema (a list of lists). Do **not** append fragments by hand or leave the file in a broken state between steps.

Then plan the next block, add it, and rewrite the whole file again. Repeat until the script is complete.

### Field rules

- `file` is the path relative to the repo root with forward slashes (e.g. `src/app/page.tsx`), never absolute.
- All line/column numbers are **1-indexed and inclusive** on both ends.
- For whole-line ranges, set `col_start: 1` and `col_end` to the length of the last line (or a large number like 999 if you don't know it; the app clamps to line length).
- `text` is for spoken audio. No code blocks, no inline backticks, no markdown headings, no lists. Spell out short symbol names ("get-diff function") rather than reading punctuation.
- Keep each sub-block `text` between 1 and 4 sentences. Aim for ~10–25 seconds of speech per sub-block.
- Aim for **3–8 blocks** total for an initial explainer; **1–3 sub-blocks** per block unless something genuinely needs more.

## Audience and content focus

Write for a **junior developer who just joined the team and is seeing this code for the first time**. They are competent but unfamiliar with this codebase, its conventions, and the product context.

For an initial explainer, prioritize **breadth and orientation over depth**. Each **block** should cover at most one of these three things, and across the whole script you should hit all three:

1. **The need.** Why does this change exist? What problem or user-facing goal does it solve? Frame it in plain product or workflow terms before touching implementation details.
2. **Key architectural decisions.** What is the shape of the solution and why was it chosen? Mention the boundary the code lives on (server vs. client, action vs. component, schema vs. runtime), and any non-obvious decision like "we validate here instead of at the call site" or "this is a server action so secrets stay on the backend." Skip decisions that are routine for the framework.
3. **Logic that is hard to understand at first glance.** Anything a fresh reader would stumble on: a non-obvious control flow, a subtle invariant, an unusual data shape, a workaround for a quirk. If the code is self-explanatory, do not narrate it line by line.

Hard rules for tone:

- Assume zero familiarity with this repo, but assume general programming literacy. Define repo-specific terms the first time you use them.
- Prefer plain English over jargon. Say "runs on the server" rather than "executes in the Node runtime context."
- Do not narrate what the code literally says ("this function takes a string and returns a number"). Explain *why* it exists or *what would surprise* the reader.
- When in doubt, cut the block. A shorter, clearer script beats an exhaustive one.
- **Do not narrate the diff in file order.** If your blocks happen to march top-to-bottom through one file and then top-to-bottom through the next, your script is almost certainly missing the cross-references that make the change make sense. Re-plan around interactions.
- **Verbally bridge sub-blocks.** When a block has multiple ranges, the audio for each sub-block should reference the others ("the schema we just saw," "this is what calls it," "and that's what flips the flag we defined above"). Don't make the listener guess why two ranges are grouped.

## Authoring process

Follow these steps every time:

0. **Plan first (chat only).** Before writing any YAML, output a short **numbered outline** (one line per planned **block**). For each block, write `<concept> — <range A> ↔ <range B>` so you commit to the cross-references before you write text. Keep it under ~8 bullets. This is only in your reply — do not persist it as a separate file.
1. **Inspect changes.** Run `git diff HEAD` to see uncommitted changes. If the working tree is clean, run `git log -1 --stat` and `git show HEAD` to use the most recent commit instead.
2. **Read the touched files** so you have correct line numbers in their **current** state (the app reads files at their post-change line numbers).
3. **Group changes into a narrative for a newcomer.** Order **blocks** to tell a coherent story: start with the *need*, then *key architectural decisions*, then *tricky logic*. Don't just dump diff hunks, and don't narrate code that is obvious from reading it.
4. **Pick meaningful ranges.** Each **sub-block** should cover one logical unit — a function, a JSX block, an interface, a noteworthy line. Avoid overlapping ranges within the same story unless you're zooming in after a wider span.
5. **Write the YAML incrementally.** After each **block** is done, rewrite `explainer.yaml` with all blocks completed so far (valid list-of-lists). Use the literal block scalar `|` for each `text`. Lean toward fewer, higher-level **blocks** (typically 3–8) rather than an exhaustive tour.
6. **Validate.** After the final rewrite, re-read `explainer.yaml` and confirm: every `file` path exists, every `line_end >= line_start`, no entry references lines beyond the file's length, and `text` contains no markdown or code fences.

## Example

The first **block** zooms from a use site forward to the definition in another file (definition ↔ use). The second block uses two ranges within the same file to connect a check to the data it depends on, walked backward (consumer first, then the producer a few lines earlier). The third is a single sub-block, reserved for a piece of genuinely standalone tricky logic.

```yaml
- - file: app/lib/validateExplainer.ts
    line_start: 100
    col_start: 1
    line_end: 105
    col_end: 999
    text: |
      The whole point of this file is to refuse a broken explainer dot yaml
      before the UI ever sees it. The shape it enforces is defined elsewhere,
      so this line is really a handoff to the schema.
  - file: app/lib/explainerSchema.ts
    line_start: 3
    col_start: 1
    line_end: 30
    col_end: 999
    text: |
      Here is that schema. Two ideas worth noticing. A block is a list of
      sub-blocks, and the top level is a list of blocks. That is why the
      validator we just looked at parses a list of lists.

- - file: app/lib/validateExplainer.ts
    line_start: 120
    col_start: 1
    line_end: 133
    col_end: 999
    text: |
      Schema validation alone is not enough. Even a well-formed entry can
      point at a file that is not in the diff, so we cross-check against the
      actual changed files here.
  - file: app/lib/validateExplainer.ts
    line_start: 108
    col_start: 1
    line_end: 118
    col_end: 999
    text: |
      That set of changed files is built up here from the diff, a few lines
      earlier. We collect both old and new names so a rename still matches.

- - file: app/lib/validateExplainer.ts
    line_start: 187
    col_start: 1
    line_end: 217
    col_end: 999
    text: |
      The trickiest part of the file. We do not just trust the line numbers
      in the yaml, we read the file from disk and confirm the range fits.
      That is what catches an explainer written against stale line numbers
      after the agent forgot to re-read the file.
```

## Output

After the final `explainer.yaml` rewrite, print a one-line confirmation like `Wrote explainer.yaml with N blocks (M sub-blocks).` and stop. Do not echo the YAML body in your final message.
