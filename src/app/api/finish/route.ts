import { NextRequest, NextResponse } from "next/server";
import { createDailyPuzzle, todayUtc } from "@/lib/puzzle";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const date = body && typeof body === "object" ? (body as { date?: unknown }).date : null;
  if (date !== todayUtc()) return NextResponse.json({ error: "Invalid puzzle" }, { status: 400 });
  const puzzle = createDailyPuzzle(date);
  return NextResponse.json({
    tracks: puzzle.tracks.map(({ id, streams }) => ({ id, streams })),
    optimalHandIds: puzzle.optimalHandIds,
    optimalSum: puzzle.optimalSum,
  });
}