import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies `/api/*` → Express (`API_PROXY_TARGET`, default http://127.0.0.1:4000).
 * Reliable with Turbopack dev (rewrites() alone often do not mirror this behaviour).
 *
 * Browser must use same-origin `/api` (set `NEXT_PUBLIC_API_BASE=/api`).
 * In production, set `API_PROXY_TARGET` if you intentionally proxy through Next.
 */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

function resolveBackendOrigin(): string | null {
  const fromEnv = process.env.API_PROXY_TARGET?.trim() || process.env.BACKEND_API_ORIGIN?.trim();
  if (fromEnv?.startsWith("http")) return fromEnv.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") return "http://127.0.0.1:4000";
  return null;
}

function buildUpstreamUrl(req: NextRequest, pathSegments: string[]): string | null {
  const backend = resolveBackendOrigin();
  if (!backend) return null;
  const subPath = pathSegments.length ? pathSegments.join("/") : "";
  const base = `${backend}/api${subPath ? `/${subPath}` : ""}`;
  const q = req.nextUrl.search || "";
  return `${base}${q}`;
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  const segments = Array.isArray(path) ? path : [];
  const target = buildUpstreamUrl(req, segments);
  if (!target) {
    return NextResponse.json(
      { error: "API proxy disabled: set API_PROXY_TARGET or use NEXT_PUBLIC_API_BASE pointing at Express." },
      { status: 503 },
    );
  }

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(req.method)) {
    const buf = await req.arrayBuffer();
    body = buf.byteLength > 0 ? buf : undefined;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch {
    return NextResponse.json(
      { error: "Upstream API unreachable", target: target.replace(/\/api\/.*/, "/api/...") },
      { status: 502 },
    );
  }

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "transfer-encoding" || k === "connection") return;
    outHeaders.set(key, value);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
