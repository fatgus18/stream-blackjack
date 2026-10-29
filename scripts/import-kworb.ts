import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";

const kworbUrl = "https://kworb.net/spotify/songs.html";
const limit = Number(process.env.TRACK_LIMIT ?? 5000);
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  throw new Error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET before importing.");
}

interface ScrapedTrack {
  id: string;
  title: string;
  artist: string;
  streams: number;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { release_date: string; images: { url: string }[] };
}

const response = await fetch(kworbUrl, { headers: { "User-Agent": "StreamBlackjack/1.0" } });
if (!response.ok) throw new Error(`Kworb request failed: ${response.status}`);
const $ = cheerio.load(await response.text());
const scraped: ScrapedTrack[] = [];

$("table#spotifytable tbody tr").each((_, row) => {
  const cells = $(row).find("td");
  const link = $(row).find('a[href*="/spotify/track/"]').attr("href") ?? "";
  const id = link.match(/\/track\/([A-Za-z0-9]+)/)?.[1];
  const title = cells.eq(1).text().trim();
  const artist = cells.eq(2).text().trim();
  const streams = Number(cells.eq(3).text().replaceAll(",", "").trim());
  if (id && title && artist && Number.isFinite(streams)) scraped.push({ id, title, artist, streams });
});

const uniqueTracks = [...new Map(scraped.map((track) => [track.id, track])).values()].slice(0, limit);
if (!uniqueTracks.length) throw new Error("No track rows found. Kworb may have changed its table markup.");

const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});
if (!tokenResponse.ok) throw new Error(`Spotify token request failed: ${tokenResponse.status}`);
const { access_token: accessToken } = await tokenResponse.json() as { access_token: string };

const enriched: (ScrapedTrack & { releaseYear: number; albumArtUrl: string; tier: "A" | "B" | "C" })[] = [];
for (let offset = 0; offset < uniqueTracks.length; offset += 50) {
  const batch = uniqueTracks.slice(offset, offset + 50);
  const apiResponse = await fetch(`https://api.spotify.com/v1/tracks?ids=${batch.map((track) => track.id).join(",")}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!apiResponse.ok) throw new Error(`Spotify track batch failed: ${apiResponse.status}`);
  const data = await apiResponse.json() as { tracks: (SpotifyTrack | null)[] };
  for (const spotifyTrack of data.tracks) {
    if (!spotifyTrack) continue;
    const scrapedTrack = batch.find((track) => track.id === spotifyTrack.id);
    if (!scrapedTrack) continue;
    const streams = scrapedTrack.streams;
    enriched.push({
      ...scrapedTrack,
      title: spotifyTrack.name,
      artist: spotifyTrack.artists.map((artist) => artist.name).join(", "),
      releaseYear: Number(spotifyTrack.album.release_date.slice(0, 4)),
      albumArtUrl: spotifyTrack.album.images[0]?.url ?? "",
      tier: streams >= 1_500_000_000 ? "A" : streams >= 600_000_000 ? "B" : "C",
    });
  }
  console.log(`Enriched ${Math.min(offset + batch.length, uniqueTracks.length)} / ${uniqueTracks.length}`);
}

const destination = path.resolve("data", "tracks.json");
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
console.log(`Saved ${enriched.length} tracks to ${destination}`);