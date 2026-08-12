# HCE graph server

The Stage 2 storage backend for the Human Connection Engine — replaces the
browser's IndexedDB store so the graph can be reached from more than one
machine. See `../DECISIONS.md` ("Stage 2 — Storage Moves to a Local
Service") for why this exists and what it trades away.

## What it is

A small single-user Express service. Holds the whole relationship graph in
one JSON file (`~/Library/Application Support/human-connection-engine/graph.json`,
atomic write on every change) and encrypts `Person.notes`/`Person.originStory`
before it hits disk (AES-GCM-256, key in a chmod-0600 file next to the
graph). Binds to `127.0.0.1` only by default — a second machine reaches it
via an SSH tunnel, the same way it reaches the dev-dashboard, not by
widening the bind address to the LAN.

## Run it

```bash
npm install
npm start                 # http://127.0.0.1:5199
npm test                  # node's built-in test runner
```

Override the port/host/data directory for local testing:

```bash
PORT=5299 HOST=127.0.0.1 HCE_DATA_DIR=/tmp/hce-scratch npm start
```

## Run it as a LaunchAgent (recommended for day-to-day use)

```bash
scripts/graph-server-agent.sh install     # write wrapper + plist, load + start
scripts/graph-server-agent.sh status      # loaded? running? which PID?
scripts/graph-server-agent.sh logs        # tail stdout + stderr
scripts/graph-server-agent.sh restart     # after editing server code
scripts/graph-server-agent.sh uninstall   # stop + unload + remove
```

Mirrors `dev-dashboard/scripts/dashboard-agent.sh`'s pattern. Not
registered with dev-dashboard itself — that tool's registry is for things
you open a browser tab on; this is a background data API.

## Reaching it from the client

The React app talks to this service through `src/api/graph.ts`, which
defaults to `http://127.0.0.1:5199`. Override with `VITE_HCE_SERVER_URL` in
a `.env.local` if you run the server on a different port or reach it
through an SSH tunnel from another machine.
