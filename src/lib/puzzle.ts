import { TRACK_POOL, TrackRecord } from "./tracks";

export const GAME_EPOCH = "2026-10-01"; // Day #1 launch date

export interface PublicTrackCard {
  id: string;
  title: string;
  artist: string;
  releaseYear: number;
  albumArtUrl?: string;
  previewUrl?: string;
}

export interface DailyPuzzleData {
  date: string;
  seedKey: string;
  puzzleNumber: number;
  targetStreams: number;
  optimalHandIds: string[];
  optimalSum: number;
  tracks: TrackRecord[];
}

export type RankTier =
  | "BLACKJACK"
  | "GOLD RECORD"
  | "CHARTING"
  | "SOUNDCHECK"
  | "BUST";

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPuzzleNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [ey, em, ed] = GAME_EPOCH.split("-").map(Number);
  const currentUTC = Date.UTC(y || 2026, (m || 10) - 1, d || 29);
  const epochUTC = Date.UTC(ey, em - 1, ed);
  const diffDays = Math.floor((currentUTC - epochUTC) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

// Deterministic string hash -> Mulberry32 PRNG
function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededSample<T>(arr: T[], count: number, rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export function generateDailyPuzzle(
  dateStr: string = getTodayDateString(),
  customSeed?: string
): DailyPuzzleData {
  const seedKey = customSeed ? `${dateStr}-${customSeed}` : dateStr;
  const rng = mulberry32(hashString(`stream-blackjack-v2-${seedKey}`));

  const tierA = TRACK_POOL.filter((t) => t.streams >= 1800000000);
  const tierB = TRACK_POOL.filter(
    (t) => t.streams >= 850000000 && t.streams < 1800000000
  );
  const tierC = TRACK_POOL.filter((t) => t.streams < 850000000);

  // Pick 2 Heavyweights, 4 Mid-tier, 3 Finesse tracks and shuffle board positions
  const picked = [
    ...seededSample(tierA, 2, rng),
    ...seededSample(tierB, 4, rng),
    ...seededSample(tierC, 3, rng),
  ];
  const boardTracks = seededSample(picked, 9, rng);

  // Enumerate all 3, 4, and 5 card subsets (336 total hands)
  interface Combo {
    ids: string[];
    sum: number;
  }
  const combos: Combo[] = [];

  const n = boardTracks.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const bitCount = mask.toString(2).split("1").length - 1;
    if (bitCount >= 3 && bitCount <= 5) {
      let sum = 0;
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          sum += boardTracks[i].streams;
          ids.push(boardTracks[i].id);
        }
      }
      combos.push({ ids, sum });
    }
  }

  // Candidate targets in clean 250M increments between 3.25B and 7.50B
  const candidates: number[] = [];
  for (let t = 3250000000; t <= 7500000000; t += 250000000) {
    candidates.push(t);
  }

  const validTargets = candidates.filter((target) => {
    const blackjackHits = combos.filter(
      (c) => c.sum >= target * 0.98 && c.sum <= target
    );
    const goldHits = combos.filter(
      (c) => c.sum >= target * 0.9 && c.sum < target * 0.98
    );
    return blackjackHits.length >= 2 && goldHits.length >= 8;
  });

  const targetStreams =
    validTargets.length > 0
      ? validTargets[Math.floor(rng() * validTargets.length)]
      : 4500000000;

  // Find optimal hand <= targetStreams
  let optimal: Combo = { ids: [], sum: 0 };
  for (const c of combos) {
    if (c.sum <= targetStreams && c.sum > optimal.sum) {
      optimal = c;
    }
  }

  return {
    date: dateStr,
    seedKey,
    puzzleNumber: getPuzzleNumber(dateStr),
    targetStreams,
    optimalHandIds: optimal.ids,
    optimalSum: optimal.sum,
    tracks: boardTracks,
  };
}

export function evaluateRank(sum: number, target: number): RankTier {
  if (sum > target) return "BUST";
  const ratio = sum / target;
  if (ratio >= 0.98) return "BLACKJACK";
  if (ratio >= 0.9) return "GOLD RECORD";
  if (ratio >= 0.75) return "CHARTING";
  return "SOUNDCHECK";
}