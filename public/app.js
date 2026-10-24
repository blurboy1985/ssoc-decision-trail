import { drawSprite, W as SW, H as SH } from "./sprites.js";

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

const SAMPLES = [
  ["Staff nurse", "f25e8f8108fb9346ce74980a5d401a88"],
  ["Chef", "db01383b7a3187158ce89221627dd074"],
  ["Software engineer", "d79c61fae9edc00c420cec7caf2c7087"],
  ["Delivery driver", "688c4c2e808bc48d7dfd835b44ca76f9"],
  ["Accounts executive", "f82866baca399f92e4045bee39e7663e"],
  ["Preschool teacher", "f7db7cb79e68b243af80a45258fb0091"],
  ["Cleaner", "1cd00320c4df10d2895049412a2f58d0"],
  ["Data analyst", "06841fabd6cf18e8eb809ea000250071"],
  ["Quantity surveyor", "1ff14df417560b4d3319d32bf0ccdd16"],
  ["Logistics admin", "77a74ff1e1014c5d85a1a80a3eaf8d78"],
];

const C = {
  paper: "#ffffff", soft: "#f6f8fb", sky: "#cfd8e3", ink: "#5a6782", inkStrong: "#2b3448",
  seg: "#cdd5e0", red: "#d9606e", redDark: "#a3243a", orange: "#e5683a", orangeDark: "#a8431f",
  gold: "#c9952b", goldDark: "#6e4c10", grey: "#6f6a62", greyDark: "#2b2723", crown: "#f2c14e",
};
const TIER_FILL = { lead: C.red, kept: C.orange, pruned: C.gold, dim: C.grey };
const TIER_DARK = { lead: C.redDark, kept: C.orangeDark, pruned: C.goldDark, dim: C.greyDark };
const TIER_HEAD = {
  lead: "Leading the race",
  kept: "Still in the running · kept in the beam",
  pruned: "Considered, then pruned",
  dim: "Little chance",
};
const STOPS = [
  { key: "read", label: "READ", short: "READ" },
  { key: "r1", label: "MAJOR", short: "L1" },
  { key: "r2", label: "SUB-MAJOR", short: "L2" },
  { key: "r3", label: "MINOR", short: "L3" },
  { key: "r4", label: "UNIT", short: "L4" },
  { key: "r5", label: "OCCUPATION", short: "L5" },
  { key: "finals", label: "FINALS", short: "FINAL" },
];
const F = {
  head: (s, w = 700) => `${w} ${s}px "Barlow Semi Condensed", system-ui, sans-serif`,
  body: (s, w = 400) => `${w} ${s}px "IBM Plex Sans", system-ui, sans-serif`,
  pix: (s, w = 400) => `${w} ${s}px "Pixelify Sans", monospace`,
  // SSOC codes: the heading face reads far better than the pixel face at small sizes
  code: (s, w = 600) => `${w} ${s}px "Barlow Semi Condensed", system-ui, sans-serif`,
};
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const PAD = 24;
const TRAIL_H = 128; // tall enough that the rule at the bottom clears the codes under each stop

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const canvas = $("scene");
const ctx = canvas.getContext("2d");

let run = null; // { start, asking: {}, rounds: [], finalsAsking, final, error, dataAt: {} }
const view = { scene: -1, enteredAt: 0, autoplay: true, walkFrom: 0, walkTo: 0, walkStart: 0, mouse: null };
let hits = [];
let reference = null;
let width = 0;
let height = 720;
let dpr = 1;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeBack = (t) => { t = clamp(t); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const now = () => performance.now();

function pct(p) {
  if (p >= 0.995) return "100%";
  if (p > 0 && p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}

const SMALL = new Set(["and", "of", "the", "in", "for", "not", "or", "to", "n.e.c."]);
function nice(title) {
  if (title !== title.toUpperCase()) return title;
  return title.toLowerCase().split(" ").map((w, i) => {
    if (/^\([a-z]{2,5}\)$/.test(w)) return w.toUpperCase(); // acronyms such as (ICT)
    return i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}

function wrap(text, maxW, maxLines = Infinity) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(test).width <= maxW) line = test;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    let last = cut[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    cut[maxLines - 1] = `${last.trimEnd()}…`;
    return cut;
  }
  return lines;
}

function ellipsis(text, maxW) {
  return wrap(text, maxW, 1)[0] || "";
}

function text(str, x, y, font, color, align = "left", baseline = "alphabetic") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
}

/** Notched pixel frame, like the bar outlines in the reference art. */
function frame(x, y, w, h, color, t = 4, fill = null) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(x + t, y + t, w - 2 * t, h - 2 * t); }
  ctx.fillStyle = color;
  ctx.fillRect(x + t, y, w - 2 * t, t);
  ctx.fillRect(x + t, y + h - t, w - 2 * t, t);
  ctx.fillRect(x, y + t, t, h - 2 * t);
  ctx.fillRect(x + w - t, y + t, t, h - 2 * t);
}

/** Square speech bubble with a solid border (reference image 1). */
function bubble(x, y, w, h) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = C.paper;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
}

/** Ten-segment pixel bar; `v` is 0..1. */
function segBar(x, y, w, h, v, color) {
  frame(x, y, w, h, C.ink, 4, C.paper);
  const inner = 8;
  const gap = 5;
  const segW = (w - inner * 2 - gap * 9) / 10;
  const segH = h - inner * 2;
  for (let i = 0; i < 10; i++) {
    const sx = Math.round(x + inner + i * (segW + gap));
    ctx.fillStyle = C.seg;
    ctx.fillRect(sx, y + inner, Math.round(segW), segH);
    const fill = clamp(v * 10 - i) * segW;
    if (fill > 0) {
      ctx.fillStyle = color;
      ctx.fillRect(sx, y + inner, Math.max(2, Math.round(fill / 2) * 2), segH);
    }
  }
}

function hit(x, y, w, h, info) {
  hits.push({ x, y, w, h, ...info });
}

// Crown drawn in sprite pixels above the winner.
const CROWN = ["#...#...#", "##.###.##", "#########", "#########"];
function crown(cx, top, scale) {
  const w = CROWN[0].length;
  for (let r = 0; r < CROWN.length; r++) for (let c = 0; c < w; c++) {
    if (CROWN[r][c] !== "#") continue;
    ctx.fillStyle = r === 3 ? "#b8860b" : C.crown;
    ctx.fillRect(Math.round(cx - (w * scale) / 2 + c * scale), Math.round(top + r * scale), scale, scale);
  }
}

// ---------------------------------------------------------------------------------------------
// Scene availability & navigation
// ---------------------------------------------------------------------------------------------

function sceneData(i) {
  const key = STOPS[i]?.key;
  if (!run || !key) return null;
  if (key === "read") return run.start ? { kind: "read" } : null;
  if (key === "finals") return run.final || run.finalsAsking ? { kind: "finals" } : null;
  const r = Number(key.slice(1));
  if (run.rounds[r - 1] || run.asking[r]) return { kind: "round", round: r };
  return null;
}

function lastAvailable() {
  let last = -1;
  for (let i = 0; i < STOPS.length; i++) if (sceneData(i)) last = i;
  return last;
}

function nextAvailable(from) {
  for (let i = from + 1; i < STOPS.length; i++) if (sceneData(i)) return i;
  return -1;
}

function prevAvailable(from) {
  for (let i = from - 1; i >= 0; i--) if (sceneData(i)) return i;
  return -1;
}

function goTo(i, byUser = false) {
  if (i < 0 || !sceneData(i)) return;
  view.walkFrom = view.scene < 0 ? i : view.scene;
  view.walkTo = i;
  view.walkStart = now();
  view.scene = i;
  view.enteredAt = now();
  if (byUser) setAutoplay(false);
  describeScene();
  updateControls();
}

function setAutoplay(on) {
  view.autoplay = on;
  $("playBtn").textContent = on ? "❚❚ Pause" : "▶ Play";
}

function dwell(i) {
  if (REDUCED) return 1400;
  return STOPS[i].key === "read" ? 2800 : 4600;
}

function updateControls() {
  const has = Boolean(run && run.start);
  $("prevBtn").disabled = !has || prevAvailable(view.scene) < 0;
  $("nextBtn").disabled = !has || nextAvailable(view.scene) < 0;
  $("replayBtn").disabled = !has;
  $("playBtn").disabled = !has;
  const f = run?.final;
  $("meta").textContent = f ? `${f.model} · ${f.usage.requests} Jev requests · ${(f.totalMs / 1000).toFixed(2)} s` : "";
}

/** Plain-text version of the current scene for screen readers. */
function describeScene() {
  const el = $("sceneText");
  const d = sceneData(view.scene);
  if (!d) { el.textContent = ""; return; }
  if (d.kind === "read") {
    const isJob = run.rounds[0]?.isJob;
    el.textContent = `Reading the job ad.${isJob != null ? ` Jev rates it ${pct(isJob)} likely to be a genuine job posting.` : ""}`;
  } else if (d.kind === "round") {
    const r = run.rounds[d.round - 1];
    if (!r) { el.textContent = `Level ${d.round}: Jev is thinking.`; return; }
    const top = r.candidates.slice(0, 3).map((c) => `${c.code} ${nice(c.title)} ${pct(c.pathP)}`).join("; ");
    el.textContent = `Level ${d.round}, ${r.levelName}. Leading paths: ${top}.`;
  } else if (run.final) {
    const w = run.final.winner;
    el.textContent = `Final: SSOC 2024 ${w.code} ${w.title}, probability ${pct(w.p)}.`;
  }
}

// ---------------------------------------------------------------------------------------------
// Scene renderers. Each returns the height it used.
// ---------------------------------------------------------------------------------------------

function stopX(i) {
  const left = PAD + 30;
  const right = width - PAD - 30;
  return lerp(left, right, i / (STOPS.length - 1));
}

function drawTrail(t) {
  const y = 62;
  const narrow = width < 700;
  const done = run ? lastAvailable() : -1;
  // dotted path
  for (let x = stopX(0); x < stopX(STOPS.length - 1); x += 12) {
    const reached = run && x <= walkerX(t);
    ctx.fillStyle = reached ? C.red : C.seg;
    ctx.fillRect(Math.round(x), y - 2, 6, 6);
  }
  STOPS.forEach((stop, i) => {
    const x = stopX(i);
    const avail = run && sceneData(i);
    const current = i === view.scene;
    const s = 22;
    const fill = current ? C.inkStrong : avail ? C.red : C.paper;
    frame(x - s / 2, y - s / 2 + 1, s, s, avail || current ? C.inkStrong : C.seg, 4, fill);
    if (current && !REDUCED) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 220);
      ctx.fillStyle = `rgba(217,96,110,${0.25 + pulse * 0.35})`;
      ctx.fillRect(Math.round(x - s / 2 - 4), Math.round(y + s / 2 + 3), s + 8, 3);
    }
    text(narrow ? stop.short : stop.label, x, y + 32, F.pix(narrow ? 11 : 12), avail ? C.inkStrong : C.ink, "center");
    // the code leading at this level (only the current stop's on narrow screens, where they'd collide)
    const r = stop.key.startsWith("r") ? run?.rounds[Number(stop.key.slice(1)) - 1] : null;
    const code = r ? r.candidates[0].code : stop.key === "finals" && run?.final ? run.final.winner.code : null;
    if (code && (!narrow || current)) text(code, x, y + 50, F.code(16), C.redDark, "center");
    if (avail) hit(x - 30, y - 30, 60, 84, { stop: i, tip: [`Go to ${stop.label.toLowerCase()}`] });
  });
  if (run && done >= 0) {
    // the walker: our job seeker, walking the trail
    const x = walkerX(t);
    const moving = t - view.walkStart < 700 && view.walkFrom !== view.walkTo;
    const bob = moving && !REDUCED ? (Math.floor(t / 110) % 2) * 2 : 0;
    drawSprite(ctx, `walker:${run.start.job.title}`, "lead", x, y - 14 - bob, 2, moving ? Math.floor(t / 110) % 2 : 0);
  }
  ctx.fillStyle = C.seg;
  ctx.fillRect(PAD, TRAIL_H - 4, width - PAD * 2, 4);
}

function walkerX(t) {
  const k = REDUCED ? 1 : easeOut((t - view.walkStart) / 700);
  return lerp(stopX(view.walkFrom), stopX(view.walkTo), k);
}

function sceneHeader(y, eyebrow, title, sub, t) {
  const a = easeOut(t / 400);
  ctx.globalAlpha = a;
  text(eyebrow, PAD, y + 14, F.pix(13), C.ink);
  const size = width < 600 ? 23 : 28;
  ctx.font = F.head(size);
  const titleLines = wrap(title, width - PAD * 2, 2);
  titleLines.forEach((line, i) => text(line, PAD, y + 46 + i * (size + 4), F.head(size), C.inkStrong));
  const subY = y + 72 + (titleLines.length - 1) * (size + 4);
  ctx.font = F.body(14);
  const lines = wrap(sub, width - PAD * 2, 3);
  lines.forEach((line, i) => text(line, PAD, subY + i * 20, F.body(14), C.ink));
  ctx.globalAlpha = 1;
  return subY - y + lines.length * 20 + 8;
}

function drawIdle(t) {
  let y = TRAIL_H + 30;
  const maxW = Math.min(620, width - PAD * 2);
  ctx.font = F.head(26);
  for (const line of wrap("1,617 SSOC 2024 groups are waiting to meet your job", maxW)) {
    text(line, width / 2, y + 20, F.head(26), C.inkStrong, "center");
    y += 30;
  }
  ctx.font = F.body(15);
  for (const line of wrap("Paste a job description (or load a MyCareersFuture posting) and press Classify. Jev will judge one level of the occupation tree at a time and the crowd will sort itself.", maxW)) {
    text(line, width / 2, y + 22, F.body(15), C.ink, "center");
    y += 22;
  }
  const tiers = ["lead", "lead", "kept", "kept", "kept", "pruned", "pruned", "dim"];
  const n = Math.max(4, Math.floor((width - PAD * 2) / 58));
  const rows = width < 600 ? 3 : 2;
  const baseY = y + 110;
  for (let i = 0; i < n * rows; i++) {
    const row = Math.floor(i / n);
    const col = i % n;
    const sway = REDUCED ? 0 : Math.sin(t / 900 + i * 1.7) * 6;
    const x = PAD + 28 + col * ((width - PAD * 2 - 56) / (n - 1)) + sway;
    drawSprite(ctx, `idle${i}`, tiers[(i * 5 + row) % tiers.length], x, baseY + row * 86, 3, REDUCED ? 0 : Math.floor(t / 400 + i) % 2);
  }
  return baseY + (rows - 1) * 86 + 40;
}

function drawRead(t) {
  let y = TRAIL_H + 16;
  const job = run.start.job;
  y += sceneHeader(y, "STEP 0 · READING THE JOB AD", "Is this a real job description?",
    "Before climbing the tree, a yes/no Noul question asked alongside level 1 checks that the text really describes a job.", t);
  const wide = width >= 820;
  const colW = wide ? (width - PAD * 3) / 2 : width - PAD * 2;

  // job card
  const cardH = 230;
  const a = easeOut((t - 150) / 500);
  ctx.globalAlpha = a;
  frame(PAD, y, colW, cardH, C.ink, 4, C.soft);
  ctx.font = F.head(22);
  text(ellipsis(job.title || "(untitled job)", colW - 40), PAD + 20, y + 38, F.head(22), C.inkStrong);
  text(`${job.chars.toLocaleString()} characters`, PAD + 20, y + 60, F.pix(12), C.ink);
  ctx.font = F.body(13);
  const body = wrap($("jobDesc").value.replace(/\s+/g, " "), colW - 40, 6);
  body.forEach((line, i) => {
    ctx.globalAlpha = a * (1 - i * 0.13);
    text(line, PAD + 20, y + 88 + i * 20, F.body(13), C.inkStrong);
  });
  ctx.globalAlpha = 1;

  // noul gate
  const gx = wide ? PAD * 2 + colW : PAD;
  const gy = wide ? y : y + cardH + 24;
  const isJob = run.rounds[0]?.isJob;
  text("Genuine job posting?", gx, gy + 22, F.head(22, 600), C.ink);
  const barW = Math.min(colW, 420);
  const fillT = easeOut((t - 600) / 900);
  segBar(gx, gy + 34, barW, 40, isJob == null ? 0 : isJob * fillT, C.red);
  text(isJob == null ? "…" : pct(isJob * fillT), gx, gy + 118, F.head(36), C.ink);
  const msg = isJob == null ? "Jev is reading…" : isJob >= 0.5 ? "Looks like a real job ad. Let's classify it!" : "Hmm, this may not be a real job description.";
  ctx.font = F.body(16);
  const lines = wrap(msg, Math.min(260, colW - 150), 3);
  const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 36;
  const bh = lines.length * 24 + 24;
  const bx = gx + barW - bw - 10;
  const by = gy + 92;
  if (t > 400) {
    bubble(bx, by, bw, bh);
    lines.forEach((l, i) => text(l, bx + 18, by + 32 + i * 24, F.body(16), C.inkStrong));
  }
  drawSprite(ctx, `walker:${job.title}`, isJob != null && isJob < 0.5 ? "pruned" : "lead", bx + bw + 34, by + bh + 4, 3, REDUCED ? 0 : Math.floor(t / 450) % 2);

  let bottom = Math.max(y + cardH, gy + 92 + bh + 10);
  if (run.start.reference) {
    bottom += 24;
    bottom = drawReference(PAD, bottom, width - PAD * 2, t) + 8;
  }
  return bottom + 24;
}

function drawReference(x, y, w, t, winnerCode = null) {
  const ref = run.start.reference;
  const mapped = ref.ssoc2024.map((m) => `${m.code} ${m.title}`).join(" / ") || "no 2024 equivalent";
  let line = `Employer's own tag on MyCareersFuture: SSOC 2020 ${ref.ssoc2020} → SSOC 2024 ${mapped}`;
  if (winnerCode) {
    const match = ref.ssoc2024.some((m) => m.code === winnerCode);
    line += match ? "  ✓ matches Jev" : "  ✗ differs from Jev";
  }
  ctx.font = F.body(14, 500);
  const lines = wrap(line, w - 32, 5);
  const h = lines.length * 20 + 18;
  ctx.globalAlpha = easeOut((t - 300) / 500);
  ctx.fillStyle = C.soft;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.gold;
  ctx.fillRect(x, y, 6, h);
  lines.forEach((l, i) => text(l, x + 18, y + 24 + i * 20, F.body(14, 500), C.inkStrong));
  ctx.globalAlpha = 1;
  return y + h;
}

function tierOf(c, i) {
  if (i === 0) return "lead";
  if (c.kept) return "kept";
  return c.pathP >= 0.01 ? "pruned" : "dim";
}

function drawRound(t, roundNo) {
  const r = run.rounds[roundNo - 1];
  const asking = run.asking[roundNo];
  const level = r?.level ?? asking.level;
  const levelName = r?.levelName ?? asking.levelName;
  let y = TRAIL_H + 16;
  const nQ = (r ? r.decisions : asking.asked).filter((d) => !d.auto && d.probs?.length !== 1).length;
  const parents = (r ? r.decisions : asking.asked).map((d) => d.parent);
  const title = roundNo === 1 ? "Which major group does this job belong to?" : `Which ${levelName.toLowerCase()} fits best?`;
  const sub = roundNo === 1
    ? `One Choice question over all ${asking?.asked[0]?.options.length ?? r.decisions[0].probs.length} major groups${r ? ` · answered in ${r.ms} ms` : ""}.`
    : `${nQ} Choice question${nQ === 1 ? "" : "s"} asked in parallel, one under each path still in the beam (${parents.map((p) => p.code).join(", ")})${r ? ` · answered in ${r.ms} ms` : ""}.`;
  y += sceneHeader(y, `LEVEL ${level} OF 5 · ${levelName.toUpperCase()}`, title, sub, t);

  const dataT = run.dataAt[`r${roundNo}`] ?? Infinity;
  const revealAt = Math.max(REDUCED ? 0 : 900, dataT - view.enteredAt);
  const tr = t - revealAt; // time since reveal
  const wide = width >= 860;
  const leftW = wide ? Math.floor((width - PAD * 3) * 0.47) : width - PAD * 2;
  const rightX = wide ? PAD * 2 + leftW : PAD;
  const rightW = wide ? width - PAD * 3 - leftW : width - PAD * 2;

  // ---- the crowd
  text("THE CROWD", PAD, y + 12, F.pix(13), C.ink);
  const cellW = 62;
  const cellH = 92;
  const cols = Math.max(3, Math.floor(leftW / cellW));
  const crowdTop = y + 26;
  const options = asking ? asking.asked.flatMap((d) => d.options) : r.candidates;
  const cands = r ? r.candidates : null;
  const order = options.map((o) => o.code);
  const startPos = new Map(order.map((code, i) => [code, { x: PAD + (i % cols) * cellW + cellW / 2, y: crowdTop + Math.floor(i / cols) * cellH + 70 }]));
  const endPos = new Map();
  const groups = [];
  let gy = crowdTop;
  if (cands) {
    const byTier = { lead: [], kept: [], pruned: [], dim: [] };
    cands.forEach((c, i) => byTier[tierOf(c, i)].push(c));
    for (const tier of ["lead", "kept", "pruned", "dim"]) {
      if (!byTier[tier].length) continue;
      groups.push({ tier, y: gy });
      gy += 26;
      byTier[tier].forEach((c, i) => endPos.set(c.code, { x: PAD + (i % cols) * cellW + cellW / 2, y: gy + Math.floor(i / cols) * cellH + 70, tier, c }));
      gy += Math.ceil(byTier[tier].length / cols) * cellH + 8;
    }
  }
  const crowdBottom = Math.max(gy, crowdTop + Math.ceil(order.length / cols) * cellH);
  const moveK = cands ? easeOut(tr / 700) : 0;
  groups.forEach((g) => {
    ctx.globalAlpha = easeOut((tr - 500) / 400);
    text(TIER_HEAD[g.tier], PAD, g.y + 18, F.head(18, 700), TIER_DARK[g.tier]);
    ctx.globalAlpha = 1;
  });
  order.forEach((code, i) => {
    const s = startPos.get(code);
    const e = endPos.get(code) || s;
    const appear = REDUCED ? 1 : easeBack((t - 120 - i * 35) / 420);
    if (appear <= 0) return;
    const x = lerp(s.x, e.x, moveK);
    const yy = lerp(s.y, e.y, moveK) - (1 - appear) * 40;
    const tier = cands && tr > 250 ? e.tier : "dim";
    const idle = REDUCED ? 0 : (Math.floor(t / 380 + i * 0.7) % 2);
    const thinking = !cands || tr < 0;
    const bounce = thinking && !REDUCED ? Math.abs(Math.sin(t / 160 + i)) * 4 : 0;
    ctx.globalAlpha = clamp(appear);
    drawSprite(ctx, code, tier, x, yy - bounce, 3, tier === "lead" || tier === "kept" ? idle : 0, tier === "dim" && cands && tr > 250 ? 0.75 : 1);
    if (thinking) text("?", x + 22, yy - 58 - bounce, F.pix(16, 600), C.ink, "center");
    text(code, x, yy + 17, F.code(15), cands && tr > 250 ? TIER_DARK[tier] : C.ink, "center");
    ctx.globalAlpha = 1;
    if (e.c) {
      hit(x - 26, yy - 62, 52, 80, {
        tip: [`${e.c.code} · ${nice(e.c.title)}`, `Path probability ${pct(e.c.pathP)}`, `Jev's vote at this level ${pct(e.c.edgeP)}`, TIER_HEAD[e.tier]],
      });
    }
  });

  // ---- top paths (bars, image-1 style); stacked under the crowd on narrow screens
  const rightY = wide ? y : crowdBottom + 16;
  text("TOP PATHS", rightX, rightY + 12, F.pix(13), C.ink);
  let by = rightY + 30;
  if (!cands) {
    const dots = ".".repeat(1 + (Math.floor(t / 300) % 3));
    text(`Jev is thinking${REDUCED ? "…" : dots}`, rightX, by + 30, F.head(24, 600), C.ink);
    return Math.max(crowdBottom, by + 60) + 30;
  }
  const top = cands.slice(0, 4);
  const barW = Math.min(rightW - 8, Math.max(240, rightW * 0.72));
  top.forEach((c, i) => {
    const start = 200 + i * 260;
    const k = REDUCED ? 1 : easeOut((tr - start) / 900);
    const a = REDUCED ? 1 : easeOut((tr - start + 150) / 300);
    const tier = tierOf(c, i);
    ctx.globalAlpha = a;
    ctx.font = F.head(19, 600);
    text(ellipsis(`${c.code} · ${nice(c.title)}`, rightW - 8), rightX, by + 18, F.head(19, 600), C.ink);
    segBar(rightX, by + 28, barW, 36, c.pathP * k, TIER_FILL[tier]);
    text(pct(c.pathP * k), rightX, by + 106, F.head(32), C.ink);

    const parentDec = r.decisions.find((d) => d.probs.some((p) => p.code === c.code));
    const prev = c.edgeP > 0 ? c.pathP / c.edgeP : 0;
    const l1 = roundNo === 1
      ? `${pct(c.edgeP)} of Jev's vote`
      : parentDec && parentDec.probs.length === 1
        ? `I'm the only option under ${parentDec.parent.code}`
        : `${pct(c.edgeP)}${wide ? " of the vote" : ""} under ${parentDec ? parentDec.parent.code : "my parent"}`;
    const l2 = roundNo === 1 ? `among ${r.decisions[0].probs.length} major groups.` : `× ${pct(prev)} so far = ${pct(c.pathP)}`;
    const fs = wide ? 15 : 13;
    ctx.font = F.body(fs);
    // leave room for the big percentage on the left and the sprite on the right
    const bw = Math.min(rightW - (wide ? 150 : 124), Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 34);
    const bx = rightX + Math.min(barW, rightW - 60) - bw - 6;
    const bTop = by + 76;
    if (k > 0.35) {
      bubble(bx, bTop, bw, 60);
      text(ellipsis(l1, bw - 30), bx + 16, bTop + 26, F.body(fs), C.inkStrong);
      text(ellipsis(l2, bw - 30), bx + 16, bTop + 47, F.body(fs), C.inkStrong);
    }
    drawSprite(ctx, c.code, tier, bx + bw + 30, bTop + 64, 3, REDUCED ? 0 : Math.floor(t / 420 + i) % 2);
    ctx.globalAlpha = 1;
    hit(rightX, by, rightW, 140, { tip: [`${c.code} · ${nice(c.title)}`, `Path: ${c.path.join(" › ")}`, `Path probability ${pct(c.pathP)}`] });
    by += 156;
  });

  // ---- beam strip
  const bottom = Math.max(crowdBottom, by) + 6;
  const kept = cands.filter((c) => c.kept);
  ctx.globalAlpha = easeOut((tr - 1400) / 500);
  ctx.fillStyle = C.soft;
  ctx.fillRect(PAD, bottom, width - PAD * 2, 46);
  const lead = roundNo < 5 && kept.some((c) => c.level < 5) ? "Kept in the beam → expanded at the next level:" : "Kept in the beam → sent to the finals pool:";
  text(lead, PAD + 14, bottom + 29, F.body(14, 600), C.inkStrong);
  ctx.font = F.body(14, 600);
  let cx = PAD + 24 + ctx.measureText(lead).width;
  kept.forEach((c, i) => {
    const label = `${c.code} ${pct(c.pathP)}`;
    ctx.font = F.code(15);
    const w = ctx.measureText(label).width + 18;
    if (cx + w > width - PAD) return;
    ctx.fillStyle = TIER_FILL[i === 0 ? "lead" : "kept"];
    ctx.fillRect(cx, bottom + 11, w, 24);
    text(label, cx + 9, bottom + 28, F.code(15), C.paper);
    cx += w + 8;
  });
  ctx.globalAlpha = 1;
  return bottom + 46 + 24;
}

function drawFinals(t) {
  const f = run.final;
  const asking = run.finalsAsking;
  let y = TRAIL_H + 16;
  const n = f ? f.finalists.length : asking.finalists.length;
  y += sceneHeader(y, "FINALS · HEAD-TO-HEAD", "Which occupation fits best?",
    `The ${n} strongest occupations from the search meet in one Choice question with full SingStat definitions, example job titles and exclusions${f ? ` · answered in ${f.ms} ms` : ""}.`, t);
  const dataT = run.dataAt.final ?? Infinity;
  const tr = t - Math.max(REDUCED ? 0 : 500, dataT - view.enteredAt);
  const list = f ? f.finalists : asking.finalists.map((c) => ({ ...c, p: 0 }));

  // ---- podium
  const spacing = Math.min(170, (width - PAD * 2) / n);
  const startX = width / 2 - (spacing * (n - 1)) / 2;
  const floor = y + 270;
  const scale = width < 600 ? 3 : 4;
  list.forEach((c, i) => {
    const x = startX + i * spacing;
    const k = f && !REDUCED ? easeOut((tr - i * 120) / 1100) : f ? 1 : 0;
    const bh = 18 + c.p * 140 * k;
    const tier = !f ? "dim" : i === 0 ? "lead" : c.p >= 0.1 ? "kept" : c.p >= 0.02 ? "pruned" : "dim";
    const bw = Math.min(64, spacing - 16);
    frame(x - bw / 2, floor - bh, bw, bh + 4, TIER_DARK[tier], 4, TIER_FILL[tier]);
    const feet = floor - bh;
    const bounce = !f && !REDUCED ? Math.abs(Math.sin(t / 170 + i)) * 5 : 0;
    drawSprite(ctx, c.code, tier, x, feet - bounce, scale, REDUCED ? 0 : Math.floor(t / 380 + i) % 2);
    const crowned = f && i === 0 && tr > 1300;
    if (crowned) crown(x, feet - SH * scale + 2 * scale - 4 * (scale - 1), scale - 1);
    if (f) text(pct(c.p * k), x, feet - SH * scale - (i === 0 ? 20 : 10), F.head(22), C.inkStrong, "center");
    else text("?", x, feet - SH * scale - 10, F.pix(18, 600), C.ink, "center");
    text(c.code, x, floor + 22, F.code(17), TIER_DARK[tier], "center");
    ctx.font = F.body(12);
    wrap(nice(c.title), spacing - 12, 2).forEach((line, j) => text(line, x, floor + 40 + j * 16, F.body(12), C.inkStrong, "center"));
    hit(x - spacing / 2, floor - bh - SH * scale - 30, spacing, bh + SH * scale + 80, {
      tip: [`${c.code} · ${c.title}`, f ? `Final probability ${pct(c.p)}` : "Waiting for Jev…", f ? `Beam path probability ${pct(c.pathP)}` : "", c.examples?.length ? `e.g. ${c.examples.slice(0, 3).join(", ")}` : ""].filter(Boolean),
    });
  });
  // confetti for the winner
  if (f && tr > 1300 && !REDUCED) {
    const colors = [C.red, C.orange, C.crown, C.ink, "#e88d9b"];
    for (let i = 0; i < 46; i++) {
      const life = (tr - 1300 - (i % 12) * 70) / 2600;
      if (life < 0 || life > 1) continue;
      const cx = startX + Math.sin(i * 12.9898) * spacing * 1.4;
      const cy = y + 10 + life * 260;
      ctx.globalAlpha = 1 - life;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(Math.round(cx + Math.sin(life * 9 + i) * 14), Math.round(cy), 6, 6);
    }
    ctx.globalAlpha = 1;
  }
  let by = floor + 80;
  if (!f) {
    text(`Jev is comparing the finalists${".".repeat(1 + (Math.floor(t / 300) % 3))}`, width / 2, by, F.head(24, 600), C.ink, "center");
    return by + 40;
  }

  // ---- result card
  const w = f.winner;
  const cardA = REDUCED ? 1 : easeOut((tr - 1500) / 500);
  ctx.globalAlpha = cardA;
  const cardW = width - PAD * 2;
  const narrow = width < 600;
  const inner = cardW - 48;
  ctx.font = F.head(narrow ? 24 : 28);
  // on narrow screens the title goes on its own line(s) under the code
  const titleLines = narrow ? wrap(w.title, inner, 2) : [];
  ctx.font = F.body(14, 600);
  const statLines = wrap(`Probability ${pct(w.p)} · confidence ${f.confidence.toFixed(2)} · trail ${w.path.join(" › ")}`, inner, 2);
  ctx.font = F.body(14);
  const defLines = wrap(w.def || "", inner, narrow ? 5 : 3);
  const titleH = titleLines.length * 28;
  const cardH = 148 + titleH + statLines.length * 20 + defLines.length * 20;
  frame(PAD, by, cardW, cardH, C.red, 6, C.paper);
  text("SSOC 2024 CODE", PAD + 24, by + 34, F.pix(13), C.ink);
  text(w.code, PAD + 24, by + 82, F.head(52), C.red);
  if (narrow) {
    titleLines.forEach((line, i) => text(line, PAD + 24, by + 112 + i * 28, F.head(24), C.inkStrong));
  } else {
    ctx.font = F.head(52);
    const codeW = ctx.measureText(w.code).width;
    ctx.font = F.head(28);
    text(ellipsis(w.title, cardW - codeW - 70), PAD + 40 + codeW, by + 80, F.head(28), C.inkStrong);
  }
  const statY = by + 112 + titleH;
  statLines.forEach((line, i) => text(line, PAD + 24, statY + i * 20, F.body(14, 600), C.ink));
  const defY = statY + statLines.length * 20 + 10;
  defLines.forEach((line, i) => text(line, PAD + 24, defY + i * 20, F.body(14), C.inkStrong));
  ctx.globalAlpha = 1;
  by += cardH + 16;
  if (run.start.reference) by = drawReference(PAD, by, cardW, tr - 1500, w.code) + 16;

  // ---- probability list
  text("ALL FINALISTS", PAD, by + 14, F.pix(13), C.ink);
  by += 26;
  const barW = narrow ? cardW - 70 : Math.min(360, cardW * 0.4);
  list.forEach((c, i) => {
    const k = REDUCED ? 1 : easeOut((tr - 1700 - i * 120) / 700);
    ctx.globalAlpha = clamp(k * 3);
    const tier = i === 0 ? "lead" : c.p >= 0.1 ? "kept" : c.p >= 0.02 ? "pruned" : "dim";
    ctx.font = F.body(14, i === 0 ? 600 : 400);
    if (narrow) {
      text(ellipsis(`${c.code} ${c.title}`, cardW), PAD, by + 14, F.body(14, i === 0 ? 600 : 400), C.inkStrong);
      by += 20;
    } else {
      text(ellipsis(`${c.code} ${c.title}`, cardW - barW - 90), PAD + barW + 74, by + 20, F.body(14, i === 0 ? 600 : 400), C.inkStrong);
    }
    segBar(PAD, by, barW, 28, c.p * k, TIER_FILL[tier]);
    text(pct(c.p * k), PAD + barW + 12, by + 22, F.head(22), C.inkStrong);
    ctx.globalAlpha = 1;
    by += narrow ? 40 : 38;
  });
  return by + 20;
}

// ---------------------------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------------------------

function resize(h) {
  const w = $("canvasWrap").clientWidth;
  const newDpr = window.devicePixelRatio || 1;
  if (w !== width || h !== height || newDpr !== dpr) {
    width = w;
    height = h;
    dpr = newDpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = `${h}px`;
  }
}

let lastH = 720;
function draw() {
  // keep animating even if one frame throws
  requestAnimationFrame(draw);
  try {
    drawFrame();
  } catch (err) {
    console.error(err);
  }
}

function drawFrame() {
  const t = now();
  resize(lastH);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, width, height);
  hits = [];

  if (run && view.autoplay && view.scene >= 0) {
    const next = nextAvailable(view.scene);
    if (next >= 0 && t - view.enteredAt > dwell(view.scene)) goTo(next);
  }

  drawTrail(t);
  const d = run ? sceneData(view.scene) : null;
  const st = t - view.enteredAt;
  let used;
  if (!d) used = drawIdle(t);
  else if (d.kind === "read") used = drawRead(st);
  else if (d.kind === "round") used = drawRound(st, d.round);
  else used = drawFinals(st);
  lastH = Math.max(560, Math.ceil(used));

  // tooltip
  const m = view.mouse;
  const target = m && [...hits].reverse().find((h) => m.x >= h.x && m.x <= h.x + h.w && m.y >= h.y && m.y <= h.y + h.h);
  canvas.style.cursor = target && target.stop != null ? "pointer" : "default";
  if (target && target.tip) {
    ctx.font = F.body(13);
    const lines = target.tip;
    const tw = Math.min(340, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24);
    const th = lines.length * 19 + 14;
    const tx = clamp(m.x + 14, 4, width - tw - 4);
    const ty = clamp(m.y + 14, 4, height - th - 4);
    ctx.fillStyle = C.inkStrong;
    ctx.fillRect(tx, ty, tw, th);
    lines.forEach((l, i) => text(ellipsis(l, tw - 24), tx + 12, ty + 22 + i * 19, F.body(13, i === 0 ? 600 : 400), C.paper));
  }
}

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  view.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
});
canvas.addEventListener("mouseleave", () => { view.mouse = null; });
canvas.addEventListener("click", (e) => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  const target = hits.find((h) => h.stop != null && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
  if (target) goTo(target.stop, true);
});

// ---------------------------------------------------------------------------------------------
// Decision log (HTML mirror of every Jev answer)
// ---------------------------------------------------------------------------------------------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function probTable(rows, winner) {
  const table = el("table");
  for (const row of rows) {
    const bar = el("div", { class: "pbar" }, el("i"));
    bar.firstChild.style.width = `${(row.p * 100).toFixed(1)}%`;
    table.append(el("tr", row.code === winner ? { class: "win" } : {},
      el("td", { class: "code" }, row.code), el("td", {}, row.title), el("td", { class: "bar" }, bar), el("td", { class: "pct" }, `${(row.p * 100).toFixed(1)}%`)));
  }
  return table;
}

function logRound(r) {
  const det = el("details", r.round === 1 ? { open: "" } : {},
    el("summary", {}, `Level ${r.level} · ${r.levelName}`, el("span", {}, `${r.decisions.length} question(s) · ${r.ms} ms`)));
  if (r.isJob != null) {
    det.append(el("div", { class: "q" }, el("h4", {}, "Noul: is this a genuine job posting? ", el("small", {}, `P(yes) = ${(r.isJob * 100).toFixed(1)}%`))));
  }
  for (const d of r.decisions) {
    const head = d.parent.code === "ROOT" ? "Choice over all major groups" : `Choice under ${d.parent.code} ${nice(d.parent.title)}`;
    det.append(el("div", { class: "q" },
      el("h4", {}, head, " ", el("small", {}, d.probs.length === 1 ? "(only one option, no question needed)" : `confidence ${d.confidence.toFixed(2)}`)),
      probTable(d.probs, d.choice)));
  }
  const kept = r.candidates.filter((c) => c.kept).map((c) => `${c.code} (${(c.pathP * 100).toFixed(1)}%)`).join(", ");
  det.append(el("p", { class: "hint" }, `Beam keeps: ${kept}`));
  $("log").append(det);
}

function logFinal(f) {
  const det = el("details", { open: "" },
    el("summary", {}, "Finals · head-to-head", el("span", {}, `confidence ${f.confidence.toFixed(2)} · ${f.ms} ms`)));
  det.append(el("div", { class: "q" }, probTable(f.finalists.map((c) => ({ code: c.code, title: c.title, p: c.p })), f.winner.code)));
  det.append(el("p", { class: "hint" }, `Total ${f.usage.requests} Jev requests, ${f.usage.input_tokens.toLocaleString()} input tokens, ${(f.totalMs / 1000).toFixed(2)} s.`));
  $("log").append(det);
}

// ---------------------------------------------------------------------------------------------
// Input, fetching & streaming
// ---------------------------------------------------------------------------------------------

function status(msg, isError = false) {
  const s = $("status");
  s.textContent = msg;
  s.classList.toggle("err", isError);
}

function showReference(ref) {
  const box = $("ref");
  if (!ref) { box.hidden = true; return; }
  box.hidden = false;
  const mapped = ref.ssoc2024.map((m) => `${m.code} ${m.title}`).join(" / ") || "no 2024 equivalent";
  box.textContent = `Employer's tag on MCF: SSOC 2020 ${ref.ssoc2020} → 2024 ${mapped}. Shown for comparison only.`;
}

async function loadMcf(url) {
  status("Loading posting from MyCareersFuture…");
  $("loadBtn").disabled = true;
  try {
    const res = await fetch(`/api/mcf?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    $("jobTitle").value = data.title;
    $("jobDesc").value = data.description;
    $("mcfUrl").value = data.url;
    reference = data.reference;
    showReference(reference);
    status(`Loaded "${data.title}"${data.company ? ` from ${data.company}` : ""}.`);
    return true;
  } catch (err) {
    status(`Couldn't load that posting: ${err.message}`, true);
    return false;
  } finally {
    $("loadBtn").disabled = false;
  }
}

function handle(event) {
  const t = now();
  switch (event.type) {
    case "start":
      run.start = event;
      goTo(0);
      break;
    case "asking":
      run.asking[event.round] = event;
      break;
    case "round":
      run.rounds[event.round - 1] = event;
      run.dataAt[`r${event.round}`] = t;
      logRound(event);
      break;
    case "finals-asking":
      run.finalsAsking = event;
      break;
    case "final":
      run.final = event;
      run.dataAt.final = t;
      logFinal(event);
      status(`Done: ${event.winner.code} ${event.winner.title} (${pct(event.winner.p)}).`);
      break;
    case "error":
      run.error = event.message;
      status(`Jev request failed: ${event.message}`, true);
      break;
  }
  updateControls();
}

async function classifyNow() {
  const description = $("jobDesc").value.trim();
  if (description.length < 20) {
    status("Please paste a job description first (or pick a sample posting).", true);
    $("jobDesc").focus();
    return;
  }
  $("runBtn").disabled = true;
  $("log").replaceChildren();
  run = { start: null, asking: {}, rounds: [], finalsAsking: null, final: null, error: null, dataAt: {} };
  view.scene = -1;
  setAutoplay(true);
  status("Asking Jev…");
  try {
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: $("jobTitle").value.trim(), description, reference }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) handle(JSON.parse(line));
      }
    }
  } catch (err) {
    status(`Classification failed: ${err.message}`, true);
    if (!run.start) run = null;
  } finally {
    $("runBtn").disabled = false;
    updateControls();
  }
}

// Changing the text by hand means the MCF employer tag no longer applies.
$("jobDesc").addEventListener("input", () => { reference = null; showReference(null); });
$("loadBtn").addEventListener("click", () => loadMcf($("mcfUrl").value.trim()));
$("mcfUrl").addEventListener("keydown", (e) => { if (e.key === "Enter") loadMcf($("mcfUrl").value.trim()); });
$("runBtn").addEventListener("click", classifyNow);
$("prevBtn").addEventListener("click", () => goTo(prevAvailable(view.scene), true));
$("nextBtn").addEventListener("click", () => goTo(nextAvailable(view.scene), true));
$("playBtn").addEventListener("click", () => {
  setAutoplay(!view.autoplay);
  if (view.autoplay) view.enteredAt = now();
});
$("replayBtn").addEventListener("click", () => { setAutoplay(true); view.scene = 0; goTo(0); });
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea") || !run) return;
  if (e.key === "ArrowRight") goTo(nextAvailable(view.scene), true);
  if (e.key === "ArrowLeft") goTo(prevAvailable(view.scene), true);
});

for (const [label, id] of SAMPLES) {
  const b = el("button", { type: "button" }, label);
  b.addEventListener("click", async () => {
    if (await loadMcf(`https://www.mycareersfuture.gov.sg/job/${id}`)) classifyNow();
  });
  $("samples").append(b);
}

updateControls();
Promise.all([
  document.fonts.load(F.head(20)), document.fonts.load(F.body(14)), document.fonts.load(F.pix(13)), document.fonts.load(F.code(15)),
]).catch(() => {}).finally(() => requestAnimationFrame(draw));
