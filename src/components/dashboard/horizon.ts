// Plain module (no "use client") so the server page can read the array —
// non-component exports of a client module arrive in RSC as client-reference
// proxies, and `.includes` on one throws.
export const HORIZON_OPTIONS = [7, 14, 30, 60, 90] as const;
