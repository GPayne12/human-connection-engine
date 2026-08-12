# screen-ocr

Turns a screen recording of a LinkedIn connections list into a CSV, so the
graph can be populated without waiting on LinkedIn's official export (which
takes up to 24 hours).

Output uses LinkedIn's own export column format, so it feeds the existing
importer (`src/db/linkedin.ts`) with no separate code path — same dedupe,
same skip-existing rule, same empty-`originStory` rule.

Apple frameworks only: AVFoundation samples the video, Vision reads the text.
Nothing to install.

## The process

**1. Record the list.**

Open your connections list (Me → Connections, or
`linkedin.com/mynetwork/invite-connect/connections/`). Press **⌘⇧5**, choose
_Record Selected Portion_, draw a box around the list column, and record while
you scroll.

Two things matter:

- **Scroll slowly** — roughly one screen every two seconds. The sampler takes
  2 frames a second, so a slow scroll means each person lands in several
  frames, and the reconciler votes across them.
- **Keep the "Connected on …" line in shot.** It is the anchor that tells the
  parser where one person ends and the next begins. Without it nothing pairs
  up.

Stop recording. The `.mov` lands on your Desktop.

**2. Convert it.**

```bash
tools/screen-ocr/screen-ocr ~/Desktop/recording.mov -o ~/Desktop/candidates.csv
```

First run compiles the binary (a few seconds), afterwards it is cached.

Options:

| flag                  | meaning                                                                            |
| --------------------- | ---------------------------------------------------------------------------------- |
| `-o, --output <file>` | where to write (default `./connections-ocr.csv`)                                   |
| `--fps <n>`           | frames sampled per second of video (default `2`)                                   |
| `--raw <file>`        | also dump the raw OCR lines, per frame — the thing to look at when output is wrong |

It also accepts a single screenshot or a folder of screenshots, if you would
rather use ⌘⇧4 than record.

**3. Triage it.**

Open the app → **Triage** → load the CSV. One card at a time, name and title
only. Arrow keys or drag: right keeps, left passes. `u` undoes. Nothing
touches the graph until you press import at the end, and people already in
your graph never appear.

Keep the survivors as **dormant** — the origin-story toll gate then asks you
to write how you know someone before they can be promoted or placed on a
campaign board.

## What to expect

OCR guesses. On a real recording expect the great majority of names correct,
some titles clipped, and the occasional garbled row. That is designed for
rather than fought: triage is the filter, and a garbled row costs one left
swipe.

Known limits:

- Capital **I** and lowercase **l** are genuinely ambiguous in LinkedIn's
  font — "AI Enablement" can read as "Al Enablement". Worth a scan of the CSV
  before importing.
- Company is deliberately left empty. Splitting a headline on " at " guesses
  wrong often enough that it would put invented employers in the graph, and
  inventing field content is against the rules this project runs on.
- Someone whose name scrolled off the top of a frame while their headline was
  still visible can produce a junk row. Most are caught automatically (their
  "name" turns out to be someone else's title); the rest get swiped away.
- A recording that never shows "Connected on" produces nothing. Re-run with
  `--raw` to see what was actually read.

## A note on where this data comes from

This reads your own screen showing your own connections, for your own CRM —
the same data LinkedIn hands you in the official export. LinkedIn's user
agreement discourages copying profile information by any means, manual
included, so the official export at _Settings → Data privacy → Get a copy of
your data_ remains the cleaner route when you can wait for it. This exists for
when you cannot.
