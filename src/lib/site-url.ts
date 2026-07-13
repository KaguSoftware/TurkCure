/**
 * The app's canonical origin, used to build absolute URLs (email redirect
 * targets, etc.). Resolution order: an explicit production var, the host Vercel
 * injects, the browser origin (client only), then localhost as a last resort.
 *
 * Why this exists: building auth email links from `window.location.origin` bakes
 * whatever origin the browser happened to be on (localhost in dev, a preview URL)
 * into the emailed link — the source of the "sometimes sends you to localhost"
 * bug. Set NEXT_PUBLIC_SITE_URL in the Production environment so it never leaks.
 */
export function getSiteURL(): string {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    (typeof window !== "undefined" ? window.location.origin : "") ||
    "http://localhost:3000";
  // VERCEL_URL comes without a scheme; assume https for anything non-localhost.
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}
