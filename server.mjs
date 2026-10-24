// SSOC 2024 Decision Visualiser — tiny dependency-free HTTP server.
//   GET  /api/mcf?url=<MyCareersFuture job link>   → { title, description, reference, ... }
//   POST /api/classify { title, description, reference? } → NDJSON stream of decision events
// The TypeSafe API key stays on the server (TYPESAFE_API_KEY).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { classify } from "./lib/classify.mjs";
import { fetchMcfJob } from "./lib/mcf.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");
const PORT = Number(process.env.PORT || 5173);
const MODEL = process.env.TYPESAFE_MODEL || "jev-latest";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

const tree = JSON.parse(await readFile(join(ROOT, "data", "ssoc2024.json"), "utf8"));
const client = new TypeSafeClient();

const sendJson = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

async function readBody(req, limit = 200_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Request too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function handleClassify(req, res) {
  let job;
  try {
    job = await readBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  if (!job.description || String(job.description).trim().length < 20) {
    return sendJson(res, 400, { error: "Please paste a job description (at least a sentence or two)." });
  }
  res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" });
  const write = (event) => res.write(JSON.stringify(event) + "\n");
  write({ type: "start", model: MODEL, job: { title: job.title || "", chars: job.description.length }, reference: job.reference || null });
  try {
    for await (const event of classify(client, tree, { title: String(job.title || ""), description: String(job.description) }, MODEL)) {
      write(event);
      if (event.type === "final") {
        console.log(`[classify] "${job.title}" → ${event.winner.code} ${event.winner.title} (${(event.winner.p * 100).toFixed(0)}%) in ${event.totalMs}ms, ${event.usage.requests} requests`);
      }
    }
  } catch (err) {
    console.error("[classify] failed:", err);
    write({ type: "error", message: err.message || String(err) });
  }
  res.end();
}

async function handleStatic(req, res, pathname) {
  const file = normalize(join(PUBLIC, pathname === "/" ? "index.html" : pathname));
  if (!file.startsWith(PUBLIC)) return sendJson(res, 403, { error: "Forbidden" });
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "POST" && url.pathname === "/api/classify") return await handleClassify(req, res);
    if (req.method === "GET" && url.pathname === "/api/mcf") {
      return sendJson(res, 200, await fetchMcfJob(url.searchParams.get("url"), tree));
    }
    if (req.method === "GET") return await handleStatic(req, res, decodeURIComponent(url.pathname));
    sendJson(res, 405, { error: "Method not allowed" });
  } catch (err) {
    sendJson(res, 400, { error: err.message || String(err) });
  }
}).listen(PORT, () => console.log(`SSOC decision visualiser on http://localhost:${PORT} (model ${MODEL})`));
