# SSOC 2024 Decision Visualiser — Plan

## Goal
User pastes a job description (or a MyCareersFuture job URL). The app classifies it into an
SSOC 2024 5-digit occupation code using TypeSafe Jev, and shows **how** the decision was made
as a pixel-art animated 2D canvas (style: segmented pixel bars + speech bubbles + pixel
characters grouped by tier, per the reference images).

## Done =
- `npm start` serves the app on http://localhost:5173
- Real MCF postings classify end-to-end; each level's Jev probabilities are animated
- Final code + probability list shown; results plausible for 4+ varied real postings

## Design
- **Data**: official SingStat SSOC 2024 Detailed Definitions xlsx → `data/ssoc2024.json`
  (tools/build_ssoc.py). 5 levels: major(1) → sub-major(2) → minor(3) → unit(4) → occupation(5).
- **Decision method** (TypeSafe hierarchical-classification cookbook):
  1. Beam search, width K=3. At each level, one Jev request holds one `Choice` per beam node
     (its direct children; options described by title + definition/sub-groups). Path prob =
     product of edge probs (all leaves are depth 5, so no length normalisation needed).
  2. **Finals**: top 5 leaves by path prob → one `Choice` with full definitions, tasks and
     example job titles. Its distribution is the final probability list.
- **Server** (`server.mjs`, Node, `@typesafe-ai/sdk`): `POST /api/classify` streams NDJSON
  events (`start`, `level`, `final`, `error`) so the canvas animates as each level returns.
  `GET /api/mcf?url=` fetches a posting from MCF's public API. API key stays server-side.
- **Client** (`public/`): one canvas, stage stepper (L1..L5, Finals), pixel characters generated
  procedurally from a seed (code), tiers: chosen=pink, beam=orange, pruned=yellow, unlikely=grey.

## Steps
1. Build SSOC JSON from xlsx — verify counts per level
2. Server + Jev beam search — verify with curl on a sample JD
3. Canvas frontend — verify in browser
4. Test with 4+ real MCF postings via Chrome — record results in `TEST_RESULTS.md`

## Status (2026-10-25)
All 4 steps done; see `TEST_RESULTS.md`.
Plan changes made during execution:
- Upper-level options now list every occupation title they contain (group names alone hid
  chefs and quantity surveyors). Leaves/finalists carry "classified elsewhere" exclusions.
- MCF postings carry the employer's SSOC 2020 code → mapped to 2024 via SingStat's
  correspondence table and shown as a reference (not ground truth).
- Group X (X → X1000) skips levels; parent = longest existing code prefix.

Open decisions for the user: beam width (3) vs cost; whether to validate on a specialist-coded set.

## Risks
- MCF API shape may change → fall back to pasted text.
- Upper-level SingStat rows lack definitions → use child-group titles as description.
