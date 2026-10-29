import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface TrackCard {
  id: string;
  title: string;
  artist: string;
  releaseYear: number;
  albumArtUrl: string;
  streams: number;
  tier: "A" | "B" | "C";
}

// Seed values are snapshots for local play; scripts/import-kworb.ts refreshes them.
const SEED_TRACKS: TrackCard[] = [
  { id: "0VjIjW4GlUZAMYd2vXMi3b", title: "Blinding Lights", artist: "The Weeknd", releaseYear: 2019, albumArtUrl: "", streams: 4_300_000_000, tier: "A" },
  { id: "7qiZfU4dY1lWllzX7mPBI3", title: "Shape of You", artist: "Ed Sheeran", releaseYear: 2017, albumArtUrl: "", streams: 4_100_000_000, tier: "A" },
  { id: "2XU0oxnq2qxCpomAAuJY8K", title: "Someone You Loved", artist: "Lewis Capaldi", releaseYear: 2018, albumArtUrl: "", streams: 2_500_000_000, tier: "A" },
  { id: "3JvKfv6T31zO0ini8iNItO", title: "Starboy", artist: "The Weeknd, Daft Punk", releaseYear: 2016, albumArtUrl: "", streams: 2_700_000_000, tier: "A" },
  { id: "4u7EnebtmKWzUH433cf5Qv", title: "Perfect", artist: "Ed Sheeran", releaseYear: 2017, albumArtUrl: "", streams: 2_600_000_000, tier: "A" },
  { id: "1rgnBhdG2JDFTbYkYRZAku", title: "Levitating", artist: "Dua Lipa", releaseYear: 2020, albumArtUrl: "", streams: 2_300_000_000, tier: "A" },
  { id: "6habFhsOp2NvshLv26DqMb", title: "The Night We Met", artist: "Lord Huron", releaseYear: 2015, albumArtUrl: "", streams: 1_800_000_000, tier: "A" },
  { id: "2QjOHCTQ1Jl3zawyYOpxh6", title: "Sweater Weather", artist: "The Neighbourhood", releaseYear: 2013, albumArtUrl: "", streams: 1_700_000_000, tier: "A" },
  { id: "3CRDbSIZ4r5MsZ0YwxuEkn", title: "Another Love", artist: "Tom Odell", releaseYear: 2012, albumArtUrl: "", streams: 1_600_000_000, tier: "A" },
  { id: "5ChkMS8OtdzJeqyybCc9R5", title: "Lose Yourself", artist: "Eminem", releaseYear: 2002, albumArtUrl: "", streams: 1_550_000_000, tier: "A" },
  { id: "3AJwUDP919kvQ9QcozQPxgX", title: "Yellow", artist: "Coldplay", releaseYear: 2000, albumArtUrl: "", streams: 1_500_000_000, tier: "A" },
  { id: "2dpaYNEQHiRxtZbfNsse99", title: "Happier", artist: "Marshmello, Bastille", releaseYear: 2018, albumArtUrl: "", streams: 1_450_000_000, tier: "A" },
  { id: "4Dvkj6JhhA12EX05fT7y2e", title: "As It Was", artist: "Harry Styles", releaseYear: 2022, albumArtUrl: "", streams: 1_400_000_000, tier: "B" },
  { id: "7KXjTSCq5nL1LoYtL7XAwS", title: "HUMBLE.", artist: "Kendrick Lamar", releaseYear: 2017, albumArtUrl: "", streams: 1_350_000_000, tier: "B" },
  { id: "0tgVpDi06FyKpA1z0VMD4v", title: "Photograph", artist: "Ed Sheeran", releaseYear: 2014, albumArtUrl: "", streams: 1_300_000_000, tier: "B" },
  { id: "0e7ipj03S05BNilyu5bRzt", title: "Rockstar", artist: "Post Malone, 21 Savage", releaseYear: 2017, albumArtUrl: "", streams: 1_250_000_000, tier: "B" },
  { id: "6DCZcSspjsKoFjzjrWoCdn", title: "God's Plan", artist: "Drake", releaseYear: 2018, albumArtUrl: "", streams: 1_200_000_000, tier: "B" },
  { id: "0SiywuOBRcynK0uKGWdCnn", title: "Wake Me Up", artist: "Avicii", releaseYear: 2013, albumArtUrl: "", streams: 1_150_000_000, tier: "B" },
  { id: "5aAx2pezb1TzogukNzy3bB", title: "Closer", artist: "The Chainsmokers, Halsey", releaseYear: 2016, albumArtUrl: "", streams: 1_100_000_000, tier: "B" },
  { id: "5W3cjX2J3tjhG8zb6u0qHn", title: "Sunflower", artist: "Post Malone, Swae Lee", releaseYear: 2018, albumArtUrl: "", streams: 1_050_000_000, tier: "B" },
  { id: "7MXVkk9YMctZqd1Srtv4MB", title: "The Hills", artist: "The Weeknd", releaseYear: 2015, albumArtUrl: "", streams: 1_000_000_000, tier: "B" },
  { id: "2d8JPZyuAOkf1wZcEmJZ7Q", title: "Do I Wanna Know?", artist: "Arctic Monkeys", releaseYear: 2013, albumArtUrl: "", streams: 950_000_000, tier: "B" },
  { id: "0KKkJNfGyhkQ5aFgGZRpv6", title: "That's What I Like", artist: "Bruno Mars", releaseYear: 2016, albumArtUrl: "", streams: 900_000_000, tier: "B" },
  { id: "VivaLaVida2008Seed", title: "Viva La Vida", artist: "Coldplay", releaseYear: 2008, albumArtUrl: "", streams: 850_000_000, tier: "B" },
  { id: "4kflIGfjdZJW4ot2ioixTB", title: "Numb", artist: "Linkin Park", releaseYear: 2003, albumArtUrl: "", streams: 800_000_000, tier: "B" },
  { id: "0VgkVdmE4gld66l8iy98fW", title: "Take Me To Church", artist: "Hozier", releaseYear: 2013, albumArtUrl: "", streams: 750_000_000, tier: "B" },
  { id: "1mea3bSkSGhtoRXoM9oM5R", title: "Counting Stars", artist: "OneRepublic", releaseYear: 2013, albumArtUrl: "", streams: 700_000_000, tier: "B" },
  { id: "KeaneSomewhere2004Seed", title: "Somewhere Only We Know", artist: "Keane", releaseYear: 2004, albumArtUrl: "", streams: 500_000_000, tier: "C" },
  { id: "3U4isOIWM3VvDubwSI3y7a", title: "All of Me", artist: "John Legend", releaseYear: 2013, albumArtUrl: "", streams: 450_000_000, tier: "C" },
  { id: "2JzZzZUQj3Qff7wapcbKjc", title: "Stolen Dance", artist: "Milky Chance", releaseYear: 2013, albumArtUrl: "", streams: 400_000_000, tier: "C" },
  { id: "1xQ6trAsedVPCdbtDAmk0c", title: "Riptide", artist: "Vance Joy", releaseYear: 2013, albumArtUrl: "", streams: 350_000_000, tier: "C" },
  { id: "6gBFPUFcJLzWGx4lenP6h2", title: "Congratulations", artist: "Post Malone, Quavo", releaseYear: 2016, albumArtUrl: "", streams: 300_000_000, tier: "C" },
  { id: "2Fxmhks0bxGSBdJ92vM42m", title: "bad guy", artist: "Billie Eilish", releaseYear: 2019, albumArtUrl: "", streams: 250_000_000, tier: "C" },
  { id: "6UelLqGlWMcVH1E5c4H7lY", title: "Watermelon Sugar", artist: "Harry Styles", releaseYear: 2019, albumArtUrl: "", streams: 200_000_000, tier: "C" },
  { id: "2qxmye6gAegTMjLKEBoR3d", title: "Stressed Out", artist: "Twenty One Pilots", releaseYear: 2015, albumArtUrl: "", streams: 150_000_000, tier: "C" },
];

let importedTracks: TrackCard[] = [];
try {
  const importedPath = resolve(process.cwd(), "data", "tracks.json");
  if (existsSync(importedPath)) importedTracks = JSON.parse(readFileSync(importedPath, "utf8")) as TrackCard[];
} catch {
  importedTracks = [];
}

export const TRACKS: TrackCard[] = importedTracks.length >= 9 ? importedTracks : SEED_TRACKS;