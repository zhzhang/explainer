---
description: Produces a structured explainer walkthrough of code changes (or recently authored code) as a YAML script. Triggers when the user asks for an explainer, walkthrough, voiceover script, or asks you to "explain what you just built/changed". Always runs after a coding task when invoked headlessly by the diff-explainer app.
---

# Code Explainer

You are producing an explainer script that will be played back as a Spotify-like audio walkthrough alongside a GitHub-style split diff view. A separate web app (diff-explainer) reads the YAML you write and uses the line/column ranges to highlight code while text-to-speech narrates each block.

## When to use this skill

Run this skill when:

- The user asks for an explainer, walkthrough, narration, voiceover, or "explain what you built/changed"
- You are invoked headlessly (e.g. `claude -p ...`) and the prompt mentions producing or updating `explainer.yaml`
- You have just finished a coding task and the user wants the changes narrated

## What to produce

Write a single file at `explainer.yaml` in the **repository root** (the cwd of the session). Overwrite any existing file.

The file MUST be a YAML list of objects with **exactly** these fields:

```yaml
- file: <repo-relative path, forward slashes>
  line_start: <1-indexed line number where the block begins>
  col_start: <1-indexed column where the block begins, use 1 for whole lines>
  line_end: <1-indexed line number where the block ends, inclusive>
  col_end: <1-indexed column where the block ends, inclusive>
  text: |
    Natural-language explanation, 1-4 sentences. This will be spoken aloud
    by a TTS engine, so write for the ear: short sentences, no bullet points,
    no markdown, no code symbols pronounced literally.
```

### Field rules

- `file` is the path relative to the repo root with forward slashes (e.g. `src/app/page.tsx`), never absolute.
- All line/column numbers are **1-indexed and inclusive** on both ends.
- For whole-line ranges, set `col_start: 1` and `col_end` to the length of the last line (or a large number like 999 if you don't know it; the app clamps to line length).
- `text` is for spoken audio. No code blocks, no inline backticks, no markdown headings, no lists. Spell out short symbol names ("get-diff function") rather than reading punctuation.
- Keep each `text` block between 1 and 4 sentences. Aim for ~10-25 seconds of speech per block.

## Audience and content focus

Write for a **junior developer who just joined the team and is seeing this code for the first time**. They are competent but unfamiliar with this codebase, its conventions, and the product context.

For an initial explainer, prioritize **breadth and orientation over depth**. Each block should cover at most one of these three things, and across the whole script you should hit all three:

1. **The need.** Why does this change exist? What problem or user-facing goal does it solve? Frame it in plain product or workflow terms before touching implementation details.
2. **Key architectural decisions.** What is the shape of the solution and why was it chosen? Mention the boundary the code lives on (server vs. client, action vs. component, schema vs. runtime), and any non-obvious decision like "we validate here instead of at the call site" or "this is a server action so secrets stay on the backend." Skip decisions that are routine for the framework.
3. **Logic that is hard to understand at first glance.** Anything a fresh reader would stumble on: a non-obvious control flow, a subtle invariant, an unusual data shape, a workaround for a quirk. If the code is self-explanatory, do not narrate it line by line.

Hard rules for tone:

- Assume zero familiarity with this repo, but assume general programming literacy. Define repo-specific terms the first time you use them.
- Prefer plain English over jargon. Say "runs on the server" rather than "executes in the Node runtime context."
- Do not narrate what the code literally says ("this function takes a string and returns a number"). Explain *why* it exists or *what would surprise* the reader.
- When in doubt, cut the block. A shorter, clearer script beats an exhaustive one.

## Authoring process

Follow these steps every time:

1. **Inspect changes.** Run `git diff HEAD` to see uncommitted changes. If the working tree is clean, run `git log -1 --stat` and `git show HEAD` to use the most recent commit instead.
2. **Read the touched files** so you have correct line numbers in their **current** state (the app reads files at their post-change line numbers).
3. **Group changes into a narrative for a newcomer.** Order entries to tell a coherent story: start with the *need* (why this change exists), then the *key architectural decisions* (where the code lives and the shape of the solution), and only then zoom in on any *tricky logic* that would trip up a fresh reader. Don't just dump diff hunks, and don't narrate code that is obvious from reading it.
4. **Pick meaningful ranges.** Each entry should cover one logical unit — a function, a JSX block, an interface, a noteworthy line. Avoid overlapping ranges unless you're zooming in on a sub-section after a wider one.
5. **Write the YAML.** Use the literal block scalar `|` for `text` so newlines are preserved cleanly. For an initial explainer, lean toward **fewer, higher-level entries** (typically 3-8) rather than an exhaustive line-by-line tour. Only exceed that range when there are genuinely tricky pieces that need their own block.
6. **Validate.** Re-read `explainer.yaml` and confirm: every `file` path exists, every `line_end >= line_start`, no entry references lines beyond the file's length, and `text` contains no markdown or code fences.

## Example

Notice how the first block frames the *need*, the second covers an *architectural decision* with its rationale, and the third zooms in on a piece of *logic that would surprise a newcomer*.

```yaml
- file: app/actions.ts
  line_start: 1
  col_start: 1
  line_end: 8
  col_end: 999
  text: |
    We needed a safe way to run git commands and call the Eleven Labs API
    without leaking credentials to the browser. This file holds those server
    actions, so anything imported from here runs on the backend only.

- file: app/actions.ts
  line_start: 24
  col_start: 1
  line_end: 41
  col_end: 999
  text: |
    The invokeClaude action forks a brand-new Claude session off the one you
    just finished. We fork instead of continuing in place so your original
    conversation stays untouched if you want to go back to it later.

- file: app/components/PlaybackControls.tsx
  line_start: 30
  col_start: 1
  line_end: 60
  col_end: 999
  text: |
    The progress bar can look confusing because it tracks the current block,
    not the whole script. When you jump to the next block the bar resets to
    zero, since each block is its own audio clip rather than one long file.
```

## Output

After writing `explainer.yaml`, print a one-line confirmation like `Wrote explainer.yaml with N blocks.` and stop. Do not echo the YAML body in your final message.
