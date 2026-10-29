import { NextRequest, NextResponse } from "next/server";
import {
  evaluateRank,
  generateDailyPuzzle,
  getTodayDateString,
} from "@/lib/puzzle";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const date = body.date || getTodayDateString();
    const seed = body.seed || undefined;
    const pickedIds: string[] = Array.isArray(body.pickedIds)
      ? body.pickedIds
      : [];

    const puzzle = generateDailyPuzzle(date, seed);
    const allStreams: Record<string, number> = {};
    for (const t of puzzle.tracks) {
      allStreams[t.id] = t.streams;
    }

    const finalSum = pickedIds.reduce(
      (acc, id) => acc + (allStreams[id] || 0),
      0
    );

    const rank = evaluateRank(finalSum, puzzle.targetStreams);

    return NextResponse.json({
      rank,
      finalSum,
      targetStreams: puzzle.targetStreams,
      optimalHandIds: puzzle.optimalHandIds,
      optimalSum: puzzle.optimalSum,
      allStreams,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}