import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public, unauthenticated liveness/readiness probe for Docker healthcheck
// (docker-compose polls this with `wget`). Deliberately narrow: no auth, no
// rate-limiting, no retries/timeouts — just "is the process up AND can it
// actually reach the DB". This is the failure mode that bit us in v10
// (SESSION_SECRET missing made every page throw while the container still
// looked "up") — a plain `pg_isready` on the `db` service alone can't catch
// that class of problem.
//
// Response shape is intentionally NOT the standard apiSuccess/apiError
// envelope used elsewhere in src/app/api/ — this endpoint is consumed by
// Docker, not the app's own frontend, so it uses a minimal, stable shape
// instead: { status: "ok" | "error", timestamp }. On failure, the raw DB
// error is logged server-side only and never included in the response body,
// since this route has no session check in front of it.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err) {
    console.error("Health check failed:", err);
    return NextResponse.json(
      { status: "error", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
