/**
 * Finance-section UI audit: screenshots every finance tab at phone and desktop
 * widths, light and dark, and reports any element that actually scrolls
 * vertically or bleeds horizontally. Dev-only; same magic-link auth as
 * mobile-audit.mjs. Requires `npm run dev` to already be serving.
 *
 *   node scripts/finance-audit.mjs [--out .finance-audit] [--url http://localhost:3000]
 */
import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = arg("url", "http://localhost:3000");
const OUT = arg("out", join(process.cwd(), ".finance-audit"));
const ADMIN_EMAIL = arg("email", "parsaxavier@gmail.com");

const env = Object.fromEntries(
  readFileSync(join(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

mkdirSync(OUT, { recursive: true });

async function magicLink() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: ADMIN_EMAIL,
    options: { redirectTo: `${BASE}/auth/confirm?next=/dashboard` },
  });
  if (error) throw new Error(`generateLink: ${error.message}`);
  return `${BASE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/dashboard`;
}

async function unclutter(ctx, theme) {
  // next-themes reads localStorage, not prefers-color-scheme, once a choice exists.
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  await ctx.addCookies([
    { name: "turkcure_intro", value: "1", url: BASE, expires: Math.floor(midnight.getTime() / 1000) },
  ]);
  await ctx.addInitScript(() => {
    const hide = () => {
      const s = document.getElementById("__audit_hide") ?? document.createElement("style");
      s.id = "__audit_hide";
      s.textContent = "nextjs-portal{display:none!important}";
      document.head?.appendChild(s);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hide);
    else hide();
  });
}

/** Every element that actually shows a vertical scrollbar, plus h-bleed check. */
async function diagnostics(page) {
  return page.evaluate(() => {
    const out = { vscroll: [], bleeds: null, pageOverflowY: 0 };
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) out.bleeds = doc.scrollWidth;
    out.pageOverflowY = Math.max(0, doc.scrollHeight - window.innerHeight);
    const describe = (el) =>
      `<${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} class="${(el.className?.baseVal ?? el.className ?? "").toString().slice(0, 80)}">`;
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const oy = cs.overflowY;
      const scrolls =
        (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1;
      if (scrolls && el !== doc && el !== document.body) {
        out.vscroll.push({
          el: describe(el),
          delta: el.scrollHeight - el.clientHeight,
          height: el.clientHeight,
        });
      }
    }
    return out;
  });
}

let n = 0;
async function shot(page, name, { fullPage = true } = {}) {
  const idx = String(++n).padStart(2, "0");
  // The daily brand splash covers the first paint and self-dismisses after ~3s.
  await page
    .locator(".intro-overlay")
    .waitFor({ state: "detached", timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${idx}-${name}.png`), fullPage });
  const d = await diagnostics(page);
  const flags = [
    d.bleeds ? `HBLEED ${d.bleeds}px` : null,
    // A page barely taller than the viewport shows a near-full-height thumb —
    // that's a stray few px of overflow, not real content.
    d.pageOverflowY > 0 && d.pageOverflowY < 60 ? `PAGE-MICRO-OVERFLOW +${d.pageOverflowY}px` : null,
    ...d.vscroll.map((v) => `VSCROLL +${v.delta}px in ${v.el} (h=${v.height})`),
  ].filter(Boolean);
  console.log(`  ${flags.length ? "!" : " "} ${idx}-${name}${flags.length ? "\n      " + flags.join("\n      ") : ""}`);
}

async function sweepFinance(page, label) {
  await page.goto(`${BASE}/finance`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, `${label}-overview-cash`);
  const quoted = page.locator('button[aria-pressed]:has-text("quoted")').first();
  if (await quoted.isVisible().catch(() => false)) {
    await quoted.click();
    await shot(page, `${label}-overview-quoted`);
  }
  await page.locator('[role="tab"]:has-text("Receivables")').click().catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, `${label}-receivables`);
  await page.locator('[role="tab"]:has-text("Breakdowns")').click().catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, `${label}-breakdowns`);
  const dim = page.locator('select[aria-label="Breakdown dimension"], [aria-label="Breakdown dimension"]').first();
  if (await dim.isVisible().catch(() => false)) {
    await dim.selectOption("hospital").catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, `${label}-breakdowns-hospital`);
  }
  // Period + currency interplay on Overview
  await page.locator('[role="tab"]:has-text("Overview")').click().catch(() => {});
  await page.waitForTimeout(400);
  const period = page.locator('[aria-label="Period"]').first();
  if (await period.isVisible().catch(() => false)) {
    await period.selectOption("year").catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, `${label}-overview-thisyear`);
  }
  const cur = page.locator('[aria-label="Currency"]').first();
  if (await cur.isVisible().catch(() => false)) {
    await cur.selectOption("EUR").catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, `${label}-overview-eur`);
  }
}

const run = async () => {
  const browser = await chromium.launch();

  for (const [label, opts] of [
    ["desktop-dark", { viewport: { width: 1440, height: 900 }, colorScheme: "dark" }],
    ["desktop-light", { viewport: { width: 1440, height: 900 }, colorScheme: "light" }],
    ["phone-dark", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark" }],
    ["phone-light", { ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light" }],
  ]) {
    const ctx = await browser.newContext(opts);
    await unclutter(ctx, label.endsWith("dark") ? "dark" : "light");
    const page = await ctx.newPage();
    // Magic links are single-use — mint a fresh one per context.
    await page.goto(await magicLink(), { waitUntil: "networkidle" }).catch(() => {});
    console.log(`→ ${label}`);
    await sweepFinance(page, label);
    await ctx.close();
  }

  await browser.close();
  console.log(`\ndone → ${OUT}`);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
