/**
 * Phone-width UI audit harness.
 *
 * Screenshots every route and every overlay at 390x844 so mobile layout can be
 * judged from what the app actually renders rather than from Tailwind classes.
 * Dev-only: it authenticates with the service-role key already in .env.local by
 * minting a magic link for an existing admin, so there is no test user or
 * password to manage.
 *
 *   node scripts/mobile-audit.mjs [--out <dir>] [--label before] [--url http://localhost:3000]
 *
 * Requires `npm run dev` to already be serving.
 */
import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// --- config -----------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = arg("url", "http://localhost:3000");
const LABEL = arg("label", "shot");
const OUT = arg("out", join(process.cwd(), ".mobile-audit"));
const ADMIN_EMAIL = arg("email", "parsaxavier@gmail.com");
const VIEWPORT = { width: 390, height: 844 };

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

// --- auth -------------------------------------------------------------------
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
  // Go through the app's own server-side callback so the session cookie is set
  // exactly the way a real sign-in sets it.
  const { hashed_token } = data.properties;
  return `${BASE}/auth/confirm?token_hash=${hashed_token}&type=magiclink&next=/dashboard`;
}

// --- helpers ----------------------------------------------------------------
/** Keep the daily brand splash and Next's dev badge out of every shot. */
async function unclutter(ctx) {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  await ctx.addCookies([
    {
      name: "turkcure_intro",
      value: "1",
      url: BASE,
      expires: Math.floor(midnight.getTime() / 1000),
    },
  ]);
  await ctx.addInitScript(() => {
    const hide = () => {
      const s = document.getElementById("__audit_hide") ?? document.createElement("style");
      s.id = "__audit_hide";
      s.textContent = "nextjs-portal{display:none!important}";
      document.head?.appendChild(s);
    };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", hide);
    else hide();
  });
}

let n = 0;
const shots = [];

/**
 * Capture a screen. Always takes a full-page shot AND — when the page is taller
 * than one viewport — a shot at each scroll position, because judging a phone
 * layout from its first 844px is exactly how below-the-fold breakage survives.
 */
async function shot(page, name, { scroll = true } = {}) {
  const idx = String(++n).padStart(2, "0");
  // The daily brand splash covers the first paint and self-dismisses after ~3s.
  await page
    .locator(".intro-overlay")
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(450); // let spring animations settle

  // A page that scrolls sideways is the clearest phone-layout defect there is,
  // and an element wider than the viewport is the second — measure both rather
  // than eyeballing every screenshot.
  const metrics = await page.evaluate(() => {
    const win = window.innerWidth;
    // An element wider than the viewport is fine when an ancestor scrolls it
    // horizontally on purpose (that IS the fix for wide tables) — only unclipped
    // overflow is a defect.
    const isScrolledByAncestor = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
      }
      return false;
    };
    const wide = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (isScrolledByAncestor(el)) continue;
      // Report the outermost offender only, so one wide table isn't 40 findings.
      if (r.right > win + 1 && !wide.some((w) => w.el.contains(el))) {
        wide.push({
          el,
          tag: el.tagName.toLowerCase(),
          cls: (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 70),
          right: Math.round(r.right),
        });
      }
    }
    return {
      doc: document.documentElement.scrollWidth,
      win,
      height: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
      wide: wide.slice(0, 4).map(({ tag, cls, right }) => ({ tag, cls, right })),
    };
  });
  const bleeds = metrics.doc > metrics.win + 1;

  await page.screenshot({ path: join(OUT, `${idx}-${name}-full.png`), fullPage: true });

  const screens = scroll ? Math.min(Math.ceil(metrics.height / metrics.viewport), 5) : 1;
  for (let i = 0; i < screens; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * metrics.viewport);
    await page.waitForTimeout(300);
    const suffix = screens > 1 ? `-s${i + 1}` : "";
    await page.screenshot({ path: join(OUT, `${idx}-${name}${suffix}.png`) });
  }
  await page.evaluate(() => window.scrollTo(0, 0));

  shots.push({ name, bleeds, width: metrics.doc, screens, wide: metrics.wide });
  const flags = [
    bleeds ? `BLEED ${metrics.doc}px` : null,
    metrics.wide.length ? `${metrics.wide.length} overflowing el` : null,
  ].filter(Boolean);
  console.log(
    `  ${flags.length ? "!" : " "} ${idx}-${name}  (${screens} screen${screens === 1 ? "" : "s"})` +
      (flags.length ? `  ${flags.join(", ")}` : "")
  );
  for (const w of metrics.wide) console.log(`      ↳ <${w.tag} class="${w.cls}"> right=${w.right}`);
}

async function go(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => {});
}

/** Click the first matching locator if it exists; returns whether it fired. */
async function tap(page, locator, { timeout = 2500 } = {}) {
  const el = typeof locator === "string" ? page.locator(locator).first() : locator.first();
  try {
    await el.waitFor({ state: "visible", timeout });
    await el.click({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function esc(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
}

// --- the sweep --------------------------------------------------------------
const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  await unclutter(ctx);
  const page = await ctx.newPage();

  console.log(`→ ${LABEL} @ ${VIEWPORT.width}x${VIEWPORT.height}`);

  // Unauthenticated screens first, before the session cookie lands.
  await go(page, "/login");
  await shot(page, "login");
  await go(page, "/reset-password");
  await shot(page, "reset-password");

  await page.goto(await magicLink(), { waitUntil: "networkidle" });

  // --- dashboard
  await go(page, "/dashboard");
  await shot(page, "dashboard");
  // The daily intro overlay can sit on top of the first authenticated paint.
  await esc(page);
  await tap(page, 'button[aria-label*="menu" i], header button:has(svg)');
  await shot(page, "dashboard-drawer");
  await esc(page);
  await tap(page, 'button:has-text("New reminder")');
  await shot(page, "dialog-reminder");
  await esc(page);

  // --- patients
  await go(page, "/patients");
  await shot(page, "patients-board");
  await tap(page, 'button:has-text("Filters")');
  await shot(page, "patients-filters");
  await tap(page, 'button:has-text("Table")');
  await shot(page, "patients-table");
  await tap(page, 'button:has-text("New patient")');
  await shot(page, "dialog-patient-form");
  await esc(page);

  // Command palette (search button in the mobile top bar).
  await tap(page, 'header button[aria-label*="search" i]');
  await page.keyboard.type("a");
  await shot(page, "command-palette");
  await esc(page);

  // --- patient detail: every tab
  // Prefer a patient that actually has a case — the Payments/Quote tabs render
  // an empty state otherwise and the dense views never get captured.
  await go(page, `/patients?q=${encodeURIComponent(arg("patient", "Rhea"))}`);
  const opened =
    (await tap(page, 'a[href^="/patients/"]:not([href$="/import"])', { timeout: 4000 })) ||
    (await go(page, "/patients")) ||
    (await tap(page, 'a[href^="/patients/"]:not([href$="/import"])'));
  if (opened) {
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot(page, "patient-detail-case");
    // The Type combobox and a date picker are the two worst popovers.
    await tap(page, '[role="combobox"], button[aria-haspopup="listbox"]');
    await shot(page, "popover-combobox");
    await esc(page);
    for (const tab of ["Payments", "Instructions", "Files"]) {
      if (await tap(page, `[role="tab"]:has-text("${tab}")`)) {
        // Tabs are URL state (?tab=), so the panel swaps on a navigation.
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(700);
        await shot(page, `patient-detail-${tab.toLowerCase()}`);
      }
    }
    // Payment dialog — the densest form in the app, and now the FX block too.
    if (await tap(page, '[role="tab"]:has-text("Payments")')) {
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(700);
      if (await tap(page, 'button:has-text("Record payment")')) {
        await shot(page, "dialog-payment");
        // Switch to a foreign currency so the new FX block is captured too.
        const sel = page.locator('label:has-text("Currency")').locator("..").locator("button, select").first();
        if (await tap(page, sel, { timeout: 1200 })) {
          if (await tap(page, '[role="option"]:has-text("USD"), option[value="USD"]', { timeout: 1200 })) {
            await page.waitForTimeout(900);
            await shot(page, "dialog-payment-fx");
          }
        }
        await esc(page);
      }
    }
  }

  // --- import wizard
  await go(page, "/patients/import");
  await shot(page, "patients-import");

  // --- finance
  await go(page, "/finance");
  await shot(page, "finance");

  // --- directories
  for (const [path, name] of [
    ["/hospitals", "hospitals"],
    ["/hotels", "hotels"],
    ["/drivers", "drivers"],
    ["/templates", "templates"],
  ]) {
    await go(page, path);
    await shot(page, name);
  }
  // One directory dialog stands in for all five — same component.
  await go(page, "/hotels");
  if (await tap(page, 'button:has-text("Add"), button:has-text("New")')) {
    await shot(page, "dialog-directory");
    await esc(page);
  }
  // The markdown template dialog is the `wide` variant with the TipTap editor.
  await go(page, "/templates");
  if (await tap(page, 'button:has-text("Add"), button:has-text("New")')) {
    await shot(page, "dialog-template-markdown");
    await esc(page);
  }

  // --- settings
  await go(page, "/settings");
  await shot(page, "settings");
  for (const tab of ["Team", "Users", "Appearance"]) {
    if (await tap(page, `[role="tab"]:has-text("${tab}")`, { timeout: 900 })) {
      await shot(page, `settings-${tab.toLowerCase()}`);
    }
  }

  await browser.close();

  console.log(`\n${shots.length} screens captured → ${OUT}`);
  const bleeding = shots.filter((s) => s.bleeds);
  const overflowing = shots.filter((s) => s.wide.length);
  if (bleeding.length) {
    console.log(`\n${bleeding.length} screen(s) scroll horizontally at 390px:`);
    for (const b of bleeding) console.log(`  ${b.name}  ${b.width}px`);
  } else {
    console.log("No page scrolls horizontally.");
  }
  if (overflowing.length) {
    console.log(`\n${overflowing.length} screen(s) contain an element wider than the viewport:`);
    for (const o of overflowing)
      console.log(`  ${o.name}: ${o.wide.map((w) => `<${w.tag}> ${w.right}px`).join(", ")}`);
  }
  const tall = shots.filter((s) => s.screens >= 4);
  if (tall.length)
    console.log(
      `\n${tall.length} screen(s) run 4+ phone-heights — check the -s3/-s4 shots:\n  ` +
        tall.map((t) => `${t.name} (${t.screens})`).join("\n  ")
    );
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
