import "server-only";

import { NextResponse } from "next/server";

const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

const requestBuckets = new Map<string, number[]>();

type ErrorStatus = 400 | 401 | 403 | 404 | 405 | 413 | 415 | 422 | 429 | 500;

export function jsonError(message: string, status: ErrorStatus = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function logApiError(route: string, error: unknown, metadata?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : "Unknown server error";
  const name = error instanceof Error ? error.name : "UnknownError";

  console.error("API route error", {
    route,
    name,
    message,
    metadata
  });
}

export function getClientIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [ip] = forwardedFor.split(",");
    if (ip?.trim()) return ip.trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  return "unknown";
}

function isRateLimited(key: string) {
  const now = Date.now();
  const bucket = requestBuckets.get(key) ?? [];
  const recent = bucket.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestBuckets.set(key, recent);
    return true;
  }

  recent.push(now);
  requestBuckets.set(key, recent);
  return false;
}

export async function enforceAiRateLimit(request: Request, routeKey: string) {
  const identifier = getClientIdentifier(request);
  const bucketKey = `${routeKey}:${identifier}`;

  if (isRateLimited(bucketKey)) {
    return jsonError("Too many requests. Please try again shortly.", 429);
  }

  return null;
}
