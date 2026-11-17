// Exports the Instagram kit: animated MP4s and static PNG posts.
// Needs Node, Playwright (npm i playwright) and ffmpeg on PATH.
//   node render.mjs            -> everything into export/
//   node render.mjs --stills   -> only key frames of the animations (quick preview)
// Set CHROMIUM_PATH to use a specific Chromium build.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "export");
mkdirSync(out, { recursive: true });
const stillsOnly = process.argv.includes("--stills");
const FPS = 30;

const videos = [
  { page: "logo.html", w: 1080, h: 1080, name: "vael-logo-square" },
  { page: "logo.html", w: 1080, h: 1920, name: "vael-logo-story" },
  { page: "marquee.html", w: 1080, h: 1920, name: "vael-bookings-story" },
  { page: "marquee.html", w: 1080, h: 1350, name: "vael-bookings-post" },
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);

for (const v of videos) {
  const page = await browser.newPage({ viewport: { width: v.w, height: v.h } });
  const url = pathToFileURL(join(here, v.page)).href + `?w=${v.w}&h=${v.h}&render=1`;
  await page.goto(url);
  await page.waitForFunction(() => window.ready === true);
  const duration = await page.evaluate(() => window.DURATION);

  if (stillsOnly) {
    for (const t of [0.8, 1.6, 3.0, 5.2]) {
      await page.evaluate((t) => window.render(t), t);
      await page.screenshot({ path: join(out, `${v.name}-t${t}.png`) });
    }
  } else {
    const frames = mkdtempSync(join(tmpdir(), "vael-"));
    const total = Math.round(duration * FPS);
    for (let f = 0; f < total; f++) {
      await page.evaluate((t) => window.render(t), f / FPS);
      await page.screenshot({ path: join(frames, `${String(f).padStart(4, "0")}.png`) });
    }
    // H.264 / yuv420p / faststart: the format Instagram accepts without re-processing artefacts.
    // Play it twice in a row so the clip is long enough to post as a Reel.
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-stream_loop", "1", "-framerate", String(FPS),
      "-i", join(frames, "%04d.png"),
      "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", join(out, `${v.name}.mp4`),
    ]);
    rmSync(frames, { recursive: true, force: true });
    console.log("video", v.name);
  }
  await page.close();
}

// Static posts: every .post element in posts.html becomes its own PNG.
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.goto(pathToFileURL(join(here, "posts.html")).href);
await page.evaluate(() => document.fonts.ready);
for (const el of await page.$$(".post")) {
  const name = await el.getAttribute("data-name");
  await el.screenshot({ path: join(out, `${name}.png`) });
  console.log("post", name);
}
await browser.close();
