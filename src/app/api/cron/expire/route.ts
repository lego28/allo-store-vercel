// src/app/api/cron/expire/route.ts
// Vercel Cron: runs every 2 minutes (see vercel.json).
// Releases all PENDING reservations whose expiresAt has passed.

import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/lib/expiry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Protect the cron endpoint from arbitrary callers
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const released = await releaseExpiredReservations();
    return NextResponse.json({
      ok: true,
      released,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron/expire]", err);
    return NextResponse.json({ error: "Failed to run expiry" }, { status: 500 });
  }
}
