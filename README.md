# SSOC 2024 Decision Trail

Paste a job description (or a MyCareersFuture link) and watch TypeSafe **Jev** walk the
Singapore Standard Occupational Classification 2024 tree, level by level, to a 5-digit code —
animated as a pixel-art crowd on a 2D canvas, with every probability listed.

## Run

```bash
npm install
npm start          # http://localhost:5173 — needs TYPESAFE_API_KEY in the environment
```

Optional env: `PORT`, `TYPESAFE_MODEL` (default `jev-latest`).

## How the decision is made (`lib/classify.mjs`)

1. **Read** — a Noul asks whether the text is a genuine job posting (asked alongside level 1).
2. **Levels 1–5** — beam search (width 3) over the SSOC tree. Each level is **one** Jev request
   holding one `Choice` per path still in the beam; options are the node's direct children,
   described with SingStat definitions and the occupation titles they contain. Paths are ranked
   by geometric-mean edge probability (TypeSafe hierarchical-classification cookbook).
3. **Finals** — the 5 best leaves meet in one `Choice` with full definitions, example job titles
   and "classified elsewhere" exclusions. Its distribution is the final probability list.

Six requests in total, ~1.4 s. The server streams each step as NDJSON so the canvas animates live.

## Reading the canvas

- **Trail** (top): READ → L1…L5 → FINALS. Click a stop or use ←/→ to revisit.
- **Crowd**: every option Jev weighed, sorted by tier — pink *leading*, orange *kept in beam*,
  gold *considered then pruned*, grey *little chance*. Hover for details.
- **Top paths**: segmented bars show path probability; bubbles show the chain
  (`vote at this level × probability so far`).
- **Finals**: podium heights = final probabilities; result card compares with the employer's
  own MCF tag (SSOC 2020 → 2024).
- **Decision log** below the canvas lists every question and probability as tables.

## Files

| Path | What |
| --- | --- |
| `server.mjs` | HTTP server, `/api/classify` (stream), `/api/mcf` (fetch posting) |
| `lib/classify.mjs` | Beam search + finals using `@typesafe-ai/sdk` |
| `lib/mcf.mjs` | MyCareersFuture public API client |
| `public/` | Canvas app (`app.js`), procedural pixel sprites (`sprites.js`) |
| `data/ssoc2024.json` | Built from SingStat xlsx in `raw/` by `npm run build:data` |
| `tools/eval.mjs` | Runs the 10 sample postings, compares with employer tags |
| `TEST_RESULTS.md` | Latest evaluation |
