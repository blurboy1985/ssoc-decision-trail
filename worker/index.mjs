/**
 * Cloudflare Worker entry (wrangler.jsonc) for ssoc.danielquek.com. /api/* runs here; every other
 * path is served from ./public as static assets without invoking this Worker.
 * Same API as server.mjs, plus spend protection: per-IP rate limits and a daily cap on Jev runs.
 */
import { TypeSafeClient } from "@typesafe-ai/sdk";
import tree from "../data/ssoc2024.json";
import { classify } from "../lib/classify.mjs";
import { fetchMcfJob } from "../lib/mcf.mjs";

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const today = () => new Date().toISOString().slice(0, 10);

let client = null;
const clientFor = (env) =>
  (client ??= new TypeSafeClient({ apiKey: env.TYPESAFE_API_KEY, defaultModel: env.TYPESAFE_MODEL || "jev-latest", compression: false }));

/** Approximate global daily cap (KV is eventually consistent, so a burst may overshoot slightly). */
async function takeDailyBudget(env) {
  const key = `classify:${today()}`;
  const used = Number((await env.USAGE.get(key)) || 0);
  if (used >= Number(env.DAILY_LIMIT || 300)) return false;
  await env.USAGE.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  return true;
}

async function handleClassify(request, env, ip) {
  if (!(await env.CLASSIFY_LIMITER.limit({ key: ip })).success) {
    return json({ error: "Too many classifications from your network. Please wait a minute and try again." }, 429);
  }
  const raw = await request.text();
  if (raw.length > 200_000) return json({ error: "Request too large." }, 413);
  let job;
  try {
    job = JSON.parse(raw || "{}");
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  if (!job.description || String(job.description).trim().length < 20) {
    return json({ error: "Please paste a job description (at least a sentence or two)." }, 400);
  }
  if (!(await takeDailyBudget(env))) {
    return json({ error: "Today's demo budget is used up. Please come back tomorrow." }, 429);
  }

  const model = env.TYPESAFE_MODEL || "jev-latest";
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const write = (event) => writer.write(encoder.encode(JSON.stringify(event) + "\n"));
  (async () => {
    try {
      await write({ type: "start", model, job: { title: job.title || "", chars: job.description.length }, reference: job.reference || null });
      for await (const event of classify(clientFor(env), tree, { title: String(job.title || ""), description: String(job.description) }, model)) {
        await write(event);
      }
    } catch (err) {
      console.error("[classify] failed:", err);
      await write({ type: "error", message: err.message || String(err) });
    } finally {
      await writer.close();
    }
  })();
  return new Response(readable, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    try {
      if (request.method === "POST" && url.pathname === "/api/classify") return await handleClassify(request, env, ip);
      if (request.method === "GET" && url.pathname === "/api/mcf") {
        if (!(await env.MCF_LIMITER.limit({ key: ip })).success) {
          return json({ error: "Too many requests. Please wait a minute and try again." }, 429);
        }
        return json(await fetchMcfJob(url.searchParams.get("url"), tree));
      }
      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message || String(err) }, 400);
    }
  },
};
