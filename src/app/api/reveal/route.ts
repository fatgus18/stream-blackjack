import { NextRequest, NextResponse } from "next/server";
import { generateDailyPuzzle, getTodayDateString } from "@/lib/puzzle";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const date = body.date || getTodayDateString();
    const seed = body.seed || undefined;
    const trackId = body.trackId;

    const puzzle = generateDailyPuzzle(date, seed);
    const track = puzzle.tracks.find((t) => t.id === trackId);

    if (!track) {
      return NextResponse.json(
        { error: "Track not found on this board" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      trackId: track.id,
      streams: track.streams,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}