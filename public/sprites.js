// Procedural pixel people. Each SSOC code gets a stable look (hair, face, pose) from a seed;
// codes in a minor group (3 digits and deeper) also wear that group's costume from costumes.js.
// The colour tier says how the candidate is doing, like the grouped crowds in the reference art.

import { costumeFor } from "./costumes.js";

export const W = 20;
export const H = 20;
const OX = 2; // the body is drawn in a 16-px frame, shifted right to leave room for a held item

export const TIERS = {
  lead: {
    skin: "#f7dde2", blush: "#ec9aa8", eye: "#4a0f1c", outline: "#4a0f1c",
    hair: ["#d9606e", "#b8324a", "#e88d9b", "#8e1b30"],
    shirt: ["#d9606e", "#f3cbd3", "#a3243a", "#e88d9b"], light: "#fbe8ec", pants: "#7a1428",
    main: "#d9606e", mid: "#e88d9b",
  },
  kept: {
    skin: "#fcdcbc", blush: "#f2a07a", eye: "#6b2a10", outline: "#6b2a10",
    hair: ["#f08a4b", "#e0663a", "#f6b183", "#c4532a"],
    shirt: ["#e5683a", "#f5a26b", "#fbe0c8", "#d9606e"], light: "#fff1e4", pants: "#a8431f",
    main: "#e5683a", mid: "#f5a26b",
  },
  pruned: {
    skin: "#f5e6a8", blush: "#e6c56a", eye: "#4a3208", outline: "#4a3208",
    hair: ["#a8741a", "#7a5212", "#e0bd52", "#5e3f0e"],
    shirt: ["#c9952b", "#e8c860", "#f3e2a0", "#a8741a"], light: "#fbf3d2", pants: "#6e4c10",
    main: "#c9952b", mid: "#e8c860",
  },
  dim: {
    skin: "#ece6d8", blush: "#cfc6b4", eye: "#1f1c19", outline: "#1f1c19",
    hair: ["#5b544c", "#3d3833", "#a59e93", "#2b2723"],
    shirt: ["#3d3833", "#7a7368", "#d8d1c3", "#5b544c"], light: "#f4f0e8", pants: "#2b2723",
    main: "#7a7368", mid: "#a59e93",
  },
};

export function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

/** Stable traits for a seed, independent of tier, so a pruned candidate keeps its look. */
export function traits(seed) {
  const r = rng(hash(seed));
  return {
    hairStyle: Math.floor(r() * 7),
    hairTone: Math.floor(r() * 4),
    shirtTone: Math.floor(r() * 4),
    pattern: Math.floor(r() * 5),
    eyes: Math.floor(r() * 4),
    waves: r() < 0.55,
    blush: r() < 0.6,
  };
}

/** Paint one sprite into a W×H grid of colours (null = transparent). */
function paint(t, tier, frame, costume) {
  const pal = TIERS[tier];
  const g = Array.from({ length: H }, () => Array(W).fill(null));
  // x is in the 16-px body frame; OX shifts it into the sprite
  const set = (x, y, c) => { x += OX; if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const hair = pal.hair[t.hairTone];
  const ink = { M: pal.main, m: pal.mid, D: pal.pants, L: pal.light, o: pal.outline, K: pal.skin, H: hair };
  // paint a bitmap of palette letters with its top-left at (x0, y0)
  const blit = (x0, y0, rows) => rows.forEach((row, dy) => [...row].forEach((ch, dx) => { if (ink[ch]) set(x0 + dx, y0 + dy, ink[ch]); }));
  const shirt = costume ? ink[costume.shirt] : pal.shirt[t.shirtTone];
  const pants = costume ? ink[costume.pants] : pal.pants;

  // legs + shoes
  rect(5, 15, 6, 16, pants); rect(9, 15, 10, 16, pants);
  rect(5, 17, 6, 17, pal.outline); rect(9, 17, 10, 17, pal.outline);
  // torso
  rect(4, 10, 11, 10, shirt); rect(5, 11, 10, 14, shirt);
  if (!costume) {
    if (t.pattern === 1) for (let y = 11; y <= 14; y += 2) rect(5, y, 10, y, pal.light);
    if (t.pattern === 2) { set(6, 12, pal.light); set(9, 11, pal.light); set(8, 13, pal.light); set(5, 14, pal.light); }
    if (t.pattern === 3) { set(7, 10, pal.light); set(8, 10, pal.light); set(7, 12, pal.outline); set(7, 14, pal.outline); }
    if (t.pattern === 4) { rect(7, 10, 8, 14, pal.light); }
  }
  // left arm, always down
  rect(3, 11, 4, 13, shirt); set(3, 14, pal.skin);
  // right arm: waving (two frames) or down
  if (t.waves) {
    rect(11, 10, 12, 10, shirt);
    if (frame === 0) { rect(12, 8, 12, 9, shirt); set(13, 7, pal.skin); set(12, 7, pal.skin); }
    else { rect(13, 8, 13, 9, shirt); set(14, 7, pal.skin); set(13, 7, pal.skin); }
  } else {
    rect(11, 11, 12, 13, shirt); set(12, 14, pal.skin);
  }
  // head
  rect(4, 3, 11, 9, pal.skin);
  // eyes
  if (t.eyes === 0) { set(6, 6, pal.eye); set(9, 6, pal.eye); }
  if (t.eyes === 1) { set(5, 6, pal.eye); set(6, 5, pal.eye); set(7, 6, pal.eye); set(8, 6, pal.eye); set(9, 5, pal.eye); set(10, 6, pal.eye); }
  if (t.eyes === 2) { rect(5, 6, 10, 6, pal.outline); set(6, 6, pal.light); set(9, 6, pal.light); set(6, 5, pal.outline); set(9, 5, pal.outline); }
  if (t.eyes === 3) { rect(6, 6, 6, 7, pal.eye); rect(9, 6, 9, 7, pal.eye); }
  set(7, 8, pal.eye); set(8, 8, pal.eye);
  if (t.blush) { set(5, 7, pal.blush); set(10, 7, pal.blush); }
  // hair
  switch (t.hairStyle) {
    case 0: rect(4, 2, 11, 3, hair); set(4, 4, hair); set(11, 4, hair); break;
    case 1: rect(4, 2, 11, 3, hair); rect(4, 4, 4, 10, hair); rect(11, 4, 11, 10, hair); rect(5, 4, 7, 4, hair); break;
    case 2: rect(4, 2, 11, 3, hair); for (let x = 4; x <= 11; x += 2) set(x, 1, hair); set(4, 4, hair); break;
    case 3: rect(4, 2, 11, 3, shirt); rect(3, 4, 12, 4, pal.outline); break;
    case 4: rect(4, 2, 11, 3, hair); set(4, 4, hair); rect(12, 3, 13, 7, hair); set(11, 4, hair); break;
    case 5: rect(5, 2, 10, 2, hair); set(4, 3, hair); set(11, 3, hair); break;
    case 6: rect(4, 2, 11, 3, hair); rect(4, 4, 11, 4, pal.outline); set(4, 1, hair); set(11, 1, hair); set(3, 1, hair); set(12, 1, hair); break;
  }
  if (costume) {
    const x = costume.extras;
    blit(4, 10, costume.rows);
    // glasses: a dark top rim and light lenses either side of each eye (solid rims read as a mask)
    if (x.has("glasses")) { rect(5, 5, 10, 5, pal.outline); for (const ex of [6, 9]) { set(ex - 1, 6, pal.light); set(ex, 6, pal.eye); set(ex + 1, 6, pal.light); } }
    if (x.has("shades")) { rect(5, 6, 10, 6, pal.pants); set(6, 6, pal.light); set(9, 6, pal.light); }
    if (x.has("mask")) { rect(5, 7, 10, 9, pal.light); set(4, 7, pal.outline); set(11, 7, pal.outline); }
    if (costume.hat) blit(2, costume.hat.y, costume.hat.rows);
    if (x.has("steth")) { rect(5, 10, 5, 12, pal.outline); rect(10, 10, 10, 12, pal.outline); set(10, 13, pal.mid); }
    if (x.has("lanyard")) { set(5, 10, pal.outline); set(6, 11, pal.outline); set(10, 10, pal.outline); set(9, 11, pal.outline); rect(7, 12, 8, 13, pal.light); }
    if (x.has("scarf")) { rect(4, 10, 11, 10, pal.mid); rect(9, 11, 9, 12, pal.mid); }
    blit(-OX, costume.prop.y, costume.prop.rows);
  }
  // outline any empty pixel touching a filled one (4-neighbour), like the reference sprites
  const out = g.map((row) => row.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x]) continue;
    if ((g[y - 1]?.[x]) || (g[y + 1]?.[x]) || g[y][x - 1] || g[y][x + 1]) out[y][x] = pal.outline;
  }
  return out;
}

const cache = new Map();

/** Cached offscreen canvas for (seed, tier, frame), 1px per sprite pixel. */
export function sprite(seed, tier, frame = 0) {
  const key = `${seed}|${tier}|${frame}`;
  let c = cache.get(key);
  if (c) return c;
  const grid = paint(traits(seed), tier, frame, costumeFor(String(seed)));
  c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  c.top = grid.findIndex((row) => row.some(Boolean)); // first painted row, for placing the crown
  const ctx = c.getContext("2d");
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!grid[y][x]) continue;
    ctx.fillStyle = grid[y][x];
    ctx.fillRect(x, y, 1, 1);
  }
  cache.set(key, c);
  return c;
}

/** First painted row of a sprite (hats reach higher than hair). */
export function spriteTop(seed, tier) {
  return sprite(seed, tier).top;
}

/** Draw a sprite with its feet at (x, y) — x is the centre — scaled by `scale` device-independent px. */
export function drawSprite(ctx, seed, tier, x, y, scale, frame = 0, alpha = 1) {
  const img = sprite(seed, tier, frame);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(x - (W * scale) / 2), Math.round(y - H * scale), W * scale, H * scale);
  ctx.restore();
}
