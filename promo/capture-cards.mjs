// Renders the title cards in promo/cards.html, 30 fps. Each card is a pure function of t.
// node promo/capture-cards.mjs [card ...]
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const FPS = 30;
const CARDS = { hook: 4, scale: 4, confuse: 4, solution: 3.5, cta: 4 };
const only = process.argv.slice(2);

const b = await launch({ width: 1920, height: 1080, dsf: 1, port: 9334 });
try {
  await b.goto(pathToFileURL(resolve("promo/cards.html")).href);
  await b.evaluate(`__setCrowd(${JSON.stringify(pathToFileURL(resolve("promo/out/crowd.png")).href)})`);
  await b.evaluate("document.fonts.ready.then(() => document.fonts.size)");
  await sleep(1500);
  for (const [name, secs] of Object.entries(CARDS)) {
    if (only.length && !only.includes(name)) continue;
    b.resetFrames();
    for (let i = 0; i < Math.round(secs * FPS); i++) {
      await b.evaluate(`__render(${JSON.stringify(name)}, ${i / FPS})`);
      await b.shoot(`promo/frames/${name}`);
    }
    console.log(`${name}: ${b.frame} frames`);
  }
} finally {
  await b.close();
}
