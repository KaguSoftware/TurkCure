/**
 * Rasterize two directories of PDFs (written by renderBaseline.test.tsx) and
 * diff them pixel-by-pixel. Exit 0 = identical; nonzero = drift, with a
 * per-page report. Usage:
 *
 *   node scripts/pdf-compare.mjs .pdf-baseline/before .pdf-baseline/after
 */
import { pdf } from "pdf-to-img";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const [beforeDir, afterDir] = process.argv.slice(2);
if (!beforeDir || !afterDir) {
  console.error("usage: node scripts/pdf-compare.mjs <beforeDir> <afterDir>");
  process.exit(2);
}

async function pages(file) {
  const doc = await pdf(file, { scale: 2 });
  const out = [];
  for await (const image of doc) out.push(image);
  return out;
}

let failed = false;
for (const name of readdirSync(beforeDir).filter((f) => f.endsWith(".pdf"))) {
  const before = await pages(join(beforeDir, name));
  const after = await pages(join(afterDir, name));
  if (before.length !== after.length) {
    console.error(`${name}: page count ${before.length} → ${after.length}`);
    failed = true;
    continue;
  }
  before.forEach((page, i) => {
    if (!page.equals(after[i])) {
      // PNG bytes differ — count differing raw bytes for a rough magnitude.
      let diff = 0;
      const len = Math.min(page.length, after[i].length);
      for (let b = 0; b < len; b++) if (page[b] !== after[i][b]) diff++;
      console.error(`${name} page ${i + 1}: DIFFERS (${diff} differing PNG bytes)`);
      failed = true;
    } else {
      console.log(`${name} page ${i + 1}: identical`);
    }
  });
}
process.exit(failed ? 1 : 0);
