import { NextRequest, NextResponse } from "next/server";
import { createDailyPuzzle, todayUtc } from "@/lib/puzzle";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { date, trackId } = body as { date?: unknown; trackId?: unknown };
  if (date !== todayUtc() || typeof trackId !== "string") {
    return NextResponse.json({ error: "Invalid puzzle or track" }, { status: 400 });
  }
  const track = createDailyPuzzle(date).tracks.find((item) => item.id === trackId);
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });
  return NextResponse.json({ streams: track.streams });
}