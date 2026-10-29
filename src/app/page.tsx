"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import type { PublicTrackCard, RankTier } from "@/lib/puzzle";

interface DailyApiResponse {
  date: string;
  seedKey: string;
  puzzleNumber: number;
  targetStreams: number;
  tracks: PublicTrackCard[];
}

interface FinishData {
  rank: RankTier;
  finalSum: number;
  targetStreams: number;
  optimalHandIds: string[];
  optimalSum: number;
  allStreams: Record<string, number>;
}

interface PlayerStats {
  played: number;
  currentStreak: number;
  maxStreak: number;
  lastCompletedDate: string | null;
  blackjacks: number;
  tierCounts: Record<RankTier, number>;
}

interface SavedDailyState {
  date: string;
  pickedIds: string[];
  burnedIds: string[];
  revealedStreams: Record<string, number>;
  shieldAvailable: boolean;
  gameOver: boolean;
  finishData: FinishData | null;
}

const DEFAULT_STATS: PlayerStats = {
  played: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastCompletedDate: null,
  blackjacks: 0,
  tierCounts: {
    BLACKJACK: 0,
    "GOLD RECORD": 0,
    CHARTING: 0,
    SOUNDCHECK: 0,
    BUST: 0,
  },
};

function formatStreams(n: number): string {
  if (n >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(2)}B`;
  }
  return `${Math.round(n / 1_000_000)}M`;
}

function getLocalDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getYesterdayDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export default function StreamBlackjackPage() {
  const [board, setBoard] = useState<DailyApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [practiceSeed, setPracticeSeed] = useState<string | null>(null);

  // Gameplay state
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [burnedIds, setBurnedIds] = useState<string[]>([]);
  const [revealedStreams, setRevealedStreams] = useState<Record<string, number>>({});
  const [shieldAvailable, setShieldAvailable] = useState(true);
  const [shieldToast, setShieldToast] = useState<string | null>(null);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [finishData, setFinishData] = useState<FinishData | null>(null);

  // Animated odometer display value
  const [displaySum, setDisplaySum] = useState(0);
  const displaySumRef = useRef(0);

  // Audio preview player
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Modals & UI
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [countdown, setCountdown] = useState("00:00:00");
  const [stats, setStats] = useState<PlayerStats>(DEFAULT_STATS);

  const currentSum = pickedIds.reduce(
    (sum, id) => sum + (revealedStreams[id] || 0),
    0
  );

  // Smooth odometer animation whenever currentSum changes
  useEffect(() => {
    let frame: number;
    const start = displaySumRef.current;
    const diff = currentSum - start;
    if (diff === 0) return;
    const duration = 450;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const nextDisplaySum = Math.round(start + diff * eased);
      displaySumRef.current = nextDisplaySum;
      setDisplaySum(nextDisplaySum);
      if (elapsed < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [currentSum]);

  // Load saved stats from localStorage
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem("sbj_stats_v2");
        if (raw) setStats({ ...DEFAULT_STATS, ...JSON.parse(raw) });
      } catch {
        // Ignore storage errors
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingTrackId(null);
  }, []);

  const toggleAudioPreview = (e: React.MouseEvent, track: PublicTrackCard) => {
    e.stopPropagation();
    if (!track.previewUrl) return;

    if (playingTrackId === track.id) {
      stopAudio();
      return;
    }

    stopAudio();
    const audio = new Audio(track.previewUrl);
    audio.volume = 0.5;
    audioRef.current = audio;
    setPlayingTrackId(track.id);
    audio.play().catch(() => setPlayingTrackId(null));
    audio.onended = () => setPlayingTrackId(null);
  };

  const saveDailyProgress = (
    dateStr: string,
    nextState: Omit<SavedDailyState, "date">
  ) => {
    try {
      const payload: SavedDailyState = { date: dateStr, ...nextState };
      localStorage.setItem(`sbj_daily_${dateStr}`, JSON.stringify(payload));
    } catch {
      // Ignore
    }
  };

  const recordCompletedDailyStats = (dateStr: string, rank: RankTier) => {
    setStats((prev) => {
      if (prev.lastCompletedDate === dateStr) return prev;

      const isWin = rank !== "BUST";
      const wasYesterday =
        prev.lastCompletedDate === getYesterdayDateStr(dateStr);
      const nextStreak = isWin
        ? wasYesterday || prev.currentStreak === 0
          ? prev.currentStreak + 1
          : 1
        : 0;

      const updated: PlayerStats = {
        played: prev.played + 1,
        currentStreak: nextStreak,
        maxStreak: Math.max(prev.maxStreak, nextStreak),
        lastCompletedDate: dateStr,
        blackjacks: prev.blackjacks + (rank === "BLACKJACK" ? 1 : 0),
        tierCounts: {
          ...prev.tierCounts,
          [rank]: (prev.tierCounts[rank] || 0) + 1,
        },
      };

      try {
        localStorage.setItem("sbj_stats_v2", JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  };

  const loadBoard = useCallback(
    async (dateStr: string, customSeed: string | null) => {
      stopAudio();
      setLoading(true);
      setShieldToast(null);
      try {
        const params = new URLSearchParams({ date: dateStr });
        if (customSeed) params.set("seed", customSeed);
        const res = await fetch(`/api/daily?${params.toString()}`);
        const data: DailyApiResponse = await res.json();
        setBoard(data);

        // Restore saved state if in Daily Mode
        if (!customSeed) {
          const savedRaw = localStorage.getItem(`sbj_daily_${dateStr}`);
          if (savedRaw) {
            const saved: SavedDailyState = JSON.parse(savedRaw);
            setPickedIds(saved.pickedIds || []);
            setBurnedIds(saved.burnedIds || []);
            setRevealedStreams(saved.revealedStreams || {});
            setShieldAvailable(saved.shieldAvailable ?? true);
            setGameOver(saved.gameOver || false);
            setFinishData(saved.finishData || null);
            const restoredSum = (saved.pickedIds || []).reduce(
              (acc, id) => acc + (saved.revealedStreams?.[id] || 0),
              0
            );
            displaySumRef.current = restoredSum;
            setDisplaySum(restoredSum);
            setLoading(false);
            return;
          }
        }

        // Fresh board reset
        setPickedIds([]);
        setBurnedIds([]);
        setRevealedStreams({});
        setShieldAvailable(true);
        setGameOver(false);
        setFinishData(null);
        displaySumRef.current = 0;
        setDisplaySum(0);
      } finally {
        setLoading(false);
      }
    },
    [stopAudio]
  );

  // Countdown timer to local midnight + automatic new-day detection
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const tomorrow = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      );
      const diff = Math.max(0, tomorrow.getTime() - now.getTime());
      const hrs = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const mins = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      setCountdown(`${hrs}:${mins}:${secs}`);

      const today = getLocalDateStr();
      if (board?.date && !practiceSeed && board.date !== today) {
        void loadBoard(today, null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [board?.date, practiceSeed, loadBoard]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void loadBoard(getLocalDateStr(), null);
    });
    return () => cancelAnimationFrame(frame);
  }, [loadBoard]);

  const finalizeHand = async (
    finalPickedIds: string[],
    currentRevealed: Record<string, number>,
    currentBurned: string[],
    currentShield: boolean
  ) => {
    if (!board) return;
    stopAudio();
    const res = await fetch("/api/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: board.date,
        seed: practiceSeed,
        pickedIds: finalPickedIds,
      }),
    });
    const data: FinishData = await res.json();
    const mergedStreams = { ...currentRevealed, ...data.allStreams };

    setRevealedStreams(mergedStreams);
    setFinishData(data);
    setGameOver(true);

    if (!practiceSeed) {
      saveDailyProgress(board.date, {
        pickedIds: finalPickedIds,
        burnedIds: currentBurned,
        revealedStreams: mergedStreams,
        shieldAvailable: currentShield,
        gameOver: true,
        finishData: data,
      });
      recordCompletedDailyStats(board.date, data.rank);
    }
  };

  const handleCardClick = async (track: PublicTrackCard) => {
    if (
      !board ||
      gameOver ||
      busyTrackId ||
      pickedIds.includes(track.id) ||
      burnedIds.includes(track.id)
    ) {
      return;
    }

    setBusyTrackId(track.id);
    setShieldToast(null);

    try {
      const res = await fetch("/api/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: board.date,
          seed: practiceSeed,
          trackId: track.id,
        }),
      });
      const data = await res.json();
      const trackStreams: number = data.streams;

      const nextRevealed = { ...revealedStreams, [track.id]: trackStreams };
      setRevealedStreams(nextRevealed);

      const candidateSum = currentSum + trackStreams;

      // Check if player busts the target cap
      if (candidateSum > board.targetStreams) {
        if (shieldAvailable) {
          const nextBurned = [...burnedIds, track.id];
          setBurnedIds(nextBurned);
          setShieldAvailable(false);
          setShieldToast(
            `🛡️ BUST SHIELD SAVED YOU! "${track.title}" (${formatStreams(
              trackStreams
            )}) burned.`
          );

          if (!practiceSeed) {
            saveDailyProgress(board.date, {
              pickedIds,
              burnedIds: nextBurned,
              revealedStreams: nextRevealed,
              shieldAvailable: false,
              gameOver: false,
              finishData: null,
            });
          }
        } else {
          // Second bust -> Game Over
          const nextPicked = [...pickedIds, track.id];
          setPickedIds(nextPicked);
          await finalizeHand(nextPicked, nextRevealed, burnedIds, false);
        }
      } else {
        // Safe hit
        const nextPicked = [...pickedIds, track.id];
        setPickedIds(nextPicked);

        // Auto-stand if player hit 98%+ Blackjack zone
        if (candidateSum >= board.targetStreams * 0.98) {
          await finalizeHand(
            nextPicked,
            nextRevealed,
            burnedIds,
            shieldAvailable
          );
        } else if (!practiceSeed) {
          saveDailyProgress(board.date, {
            pickedIds: nextPicked,
            burnedIds,
            revealedStreams: nextRevealed,
            shieldAvailable,
            gameOver: false,
            finishData: null,
          });
        }
      }
    } finally {
      setBusyTrackId(null);
    }
  };

  const handleStand = async () => {
    if (!board || gameOver || pickedIds.length === 0) return;
    await finalizeHand(pickedIds, revealedStreams, burnedIds, shieldAvailable);
  };

  const handleShare = () => {
    if (!board || !finishData) return;
    const pct = ((finishData.finalSum / board.targetStreams) * 100).toFixed(1);
    const gridRows: string[] = [];

    for (let i = 0; i < 9; i += 3) {
      const row = board.tracks
        .slice(i, i + 3)
        .map((t) => {
          if (pickedIds.includes(t.id)) return "🟩";
          if (burnedIds.includes(t.id)) return "🛡️";
          if (finishData.optimalHandIds.includes(t.id)) return "⭐";
          return "⬛";
        })
        .join("");
      gridRows.push(row);
    }

    const modeTitle = practiceSeed
      ? `Stream Blackjack (Practice)`
      : `Stream Blackjack — Day #${board.puzzleNumber}`;

    const shareText = [
      `🎧 ${modeTitle}`,
      `🎯 ${formatStreams(finishData.finalSum)} / ${formatStreams(
        board.targetStreams
      )} (${pct}%) — ${finishData.rank}`,
      `🔥 Streak: ${stats.currentStreak}`,
      "",
      ...gridRows,
    ].join("\n");

    navigator.clipboard.writeText(shareText);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2500);
  };

  const switchMode = (newSeed: string | null) => {
    setPracticeSeed(newSeed);
    loadBoard(getLocalDateStr(), newSeed);
  };

  const targetStreams = board?.targetStreams || 4500000000;
  const fillPercent = Math.min(100, (currentSum / targetStreams) * 100);
  const rawPercent = ((currentSum / targetStreams) * 100).toFixed(1);
  const headroom = Math.max(0, targetStreams - currentSum);
  const isBust = currentSum > targetStreams;

  return (
    <div className="min-h-screen pb-16 text-white selection:bg-[#1DB954] selection:text-black">
      {/* TOP SPOTIFY NAVIGATION HEADER */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#090909]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          {/* Brand Logo + Day Badge */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1DB954] text-black shadow-[0_0_20px_rgba(29,185,84,0.45)]">
              <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight sm:text-xl">
                  STREAM <span className="text-[#1DB954]">BLACKJACK</span>
                </h1>
                {board && (
                  <span className="rounded-full border border-[#1DB954]/40 bg-[#1DB954]/15 px-2.5 py-0.5 text-xs font-bold tracking-wider text-[#1ed760]">
                    {practiceSeed ? "PRACTICE" : `DAY #${board.puzzleNumber}`}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400">
                Hit tracks to approach the daily stream cap without busting
              </p>
            </div>
          </div>

          {/* Right Controls: Streak, Stats, Mode Switcher, Help */}
          <div className="flex items-center gap-2">
            {/* Streak Pill */}
            <button
              onClick={() => setShowStatsModal(true)}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#181818] px-3 py-1.5 text-xs font-bold transition hover:border-[#1DB954]/50 hover:bg-[#242424]"
              title="View Streak & Career Stats"
            >
              <span className="text-sm">🔥</span>
              <span>{stats.currentStreak}</span>
              <span className="hidden text-neutral-400 sm:inline">STREAK</span>
            </button>

            {/* Stats Button */}
            <button
              onClick={() => setShowStatsModal(true)}
              className="rounded-full border border-white/10 bg-[#181818] px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-white/25 hover:bg-[#242424]"
            >
              📊 Stats
            </button>

            {/* Daily vs Unlimited Practice Toggle */}
            {practiceSeed ? (
              <button
                onClick={() => switchMode(null)}
                className="rounded-full bg-[#1DB954] px-3 py-1.5 text-xs font-bold text-black transition hover:bg-[#1ed760]"
              >
                Back to Daily
              </button>
            ) : (
              <button
                onClick={() => switchMode(String(Date.now()))}
                className="rounded-full border border-white/10 bg-[#181818] px-3 py-1.5 text-xs font-semibold text-neutral-300 transition hover:border-[#1DB954]/50 hover:text-white"
              >
                ♾️ Free Play
              </button>
            )}

            {/* How to Play */}
            <button
              onClick={() => setShowHelpModal(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#181818] text-xs font-bold text-neutral-300 transition hover:border-white/30 hover:text-white"
              aria-label="How to Play"
            >
              ?
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6">
        {/* HUD METER / STREAM CONSOLE */}
        <section
          className={`relative mb-6 overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${
            isBust
              ? "border-red-500/50 bg-gradient-to-b from-red-950/40 to-[#141414]"
              : currentSum >= targetStreams * 0.98
              ? "border-[#1DB954] bg-gradient-to-b from-[#1DB954]/20 to-[#141414] shadow-[0_0_35px_rgba(29,185,84,0.2)]"
              : "border-white/10 bg-[#141414]/90"
          }`}
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            {/* Odometer Readout */}
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neutral-400">
                <span>Current Hand Total</span>
                <span className="text-neutral-600">•</span>
                <span className="text-[#1ed760]">
                  {pickedIds.length} {pickedIds.length === 1 ? "Track" : "Tracks"} Picked
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                <span
                  className={`font-mono text-4xl font-black tracking-tight sm:text-5xl ${
                    isBust ? "text-red-400" : "text-white"
                  }`}
                >
                  {formatStreams(displaySum)}
                </span>
                <span className="font-mono text-lg text-neutral-400 sm:text-xl">
                  / {formatStreams(targetStreams)} Cap
                </span>
              </div>
            </div>

            {/* Right Controls: Shield Badge + Stand Button */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Bust Shield Indicator */}
              <div
                className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition ${
                  shieldAvailable
                    ? "border-[#1DB954]/40 bg-[#1DB954]/10 text-[#1ed760]"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                }`}
              >
                <span>{shieldAvailable ? "🛡️" : "💥"}</span>
                <span>
                  {shieldAvailable ? "Bust Shield Ready" : "Shield Burned"}
                </span>
              </div>

              {/* Stand Button */}
              {!gameOver && (
                <button
                  onClick={handleStand}
                  disabled={pickedIds.length === 0 || !!busyTrackId}
                  className="rounded-full bg-[#1DB954] px-6 py-2.5 text-sm font-extrabold tracking-wide text-black shadow-[0_4px_20px_rgba(29,185,84,0.4)] transition hover:scale-[1.03] hover:bg-[#1ed760] active:scale-95 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500 disabled:shadow-none"
                >
                  STAND & LOCK IN
                </button>
              )}

              {practiceSeed && gameOver && (
                <button
                  onClick={() => switchMode(String(Date.now()))}
                  className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-extrabold text-black transition hover:bg-[#1ed760]"
                >
                  🔄 Deal New Hand
                </button>
              )}
            </div>
          </div>

          {/* PROGRESS BAR WITH 90% GOLD & 98% BLACKJACK MARKERS */}
          <div className="mt-5">
            <div className="relative h-4 w-full overflow-hidden rounded-full bg-neutral-900 p-0.5 ring-1 ring-white/10">
              {/* 90% Gold Zone Marker */}
              <div
                className="absolute top-0 bottom-0 z-10 border-l border-dashed border-amber-400/70"
                style={{ left: "90%" }}
                title="90% Gold Record Zone"
              />
              {/* 98% Blackjack Zone Highlight */}
              <div
                className="absolute top-0 bottom-0 z-10 bg-[#1DB954]/25 border-l border-[#1DB954]"
                style={{ left: "98%", width: "2%" }}
                title="98%-100% Blackjack Zone"
              />

              {/* Animated Bar */}
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  isBust
                    ? "bg-gradient-to-r from-red-600 to-red-400"
                    : currentSum >= targetStreams * 0.98
                    ? "bg-gradient-to-r from-[#1DB954] to-[#1ed760] shadow-[0_0_15px_#1DB954]"
                    : currentSum >= targetStreams * 0.9
                    ? "bg-gradient-to-r from-[#1DB954] to-amber-400"
                    : "bg-[#1DB954]"
                }`}
                style={{ width: `${fillPercent}%` }}
              />
            </div>

            {/* Sub-bar Telemetry */}
            <div className="mt-2 flex items-center justify-between text-xs font-medium text-neutral-400">
              <span>{rawPercent}% of Target Cap</span>
              <div className="flex items-center gap-4">
                <span className="hidden sm:inline text-amber-400/90">
                  💿 90% Gold ({formatStreams(targetStreams * 0.9)})
                </span>
                <span className="hidden sm:inline text-[#1ed760]">
                  🃏 98% Blackjack ({formatStreams(targetStreams * 0.98)})
                </span>
                <span className="font-mono font-semibold text-white">
                  {isBust
                    ? `BUSTED BY ${formatStreams(currentSum - targetStreams)}`
                    : `${formatStreams(headroom)} Headroom Left`}
                </span>
              </div>
            </div>
          </div>

          {/* BUST SHIELD TOAST ALERT */}
          {shieldToast && (
            <div className="animate-shake mt-4 flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-xs font-semibold text-amber-200">
              <span>{shieldToast}</span>
              <button
                onClick={() => setShieldToast(null)}
                className="ml-3 text-amber-300 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}
        </section>

        {/* POST-GAME RESULTS & OPTIMAL HAND BANNER */}
        {gameOver && finishData && board && (
          <section className="mb-6 rounded-2xl border border-[#1DB954]/40 bg-gradient-to-br from-[#181818] via-[#141414] to-[#0f2918] p-5 shadow-2xl">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#1DB954]/20 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-[#1ed760]">
                  <span>
                    {finishData.rank === "BLACKJACK"
                      ? "🃏 BLACKJACK!"
                      : finishData.rank === "GOLD RECORD"
                      ? "💿 GOLD RECORD"
                      : finishData.rank === "CHARTING"
                      ? "📻 CHARTING"
                      : finishData.rank === "SOUNDCHECK"
                      ? "🛋️ SOUNDCHECK"
                      : "💥 BUSTED"}
                  </span>
                  <span>•</span>
                  <span>
                    {((finishData.finalSum / board.targetStreams) * 100).toFixed(
                      1
                    )}
                    % Accuracy
                  </span>
                </div>

                <h2 className="mt-2 text-2xl font-black">
                  You locked in {formatStreams(finishData.finalSum)} /{" "}
                  {formatStreams(board.targetStreams)}
                </h2>
                <p className="mt-1 text-sm text-neutral-300">
                  Today&apos;s Optimal Hand reached{" "}
                  <span className="font-bold text-[#1ed760]">
                    {formatStreams(finishData.optimalSum)} (
                    {(
                      (finishData.optimalSum / board.targetStreams) *
                      100
                    ).toFixed(1)}
                    %)
                  </span>{" "}
                  — look for the{" "}
                  <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-xs font-bold text-amber-300">
                    ★ OPTIMAL
                  </span>{" "}
                  badges on the board below.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {!practiceSeed && (
                  <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      Next Daily Drop
                    </div>
                    <div className="font-mono text-lg font-extrabold text-[#1ed760]">
                      {countdown}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 rounded-full bg-[#1DB954] px-5 py-3 text-sm font-extrabold text-black shadow-[0_4px_20px_rgba(29,185,84,0.4)] transition hover:scale-105 hover:bg-[#1ed760]"
                >
                  <span>{copiedShare ? "✅ Copied Grid!" : "📤 Share Score"}</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* 3x3 SPOTIFY TRACK GRID */}
        {loading || !board ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div
                key={idx}
                className="h-36 animate-pulse rounded-2xl border border-white/5 bg-[#181818] p-4"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {board.tracks.map((track) => {
              const isPicked = pickedIds.includes(track.id);
              const isBurned = burnedIds.includes(track.id);
              const isOptimal =
                gameOver && finishData?.optimalHandIds.includes(track.id);
              const streams = revealedStreams[track.id];
              const isPlaying = playingTrackId === track.id;

              return (
                <div
                  key={track.id}
                  onClick={() => handleCardClick(track)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleCardClick(track);
                    }
                  }}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 ${
                    isPicked
                      ? "border-[#1DB954] bg-gradient-to-br from-[#1DB954]/20 via-[#181818] to-[#121212] shadow-[0_0_25px_rgba(29,185,84,0.18)]"
                      : isBurned
                      ? "border-amber-500/40 bg-amber-950/20 opacity-80"
                      : gameOver
                      ? isOptimal
                        ? "border-amber-400/60 bg-[#1c1a12]"
                        : "border-white/10 bg-[#161616] opacity-85"
                      : "cursor-pointer border-white/10 bg-[#181818] hover:-translate-y-1 hover:border-[#1DB954]/60 hover:bg-[#242424] hover:shadow-xl"
                  }`}
                >
                  {/* Top Row: Album Cover + Track Metadata */}
                  <div className="flex items-start gap-3.5">
                    {/* Album Cover Wrapper */}
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-1 ring-white/10">
                      {track.albumArtUrl ? (
                        <img
                          src={track.albumArtUrl}
                          alt={`${track.title} cover`}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1DB954]/30 to-neutral-900 text-2xl">
                          🎵
                        </div>
                      )}

                      {/* 30s Audio Preview Play Button Overlay */}
                      {track.previewUrl && (
                        <button
                          type="button"
                          onClick={(e) => toggleAudioPreview(e, track)}
                          title={
                            isPlaying ? "Pause 30s Preview" : "Play 30s Preview"
                          }
                          className={`absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full shadow-md transition ${
                            isPlaying
                              ? "bg-[#1DB954] text-black scale-105"
                              : "bg-black/75 text-white opacity-90 hover:bg-[#1DB954] hover:text-black"
                          }`}
                        >
                          {isPlaying ? "⏸" : "▶"}
                        </button>
                      )}
                    </div>

                    {/* Track Title, Artist & Badges */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-neutral-300">
                          {track.releaseYear}
                        </span>
                        {isPicked && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#1DB954] px-2 py-0.5 text-[10px] font-extrabold uppercase text-black">
                            <span>HIT</span>
                          </span>
                        )}
                        {isBurned && (
                          <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber-300">
                            🛡️ BURNED
                          </span>
                        )}
                        {isOptimal && (
                          <span className="rounded-md bg-amber-400/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber-300">
                            ★ OPTIMAL
                          </span>
                        )}
                      </div>

                      <h3 className="mt-1.5 line-clamp-1 text-base font-bold text-white group-hover:text-[#1ed760]">
                        {track.title}
                      </h3>
                      <p className="line-clamp-1 text-xs font-medium text-neutral-400">
                        {track.artist}
                      </p>
                    </div>
                  </div>

                  {/* Bottom Footer: Stream Count Reveal or Hit Action */}
                  <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                    {streams !== undefined ? (
                      <>
                        <div className="flex items-center gap-2">
                          {isPicked && (
                            <div className="flex items-end gap-0.5 h-4">
                              <span className="w-1 bg-[#1DB954] rounded-full eq-bar-1" />
                              <span className="w-1 bg-[#1DB954] rounded-full eq-bar-2" />
                              <span className="w-1 bg-[#1DB954] rounded-full eq-bar-3" />
                            </div>
                          )}
                          <span
                            className={`font-mono text-lg font-black ${
                              isPicked
                                ? "text-[#1ed760]"
                                : isBurned
                                ? "line-through text-amber-400"
                                : "text-white"
                            }`}
                          >
                            {formatStreams(streams)}
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            streams
                          </span>
                        </div>
                        <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-neutral-300">
                          {((streams / board.targetStreams) * 100).toFixed(1)}%
                          of cap
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-medium text-neutral-400 group-hover:text-neutral-200">
                          {busyTrackId === track.id
                            ? "Revealing streams..."
                            : "Tap to Hit Track"}
                        </span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-xs font-bold text-[#1ed760] transition group-hover:border-[#1DB954] group-hover:bg-[#1DB954] group-hover:text-black">
                          +
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* STATS & STREAK MODAL */}
      {showStatsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowStatsModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/15 bg-[#181818] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black tracking-tight">
                YOUR CAREER STATS
              </h3>
              <button
                onClick={() => setShowStatsModal(false)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-[#121212] p-3">
                <div className="font-mono text-2xl font-black text-white">
                  {stats.played}
                </div>
                <div className="text-[11px] text-neutral-400">Played</div>
              </div>
              <div className="rounded-xl bg-[#121212] p-3">
                <div className="font-mono text-2xl font-black text-[#1ed760]">
                  {stats.currentStreak} 🔥
                </div>
                <div className="text-[11px] text-neutral-400">Streak</div>
              </div>
              <div className="rounded-xl bg-[#121212] p-3">
                <div className="font-mono text-2xl font-black text-white">
                  {stats.maxStreak}
                </div>
                <div className="text-[11px] text-neutral-400">Max Streak</div>
              </div>
              <div className="rounded-xl bg-[#121212] p-3">
                <div className="font-mono text-2xl font-black text-amber-400">
                  {stats.blackjacks}
                </div>
                <div className="text-[11px] text-neutral-400">Blackjacks</div>
              </div>
            </div>

            <h4 className="mt-6 text-xs font-bold uppercase tracking-wider text-neutral-400">
              Rank Distribution
            </h4>
            <div className="mt-3 space-y-2 text-xs">
              {(
                [
                  "BLACKJACK",
                  "GOLD RECORD",
                  "CHARTING",
                  "SOUNDCHECK",
                  "BUST",
                ] as RankTier[]
              ).map((tier) => {
                const count = stats.tierCounts[tier] || 0;
                const pct =
                  stats.played > 0
                    ? Math.max(8, Math.round((count / stats.played) * 100))
                    : 8;
                return (
                  <div key={tier} className="flex items-center gap-3">
                    <span className="w-28 font-semibold text-neutral-300">
                      {tier}
                    </span>
                    <div className="flex-1 overflow-hidden rounded-full bg-[#121212]">
                      <div
                        className="rounded-full bg-[#1DB954] px-2 py-1 text-right font-mono font-bold text-black"
                        style={{ width: `${pct}%` }}
                      >
                        {count}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* HOW TO PLAY MODAL */}
      {showHelpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/15 bg-[#181818] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">HOW TO PLAY</h3>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-neutral-300">
              <li>
                🎯 <strong>The Goal:</strong> Pick tracks from the 3×3 grid so
                their combined Spotify streams get as close to the{" "}
                <strong>Daily Cap</strong> as possible without going over.
              </li>
              <li>
                🛡️ <strong>1 Bust Shield:</strong> If a pick pushes you over the
                cap, your Bust Shield burns that track and keeps your hand alive.
                A second bust ends the round!
              </li>
              <li>
                🃏 <strong>Scoring Tiers:</strong>
                <ul className="mt-1.5 ml-4 space-y-1 text-xs text-neutral-400">
                  <li>
                    <strong className="text-[#1ed760]">98% – 100%:</strong>{" "}
                    BLACKJACK (Auto-locks in!)
                  </li>
                  <li>
                    <strong className="text-amber-300">90% – 97.9%:</strong>{" "}
                    GOLD RECORD
                  </li>
                  <li>
                    <strong>75% – 89.9%:</strong> CHARTING
                  </li>
                </ul>
              </li>
              <li>
                🔊 <strong>Audio Previews:</strong> Tap the ▶ button on any
                album cover to listen to a 30-second snippet while deciding.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}