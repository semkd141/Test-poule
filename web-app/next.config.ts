import type { NextConfig } from "next";

/** Same-origin `/api` is proxied in `app/api/[...path]/route.ts` (works with Turbopack). */
const nextConfig: NextConfig = {};

export default nextConfig;
