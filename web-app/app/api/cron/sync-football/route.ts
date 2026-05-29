import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

function resolveBackendOrigin(): string | null {
  const fromEnv = process.env.API_PROXY_TARGET?.trim() || process.env.BACKEND_API_ORIGIN?.trim();
  if (fromEnv?.startsWith("http")) return fromEnv.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") return "http://127.0.0.1:4000";
  return null;
}

function hasCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const headerSecret = req.headers.get("x-cron-secret")?.trim();
  const bearer = req.headers.get("authorization")?.trim();
  return headerSecret === secret || bearer === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!hasCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backend = resolveBackendOrigin();
  if (!backend) {
    return NextResponse.json(
      { error: "API proxy disabled: set API_PROXY_TARGET or BACKEND_API_ORIGIN." },
      { status: 503 },
    );
  }

  const secret = process.env.CRON_SECRET!.trim();
  const competitionSlug = req.nextUrl.searchParams.get("competitionSlug")?.trim() || "wc2026";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 110_000);
  let upstream: Response;
  try {
    upstream = await fetch(`${backend}/api/internal/sync-fixtures`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": secret,
      },
      body: JSON.stringify({ competitionSlug }),
    });
  } catch {
    return NextResponse.json({ error: "Football sync upstream timed out or failed" }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }

  const text = await upstream.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 1000) };
    }
  }

  return NextResponse.json(payload ?? {}, { status: upstream.status });
}
