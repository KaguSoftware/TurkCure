import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF routes read the embedded TTFs from disk at runtime; make sure the font
  // files are traced into the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/pdf/**": ["./src/lib/pdf/fonts/**"],
  },
};

export default nextConfig;
