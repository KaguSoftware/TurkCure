import type { NextConfig } from "next";

// Supabase Storage host, derived from the project URL, so next/image can serve
// user-uploaded avatars/files. Falls back gracefully if the env var is unset.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname || undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  // PDF routes read the embedded TTFs from disk at runtime; make sure the font
  // files are traced into the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/pdf/**": ["./src/lib/pdf/fonts/**"],
  },

  experimental: {
    // Tree-shake heavy barrel-import libs so only used symbols hit the bundle.
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "@tiptap/react",
      "@tiptap/starter-kit",
    ],
    // Reuse the rendered RSC payload on client-side back/forward nav within the
    // window instead of re-hitting Supabase — makes bouncing between Patients,
    // a patient detail, and the Dashboard feel instant. Experimental; drop if a
    // future Next upgrade breaks it.
    staleTimes: { dynamic: 30, static: 180 },
  },

  // Drop console.* from production bundles (keep error for observability).
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },

  images: supabaseHost
    ? {
        remotePatterns: [
          { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/**" },
        ],
      }
    : undefined,
};

export default nextConfig;
