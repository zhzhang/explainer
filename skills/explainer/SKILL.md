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

## Authoring process

Follow these steps every time:

1. **Inspect changes.** Run `git diff HEAD` to see uncommitted changes. If the working tree is clean, run `git log -1 --stat` and `git show HEAD` to use the most recent commit instead.
2. **Read the touched files** so you have correct line numbers in their **current** state (the app reads files at their post-change line numbers).
3. **Group changes into a narrative.** Order entries to tell a coherent story: start with high-level intent, then walk through the code roughly top-down, ending with any tests or wiring. Don't just dump diff hunks.
4. **Pick meaningful ranges.** Each entry should cover one logical unit — a function, a JSX block, an interface, a noteworthy line. Avoid overlapping ranges unless you're zooming in on a sub-section after a wider one.
5. **Write the YAML.** Use the literal block scalar `|` for `text` so newlines are preserved cleanly. Keep total entries between 3 and 15 for a typical change set.
6. **Validate.** Re-read `explainer.yaml` and confirm: every `file` path exists, every `line_end >= line_start`, no entry references lines beyond the file's length, and `text` contains no markdown or code fences.

## Example

```yaml
- file: app/actions.ts
  line_start: 1
  col_start: 1
  line_end: 8
  col_end: 999
  text: |
    This is the server actions file. Everything in here runs on the server,
    which is how we safely shell out to git, the file system, and the Eleven
    Labs API without exposing secrets to the browser.

- file: app/actions.ts
  line_start: 24
  col_start: 1
  line_end: 41
  col_end: 999
  text: |
    The invokeClaude action spawns Claude Code in headless mode, resuming the
    build session you just finished and forking a new branch off it. The fork
    keeps your original session intact while we get a fresh response.

- file: app/components/PlaybackControls.tsx
  line_start: 30
  col_start: 1
  line_end: 60
  col_end: 999
  text: |
    These are the transport controls. Previous and next jump between explainer
    blocks, while play and pause toggle the audio element below. The progress
    bar reflects the current block's position in the overall script.
```

## Output

After writing `explainer.yaml`, print a one-line confirmation like `Wrote explainer.yaml with N blocks.` and stop. Do not echo the YAML body in your final message.
