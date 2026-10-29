import { NextResponse } from "next/server";
import { createDailyPuzzle, todayUtc } from "@/lib/puzzle";

export async function GET() {
  const puzzle = createDailyPuzzle(todayUtc());
  return NextResponse.json({
    date: puzzle.date,
    puzzleNumber: puzzle.puzzleNumber,
    targetStreams: puzzle.targetStreams,
    tracks: puzzle.tracks.map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      releaseYear: track.releaseYear,
      albumArtUrl: track.albumArtUrl,
    })),
  });
}