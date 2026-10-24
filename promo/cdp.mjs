// Minimal Chrome DevTools Protocol driver for frame-exact captures.
// The page's clock is virtual: performance.now and requestAnimationFrame only move when we tick,
// so every captured frame is exactly 1/FPS apart however long the screenshot takes.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";

export const VIRTUAL_CLOCK = `(() => {
  let vt = 0; let q = [];
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__tick = (ms) => { vt += ms; const cbs = q; q = []; for (const cb of cbs) { try { cb(vt); } catch (e) { console.error(e); } } };
})();`;

export async function launch({ width = 1920, height = 1080, dsf = 1, port = 9333 } = {}) {
  const profile = join(tmpdir(), `promo-chrome-${port}`);
  rmSync(profile, { recursive: true, force: true });
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--hide-scrollbars", "--mute-audio", `--window-size=${width},${height}`,
    "--force-color-profile=srgb", "about:blank",
  ], { stdio: "ignore" });

  let list;
  for (let i = 0; i < 50; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.length) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) listeners.forEach((l) => l(msg));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params }));
  });

  await send("Page.enable");
  await send("Runtime.enable");
  listeners.push((m) => {
    if (m.method === "Runtime.exceptionThrown") console.error("page exception:", m.params.exceptionDetails.text, m.params.exceptionDetails.exception?.description);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") console.error("page console.error:", m.params.args.map((a) => a.value ?? a.description).join(" "));
  });
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dsf, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_CLOCK });

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  const goto = async (url) => {
    const loaded = new Promise((r) => listeners.push((m) => { if (m.method === "Page.loadEventFired") r(); }));
    await send("Page.navigate", { url });
    await loaded;
  };

  let frameNo = 0;
  const shoot = async (dir) => {
    mkdirSync(dir, { recursive: true });
    const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 93 });
    writeFileSync(join(dir, `${String(frameNo++).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
  };

  return {
    send, evaluate, goto, shoot,
    resetFrames: () => { frameNo = 0; },
    get frame() { return frameNo; },
    close: async () => { try { await send("Browser.close"); } catch {} proc.kill(); },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
