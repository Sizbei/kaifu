/**
 * Render every document fixture into a document-looking image under
 * public/samples/, so the camera flow can be demoed by photographing a
 * laptop screen — or by uploading the file straight from disk.
 *
 * Two renders per fixture:
 *   <id>.png        a flat, well-lit scan
 *   <id>.photo.jpg  the same page slightly rotated on a grey desk, with
 *                   uneven lighting and a fold crease — roughly what the
 *                   camera actually hands the pipeline
 *
 * Usage:  pnpm samples            all fixtures
 *         pnpm samples lease      only fixtures whose id contains "lease"
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT_DIR = path.join(ROOT, "public", "samples");

/**
 * The fixture leaf modules are imported by explicit path and extension.
 * Node's type stripping has no `@/*` alias and will not guess `.ts`, and
 * the leaves are written to contain nothing but `import type` and data
 * precisely so that this works without a bundler. See src/fixtures/documents.ts.
 */
const FIXTURE_MODULES = [
  ["schoolNoticeFixtures", "school-notices.ts"],
  ["wardTaxFixtures", "ward-tax.ts"],
  ["wardBenefitFixtures", "ward-benefits.ts"],
  ["leaseClauseFixtures", "lease-clauses.ts"],
  ["unknownDocumentFixtures", "unknown-documents.ts"],
];

async function loadFixtures() {
  const loaded = [];
  for (const [exportName, file] of FIXTURE_MODULES) {
    const url = pathToFileURL(path.join(ROOT, "src", "fixtures", file));
    const mod = await import(url.href);
    loaded.push(...mod[exportName]);
  }
  return loaded;
}

/** Prefer a declared devDependency; fall back to a playwright already on the machine. */
async function loadChromium() {
  /** playwright ships CJS, so the named export may only exist on `default`. */
  const pick = (mod) => mod.chromium ?? mod.default?.chromium;

  try {
    const chromium = pick(await import("playwright"));
    if (chromium) return chromium;
  } catch {
    // not installed locally yet
  }
  const npxCache = path.join(homedir(), ".npm", "_npx");
  if (existsSync(npxCache)) {
    for (const entry of readdirSync(npxCache)) {
      const candidate = path.join(npxCache, entry, "node_modules", "playwright", "index.js");
      if (!existsSync(candidate)) continue;
      const chromium = pick(await import(pathToFileURL(candidate).href));
      if (chromium) return chromium;
    }
  }
  throw new Error(
    "Playwright is not available. Run `pnpm install` (it is a devDependency), " +
      "then `npx playwright install chromium` if the browser is missing.",
  );
}

/* ------------------------------------------------------------------ *
 * Page styling. Two typographic registers, because the real paper has
 * two: 区役所 and contracts are set in 明朝, school prints in ゴシック.
 * ------------------------------------------------------------------ */

const MINCHO = `"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "MS Mincho", serif`;
const GOTHIC = `"Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "MS PGothic", sans-serif`;

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Deterministic, so re-running does not churn the images. */
function jitter(id) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return {
    rotate: (((hash % 260) - 130) / 100).toFixed(2), // -1.30deg .. +1.29deg
    lightX: 20 + ((hash >> 8) % 60),
    lightY: 10 + ((hash >> 14) % 40),
  };
}

function buildHtml(fixture, { photo }) {
  const serif = fixture.docType === "school_notice" ? GOTHIC : MINCHO;
  const { rotate, lightX, lightY } = jitter(fixture.id);
  const crease = photo
    ? `background-image:
         linear-gradient(180deg, transparent 0 33.2%, rgba(0,0,0,.055) 33.4%, rgba(255,255,255,.5) 33.7%, transparent 34%),
         linear-gradient(180deg, transparent 0 66.4%, rgba(0,0,0,.04) 66.6%, rgba(255,255,255,.4) 66.9%, transparent 67.2%);`
    : "";

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: ${photo ? "#b3b0a6" : "#ffffff"};
    display: flex; justify-content: center;
  }
  #shot {
    padding: ${photo ? "58px 46px" : "0"};
    background: ${
      photo
        ? `radial-gradient(120% 90% at ${lightX}% ${lightY}%, #c9c6bc 0%, #a9a69c 55%, #8f8c83 100%)`
        : "#ffffff"
    };
  }
  .page {
    width: 940px;
    min-height: 1330px;
    padding: 78px 76px 92px;
    background: ${photo ? "#f7f4ea" : "#fdfcf9"};
    color: #16151a;
    font-family: ${serif};
    font-size: 14px;
    line-height: 1.95;
    letter-spacing: .015em;
    white-space: pre-wrap;
    font-feature-settings: "palt" 0;
    ${crease}
    ${
      photo
        ? `transform: rotate(${rotate}deg);
           box-shadow: 0 22px 48px rgba(0,0,0,.34), 0 2px 6px rgba(0,0,0,.28);
           filter: contrast(1.03) saturate(.94) brightness(1.01);`
        : `border: 1px solid #e6e2d8;`
    }
  }
  .page::after {
    content: "";
    position: fixed; inset: 0; pointer-events: none;
    ${
      photo
        ? `background: radial-gradient(130% 100% at ${lightX}% ${lightY}%,
             rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 42%, rgba(0,0,0,.14) 100%);`
        : "background: none;"
    }
  }
</style></head>
<body><div id="shot"><div class="page">${escapeHtml(fixture.rawText)}</div></div></body></html>`;
}

/**
 * Prefer Playwright's own bundled Chromium; fall back to the Google Chrome
 * already on the machine so a first run does not require a 150MB download.
 */
async function launchBrowser(chromium) {
  try {
    return await chromium.launch();
  } catch (bundledError) {
    try {
      return await chromium.launch({ channel: "chrome" });
    } catch {
      throw new Error(
        `${bundledError.message}\n\nNo system Chrome to fall back on either. ` +
          "Run `npx playwright install chromium`.",
      );
    }
  }
}

/* ------------------------------------------------------------------ */

async function main() {
  const filter = process.argv[2];
  const all = await loadFixtures();
  const fixtures = filter ? all.filter((f) => f.id.includes(filter)) : all;

  if (fixtures.length === 0) {
    console.error(`No fixtures matched "${filter}".`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const chromium = await loadChromium();
  const browser = await launchBrowser(chromium);
  const manifest = [];

  try {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 1500 },
      deviceScaleFactor: 2,
    });

    for (const fixture of fixtures) {
      const scan = `${fixture.id}.png`;
      const photo = `${fixture.id}.photo.jpg`;

      await page.setContent(buildHtml(fixture, { photo: false }), { waitUntil: "load" });
      await page.locator(".page").screenshot({ path: path.join(OUT_DIR, scan) });

      await page.setContent(buildHtml(fixture, { photo: true }), { waitUntil: "load" });
      await page.locator("#shot").screenshot({
        path: path.join(OUT_DIR, photo),
        type: "jpeg",
        quality: 82,
      });

      manifest.push({
        id: fixture.id,
        docType: fixture.docType,
        titleJa: fixture.titleJa,
        issuer: fixture.issuer,
        note: fixture.note ?? null,
        scan: `/samples/${scan}`,
        photo: `/samples/${photo}`,
      });
      console.log(`  ${fixture.docType.padEnd(16)} ${scan}  +  ${photo}`);
    }
  } finally {
    await browser.close();
  }

  writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(`\n${manifest.length} fixtures rendered to public/samples/`);
}

await main();
