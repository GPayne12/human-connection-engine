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

Recognition is the slow part — roughly a minute per 60 frames, so a
ten-minute recording at the default 2 fps takes about twenty minutes. Always
pass `--raw`: it costs nothing and it is what makes the re-parse below
possible.

Options:

| flag                  | meaning                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-o, --output <file>` | where to write (default `./connections-ocr.csv`)                                                                                                               |
| `--fps <n>`           | frames sampled per second of video (default `2`)                                                                                                               |
| `--raw <file>`        | also dump the raw OCR lines, per frame — the thing to look at when output is wrong, and the input to a re-parse                                                |
| `--min-sightings <n>` | drop anyone seen in fewer than n frames (default `1`, keep everything). `2` clears most motion-blur debris but also loses real people caught in a single frame |

It also accepts a single screenshot or a folder of screenshots, if you would
rather use ⌘⇧4 than record.

**Re-parsing without re-reading the video.** Pass a `--raw` dump back in as the
input and it skips recognition entirely, running only the parser:

```bash
tools/screen-ocr/screen-ocr ~/Desktop/ocr-raw.txt -o ~/Desktop/candidates.csv --min-sightings 2
```

Twelve seconds instead of twenty minutes. This is the way to try a different
`--min-sightings`, and the way any future parser change gets tested against a
real recording.

**3. Triage it.**

Open the app → **Triage** → load the CSV. One card at a time, name and title
only. Arrow keys or drag: right keeps, left passes. `u` undoes. Nothing
touches the graph until you press import at the end, and people already in
your graph never appear.

Keep the survivors as **dormant** — the origin-story toll gate then asks you
to write how you know someone before they can be promoted or placed on a
campaign board.

## What to expect

OCR guesses. On a real ten-minute recording — about 1,100 people — expect the
great majority of names and headlines correct, a couple of percent with no
headline, and roughly thirty to fifty garbled rows from frames caught
mid-scroll. That is designed for rather than fought: triage is the filter, and
a garbled row costs one left swipe.

Known limits:

- Capital **I** and lowercase **l** are genuinely ambiguous in LinkedIn's
  font — "AI Enablement" can read as "Al Enablement". Worth a scan of the CSV
  before importing.
- Company is deliberately left empty. Splitting a headline on " at " guesses
  wrong often enough that it would put invented employers in the graph, and
  inventing field content is against the rules this project runs on.
- Someone whose name scrolled off the top of a frame while their headline was
  still visible can produce a junk row whose "name" is really a job title.
  Most are caught — by the occupational-word filter, or because the same text
  turns up as somebody else's headline — and the rest get swiped away.
- Motion blur produces unreadable rows. `--min-sightings 2` removes nearly all
  of them, because debris reads differently in every frame while a real person
  appears in dozens. It is not the default because the same threshold silently
  drops real people who were caught in only one frame, and a missing person
  cannot be swiped back in.
- A recording that never shows "Connected on" produces nothing. Re-run with
  `--raw` to see what was actually read.

## Why the parser is shaped this way

Three things were learned the hard way against a real recording, and are worth
not re-discovering:

- **The Message button sits between the name and the headline**, not after the
  entry. Treating it as an end-of-row marker discards every name and promotes
  each headline into the name slot. It is stripped as noise instead — including
  from inside a line, since Vision often merges it with neighbouring text
  ("..• Message ) Head of Design").
- **Entries are parsed per frame, never across frames.** A scroll cuts an entry
  in half at the frame edge, and carrying the remainder forward glues one
  person's headline onto the next person's name.
- **Frames are decoded in one sequential pass and recognized as they stream.**
  Seeking to each sampled frame forces a decode from the nearest keyframe every
  time, which turns a ten-minute video into an unusable wait; holding all the
  frames in memory first costs gigabytes.

A short synthetic clip catches none of these. `--raw` plus the re-parse mode
exists so the real recording can serve as the test case.

## A note on where this data comes from

This reads your own screen showing your own connections, for your own CRM —
the same data LinkedIn hands you in the official export. LinkedIn's user
agreement discourages copying profile information by any means, manual
included, so the official export at _Settings → Data privacy → Get a copy of
your data_ remains the cleaner route when you can wait for it. This exists for
when you cannot.
