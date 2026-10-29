import { TRACKS, type TrackCard } from "@/lib/tracks";

export interface DailyPuzzle {
  date: string;
  puzzleNumber: number;
  targetStreams: number;
  optimalHandIds: string[];
  optimalSum: number;
  tracks: TrackCard[];
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const shuffled = [...items];
  let state = seed || 1;
  for (let index = shuffled.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function combinations<T>(items: T[], minSize: number, maxSize: number): T[][] {
  const results: T[][] = [];
  const visit = (start: number, selected: T[]) => {
    if (selected.length >= minSize) results.push([...selected]);
    if (selected.length === maxSize) return;
    for (let index = start; index < items.length; index++) {
      selected.push(items[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  };
  visit(0, []);
  return results;
}

function buildBoard(date: string, attempt: number): TrackCard[] {
  const seed = hash(`${date}:${attempt}`);
  const tierA = seededShuffle(TRACKS.filter((track) => track.tier === "A"), seed).slice(0, 2);
  const tierB = seededShuffle(TRACKS.filter((track) => track.tier === "B"), seed ^ 0x9e3779b9).slice(0, 4);
  const tierC = seededShuffle(TRACKS.filter((track) => track.tier === "C"), seed ^ 0x85ebca6b).slice(0, 3);
  return seededShuffle([...tierA, ...tierB, ...tierC], seed ^ 0xc2b2ae35);
}

export function createDailyPuzzle(date: string): DailyPuzzle {
  let tracks: TrackCard[] = [];
  let hands: { ids: string[]; sum: number }[] = [];
  let candidates: { target: number; nearBlackjack: number; gold: number }[] = [];
  for (let attempt = 0; attempt < 512 && candidates.length === 0; attempt++) {
    tracks = buildBoard(date, attempt);
    hands = combinations(tracks, 3, 5).map((hand) => ({
      ids: hand.map((track) => track.id),
      sum: hand.reduce((total, track) => total + track.streams, 0),
    }));
    candidates = [];
    for (let target = 2_500_000_000; target <= 5_000_000_000; target += 250_000_000) {
      const nearBlackjack = hands.filter((hand) => hand.sum >= target * 0.98 && hand.sum <= target).length;
      const gold = hands.filter((hand) => hand.sum >= target * 0.9 && hand.sum < target * 0.98).length;
      if (nearBlackjack >= 2 && gold >= 10) candidates.push({ target, nearBlackjack, gold });
    }
  }

  const targetStreams = candidates.length
    ? candidates[hash(`${date}:target`) % candidates.length].target
    : Math.round((hands.reduce((best, hand) => Math.abs(hand.sum - 3_500_000_000) < Math.abs(best - 3_500_000_000) ? hand.sum : best, hands[0]?.sum ?? 3_500_000_000) / 250_000_000) * 250_000_000);

  const safeHands = hands.filter((hand) => hand.sum <= targetStreams);
  const optimal = safeHands.reduce((best, hand) => hand.sum > best.sum ? hand : best, { ids: [], sum: 0 });
  return {
    date,
    puzzleNumber: Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse("2026-01-01T00:00:00Z")) / 86_400_000) + 1,
    targetStreams,
    optimalHandIds: optimal.ids,
    optimalSum: optimal.sum,
    tracks,
  };
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatStreams(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
  return value.toLocaleString("en-US");
}