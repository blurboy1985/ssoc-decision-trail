// Captures the live app classifying a real MyCareersFuture posting, 30 fps, with a fake cursor.
// node promo/capture-app.mjs [outDir]
import { launch, sleep } from "./cdp.mjs";

const OUT = process.argv[2] || "promo/frames/app";
const URL_APP = "https://ssoc.danielquek.com/";
const MCF = "https://www.mycareersfuture.gov.sg/job/db01383b7a3187158ce89221627dd074"; // Chef sample
const FPS = 30;
const STEP = 1000 / FPS;

const CURSOR = `(() => {
  const c = document.createElement('div');
  c.id = '__cur';
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;pointer-events:none;width:34px;height:34px;transform:translate(980px,700px);';
  c.innerHTML = '<div id="__ring" style="position:absolute;left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;border:4px solid #d9606e;opacity:0"></div>' +
    '<svg width="34" height="34" viewBox="0 0 17 17" shape-rendering="crispEdges" style="position:absolute;left:-3px;top:-2px;filter:drop-shadow(2px 2px 0 rgba(43,52,72,.35))">' +
    '<path d="M1 1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-4v1h1v1h1v2h-2v-1h-1v-2h-1v1h-1v1h-1z" fill="#2b3448"/>' +
    '<path d="M2 3h1v1h1v1h1v1h1v1h1v1h1v1h-3v1h1v2h1v1h-1v-2h-1v-2h-1v1h-1z" fill="#fff"/></svg>';
  document.body.append(c);
  window.__cur = (x, y, o = 1) => { c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; c.style.opacity = o; };
  window.__ring = (k) => { const r = document.getElementById('__ring'); r.style.opacity = k > 0 ? (1 - k) : 0; const s = 0.5 + k; r.style.transform = 'scale(' + s + ')'; };
})()`;

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

const b = await launch({ width: 1920, height: 1080, dsf: 1.5 });
const t0 = Date.now();
try {
  await b.goto(URL_APP);
  await sleep(2500); // web fonts
  await b.evaluate(CURSOR);
  await b.evaluate("window.__tick(16)");

  let cur = [980, 700];
  const frame = async (js = "") => {
    await b.evaluate(`${js};window.__tick(${STEP})`);
    await b.shoot(OUT);
    if (b.frame % 100 === 0) console.log(`frame ${b.frame} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  };
  const hold = async (n) => { for (let i = 0; i < n; i++) await frame(); };
  const move = async (to, n) => {
    const from = cur;
    for (let i = 1; i <= n; i++) {
      const k = ease(i / n);
      await frame(`__cur(${from[0] + (to[0] - from[0]) * k},${from[1] + (to[1] - from[1]) * k})`);
    }
    cur = to;
  };
  const click = async (js) => {
    for (let i = 0; i <= 9; i++) await frame(`__ring(${i / 9})${i === 2 ? ";" + js : ""}`);
    await frame("__ring(0)");
  };
  const box = (sel) => b.evaluate(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);

  await hold(30);
  const url = await box("#mcfUrl");
  await move([url[0] - 40, url[1] + 4], 26);
  await click("document.getElementById('mcfUrl').focus()");
  await hold(8);
  await frame(`document.getElementById('mcfUrl').value = ${JSON.stringify(MCF)}`); // paste
  await hold(14);
  const load = await box("#loadBtn");
  await move([load[0] - 6, load[1] + 4], 16);
  await click("document.getElementById('loadBtn').click()");
  for (let i = 0; i < 300 && !(await b.evaluate("document.getElementById('jobDesc').value.length > 50")); i++) {
    await sleep(60); // posting fetch runs in real time; don't burn frames waiting
  }
  await hold(36);
  const run = await box("#runBtn");
  await move([run[0] + 20, run[1] + 6], 24);
  await click("document.getElementById('runBtn').click()");
  for (let i = 1; i <= 12; i++) await frame(`__cur(${cur[0]},${cur[1]},${1 - i / 12})`);
  const clicked = b.frame;
  await hold(36 * FPS);
  console.log(`classify clicked at frame ${clicked}; total ${b.frame} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log("meta:", await b.evaluate("document.getElementById('meta').textContent"));
  console.log("status:", await b.evaluate("document.getElementById('status').textContent"));
} finally {
  await b.close();
}
