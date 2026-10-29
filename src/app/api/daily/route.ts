import { NextRequest, NextResponse } from "next/server";
import {
  generateDailyPuzzle,
  getTodayDateString,
  PublicTrackCard,
} from "@/lib/puzzle";
import { TrackRecord } from "@/lib/tracks";

const mediaCache = new Map<
  string,
  { albumArtUrl?: string; previewUrl?: string }
>();

async function resolveTrackMedia(
  track: TrackRecord
): Promise<{ albumArtUrl?: string; previewUrl?: string }> {
  const cached = mediaCache.get(track.id);
  if (cached) return cached;

  let albumArtUrl = track.albumArtUrl;
  let previewUrl = track.previewUrl;

  // 1. Try Spotify's public keyless oEmbed API for official Spotify CDN artwork
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${track.id}`;
    const res = await fetch(oembedUrl, { next: { revalidate: 86400 } });
    if (res.ok) {
      const data = await res.json();
      if (data.thumbnail_url) {
        albumArtUrl = data.thumbnail_url;
      }
    }
  } catch {
    // Fallback to iTunes below
  }

  // 2. Query iTunes Search API for HD 600x600 artwork fallback + 30s audio preview
  try {
    const query = encodeURIComponent(`${track.title} ${track.artist}`);
    const itunesUrl = `https://itunes.apple.com/search?term=${query}&entity=song&limit=1`;
    const res = await fetch(itunesUrl, { next: { revalidate: 86400 } });
    if (res.ok) {
      const data = await res.json();
      const hit = data.results?.[0];
      if (hit) {
        if (!albumArtUrl && hit.artworkUrl100) {
          albumArtUrl = hit.artworkUrl100.replace("100x100bb", "600x600bb");
        }
        if (hit.previewUrl) {
          previewUrl = hit.previewUrl;
        }
      }
    }
  } catch {
    // Ignore network errors
  }

  const resolved = { albumArtUrl, previewUrl };
  mediaCache.set(track.id, resolved);
  return resolved;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || getTodayDateString();
  const seed = searchParams.get("seed") || undefined;

  const puzzle = generateDailyPuzzle(date, seed);

  const enrichedTracks: PublicTrackCard[] = await Promise.all(
    puzzle.tracks.map(async (t) => {
      const media = await resolveTrackMedia(t);
      return {
        id: t.id,
        title: t.title,
        artist: t.artist,
        releaseYear: t.releaseYear,
        albumArtUrl: media.albumArtUrl,
        previewUrl: media.previewUrl,
      };
    })
  );

  return NextResponse.json({
    date: puzzle.date,
    seedKey: puzzle.seedKey,
    puzzleNumber: puzzle.puzzleNumber,
    targetStreams: puzzle.targetStreams,
    tracks: enrichedTracks,
  });
}