# Test results — 2026-10-25

10 real MyCareersFuture postings (picked across occupations via MCF search), run with
`node tools/eval.mjs`. "Employer tag" is the SSOC 2020 code the employer chose on MCF, mapped to
SSOC 2024 with SingStat's correspondence table. It is a **reference, not ground truth** —
employers often pick a nearby code.

Model `jev-latest`, beam width 3, 5 finalists. ~1.4 s and ~24.6k input tokens per job (6 requests).

| Posting | Jev (SSOC 2024) | P | Employer tag (2024) | Verdict |
| --- | --- | --- | --- | --- |
| Staff Nurse (AU) | 22200 Registered nurse… | 99% | 22200 | ✓ match |
| Chef de Partie (halal stall) | 51202 Senior cook | 96% | 34341 Chef | Jev follows SingStat: 34341 says *"Chef de partie, see 51202"* |
| Senior Software Engineer | 25121 Software developer | 77% | 21522 Computer engineer | Posting is software development → Jev more plausible |
| Childcare Meal Delivery Driver | 83229 Car/Van/Light goods driver | 72% | 83321 Lorry driver | Posting doesn't state vehicle class; ambiguous (Van driver 27% runner-up) |
| Accounts Executive (part-time) | 43112 Ledger/Accounts clerk | 67% | 43112 | ✓ match |
| Preschool Teacher | 36100 Preschool education teacher | 100% | 36100 | ✓ match |
| Kitchen / Game Shop Cleaner | 91131 Indoor cleaner | 84% | 91131 | ✓ match |
| Senior Consultant, Data Analyst (KYC migration) | 21231 Statistical officer/Data analyst | 61% | 24212 Business consultant | Genuinely ambiguous; lower probability reflects it |
| Quantity Surveyor | 21494 Quantity surveyor | 97% | 31294 QS technician | Plausible; professional vs technician level depends on role seniority |
| Logistics Admin Assistant | 43231 Shipping clerk | 82% | 33461 Logistics planner | Clerical admin duties → Jev plausible |

**Exact agreement with employer tag: 4/10.** The employer's code reached the finals in 6/10.
In my reading, none of the 6 disagreements is a clear Jev error. Two (Chef, Software Engineer)
favour Jev per SingStat's own definitions; the rest are ambiguous postings. A labelled set coded
by an SSOC specialist would be needed to measure true accuracy.

## What changed during testing
- **Baseline** (options described by group titles only): Quantity Surveyor → *21651 Land surveyor
  (37%)*; Chef's major group 3 pruned at level 1 (group titles like "Artistic and Cultural
  Associate Professionals" hide chefs).
- **Fix**: each upper-level option now lists every occupation title inside it; leaf options and
  finalists also carry SingStat's "classified elsewhere" exclusions. Quantity Surveyor → 21494
  (97%), employer code reaching finals 4/10 → 6/10, at ~2× input tokens.

## Edge cases
- Non-job text (a weekend story): genuine-job Noul = 2%, final = X1000 *Worker reporting
  unidentifiable or inadequately described occupation*.
- Pasted description without MCF ("Barista…"): 51322 Barista, 100%.
- Too-short input / non-MCF link: clear 400 errors shown in the UI.

## UI checks (Chrome, desktop 1288px and 375px iframe)
Trail, crowd sorting, bars, bubbles, finals podium, result card, tooltip, decision log, Prev/Next/
Pause/Replay verified. Fixed during testing: narrow-screen stacking, trail code overlap, bubble
truncation, and a crash when a frame rendered before the first stream event (froze animation).
