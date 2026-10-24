// Run every sample MyCareersFuture posting through the classifier and compare with the
// employer's own SSOC tag (mapped 2020 → 2024). Usage: node tools/eval.mjs [--json out.json]

import { readFile, writeFile } from "node:fs/promises";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { classify } from "../lib/classify.mjs";
import { fetchMcfJob } from "../lib/mcf.mjs";

const SAMPLES = (await readFile(new URL("../samples/mcf_samples.txt", import.meta.url), "utf8"))
  .trim().split("\n").map((line) => line.split(" | ").map((s) => s.trim()));
const tree = JSON.parse(await readFile(new URL("../data/ssoc2024.json", import.meta.url), "utf8"));
const client = new TypeSafeClient();
const pct = (p) => `${(p * 100).toFixed(0)}%`;

const results = await Promise.all(SAMPLES.map(async ([query, id]) => {
  const job = await fetchMcfJob(id, tree);
  let first;
  let final;
  for await (const event of classify(client, tree, job)) {
    if (event.type === "round" && event.round === 1) first = event;
    if (event.type === "final") final = event;
  }
  const expected = (job.reference?.ssoc2024 || []).map((m) => m.code);
  const finalists = final.finalists.map((f) => f.code);
  return {
    query, id, title: job.title,
    expected: job.reference?.ssoc2024 || [],
    winner: { code: final.winner.code, title: final.winner.title, p: final.winner.p },
    exact: expected.includes(final.winner.code),
    unitMatch: expected.some((code) => code.slice(0, 4) === final.winner.code.slice(0, 4)),
    expectedInFinals: expected.some((code) => finalists.includes(code)),
    level1: first.decisions[0].probs.slice(0, 4).map((p) => `${p.code}:${pct(p.p)}`).join(" "),
    path: final.winner.path.join(">"),
    ms: final.totalMs,
    tokens: final.usage.input_tokens,
  };
}));

for (const r of results) {
  console.log(`${r.exact ? "✓" : r.unitMatch ? "~" : "✗"} ${r.title.slice(0, 44).padEnd(44)} → ${r.winner.code} ${r.winner.title.slice(0, 34).padEnd(34)} ${pct(r.winner.p).padStart(4)} | employer: ${r.expected.map((e) => `${e.code} ${e.title}`).join(" / ").slice(0, 46)} | L1 ${r.level1} | ${r.ms}ms`);
}
const n = results.length;
console.log(`\nexact ${results.filter((r) => r.exact).length}/${n} · same unit group ${results.filter((r) => r.unitMatch).length}/${n} · employer code reached finals ${results.filter((r) => r.expectedInFinals).length}/${n} · avg ${Math.round(results.reduce((a, r) => a + r.ms, 0) / n)} ms · avg ${Math.round(results.reduce((a, r) => a + r.tokens, 0) / n)} input tokens`);
const out = process.argv.indexOf("--json");
if (out > 0) await writeFile(process.argv[out + 1], JSON.stringify(results, null, 2));
