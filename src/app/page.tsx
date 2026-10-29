"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface Track {
  id: string;
  title: string;
  artist: string;
  releaseYear: number;
  albumArtUrl: string;
}

interface Board {
  date: string;
  puzzleNumber: number;
  targetStreams: number;
  tracks: Track[];
}

interface RevealedTrack extends Track {
  streams: number;
}

interface FinalReveal {
  tracks: { id: string; streams: number }[];
  optimalHandIds: string[];
  optimalSum: number;
}

type EndReason = "stand" | "bust";
interface SavedResult {
  score: number;
  reason: EndReason;
  picked: string[];
  burned: string[];
  shield: boolean;
}

function formatStreams(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
  return value.toLocaleString("en-US");
}

function rankFor(score: number, target: number, reason: EndReason) {
  const ratio = score / target;
  if (reason === "bust" || ratio > 1) return { title: "BUST", badge: "💥", emoji: "💥", label: "Over the limit" };
  if (ratio >= 0.98) return { title: "BLACKJACK", badge: "🃏", emoji: "🃏", label: "Platinum Vinyl" };
  if (ratio >= 0.9) return { title: "GOLD RECORD", badge: "💿", emoji: "💿", label: "Gold Record" };
  if (ratio >= 0.75) return { title: "CHARTING", badge: "📻", emoji: "📻", label: "Charting" };
  return { title: "SOUNDCHECK", badge: "🛋️", emoji: "🛋️", label: "Soundcheck" };
}

function localDateOffset(date: string, offset: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export default function Home() {
  const [board, setBoard] = useState<Board | null>(null);
  const [revealed, setRevealed] = useState<Record<string, RevealedTrack>>({});
  const [burned, setBurned] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [shield, setShield] = useState(true);
  const [ended, setEnded] = useState<EndReason | null>(null);
  const [finalReveal, setFinalReveal] = useState<FinalReveal | null>(null);
  const [streak, setStreak] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/daily").then((response) => response.json()).then((data: Board) => {
      setBoard(data);
      const saved = localStorage.getItem("stream-blackjack-streak");
      const parsed = saved ? JSON.parse(saved) as { date: string; count: number } : null;
      if (parsed && (parsed.date === data.date || parsed.date === localDateOffset(data.date, -1))) {
        setStreak(parsed.date === data.date ? parsed.count : parsed.count);
      }
      const savedResult = localStorage.getItem(`stream-blackjack-result-${data.date}`);
      if (savedResult) {
        const result = JSON.parse(savedResult) as SavedResult;
        setTotal(result.score);
        setEnded(result.reason);
        setPicked(result.picked ?? []);
        setBurned(result.burned ?? []);
        setShield(result.shield ?? result.reason !== "bust");
        fetch("/api/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: data.date }),
        }).then((response) => response.ok ? response.json() as Promise<FinalReveal> : null)
          .then((reveal) => { if (reveal) setFinalReveal(reveal); })
          .catch(() => setMessage("Could not load the answer reveal. Refresh and retry later."));
      }
    }).catch(() => setMessage("Could not load today’s board. Refresh to try again."));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (new Date().toISOString().slice(0, 10) !== board?.date) window.location.reload();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [board?.date]);

  const remaining = board ? Math.max(0, board.targetStreams - total) : 0;
  const progress = board ? Math.min((total / board.targetStreams) * 100, 100) : 0;
  const finished = ended !== null;
  const rank = ended && board ? rankFor(total, board.targetStreams, ended) : null;

  async function finish(reason: EndReason, score: number, pickedIds = picked) {
    if (!board) return;
    setEnded(reason);
    setTotal(score);
    try {
      const response = await fetch("/api/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: board.date }),
      });
      if (response.ok) setFinalReveal(await response.json() as FinalReveal);
    } catch {
      setMessage("Could not load the answer reveal. Refresh and retry later.");
    }

    const previous = localStorage.getItem("stream-blackjack-streak");
    const previousRecord = previous ? JSON.parse(previous) as { date: string; count: number } : null;
    const nextStreak = previousRecord?.date === localDateOffset(board.date, -1)
      ? previousRecord.count + 1
      : previousRecord?.date === board.date ? previousRecord.count : 1;
    localStorage.setItem("stream-blackjack-streak", JSON.stringify({ date: board.date, count: nextStreak }));
    localStorage.setItem(`stream-blackjack-result-${board.date}`, JSON.stringify({ score, reason, picked: pickedIds, burned, shield } satisfies SavedResult));
    setStreak(nextStreak);
  }

  async function hit(track: Track) {
    if (!board || busy || finished || picked.includes(track.id) || burned.includes(track.id)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: board.date, trackId: track.id }),
      });
      if (!response.ok) throw new Error("Unable to reveal track");
      const data = await response.json() as { streams: number };
      const card = { ...track, streams: data.streams };
      const nextSum = total + data.streams;
      setRevealed((previous) => ({ ...previous, [track.id]: card }));
      if (nextSum > board.targetStreams && shield) {
        setBurned((previous) => [...previous, track.id]);
        setShield(false);
        setMessage(`${track.title} went over. Your shield absorbed it; that track is burned and your score stays at ${formatStreams(total)}.`);
      } else if (nextSum > board.targetStreams) {
        setPicked((previous) => [...previous, track.id]);
        await finish("bust", nextSum, [...picked, track.id]);
      } else {
        setPicked((previous) => [...previous, track.id]);
        setTotal(nextSum);
      }
    } catch {
      setMessage("Could not reveal that track. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function shareResult() {
    if (!board || !rank || !ended) return;
    const rows = board.tracks.map((track) => {
      if (burned.includes(track.id)) return "🔥";
      if (!picked.includes(track.id)) return "⬛";
      return finalReveal?.optimalHandIds.includes(track.id) ? "🟩" : "🟨";
    });
    const text = `Stream Blackjack #${board.puzzleNumber}\n${rank.badge} ${rank.title} · ${formatStreams(total)} / ${formatStreams(board.targetStreams)}\n${rows.slice(0, 3).join("")}\n${rows.slice(3, 6).join("")}\n${rows.slice(6, 9).join("")}\n🔥 ${streak} day streak`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Result copied to clipboard.");
    } catch {
      setMessage(text);
    }
  }

  if (!board) return <main className="loading">{message || "Dealing today’s board…"}</main>;

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">SB</span><span>STREAM BLACKJACK</span></div>
        <div className="daily-meta"><span>DAILY PUZZLE</span><strong>#{board.puzzleNumber}</strong><span className="divider" />🔥 {streak} day streak</div>
      </header>

      <section className="game-layout">
        <div className="board-column">
          <div className="heading-row">
            <div><p className="eyebrow">{board.date} · SAME BOARD FOR EVERYONE</p><h1>How close can you get?</h1></div>
            <div className="target"><span>TARGET</span><strong>{formatStreams(board.targetStreams)}</strong></div>
          </div>

          <section className="score-panel" aria-live="polite">
            <div className="score-topline"><span>CURRENT TOTAL</span><span>{finished ? "FINAL SCORE" : "HEADROOM"}</span></div>
            <div className="score-numbers"><strong>{formatStreams(total)}</strong><span>{finished ? `${Math.min(100, (total / board.targetStreams) * 100).toFixed(1)}%` : `${formatStreams(remaining)} left`}</span></div>
            <div className="progress-track" role="progressbar" aria-label="Streams toward target" aria-valuenow={Math.min(total, board.targetStreams)} aria-valuemin={0} aria-valuemax={board.targetStreams}>
              <div className={`progress-fill ${finished && ended === "bust" ? "is-bust" : ""}`} style={{ width: `${progress}%` }} />
              <span className="target-marker" />
            </div>
            <div className="score-foot"><span>0</span><span>{formatStreams(board.targetStreams)}</span></div>
          </section>

          <div className="grid-heading"><div><h2>Pick your next track</h2><p>{finished ? "Today’s cards are revealed" : "Every pick is a hit. Watch your headroom."}</p></div><div className="shield-status"><span className={shield ? "shield-on" : "shield-off"}>{shield ? "◇" : "×"}</span><span>{shield ? "BUST SHIELD READY" : "SHIELD USED"}</span></div></div>

          <div className="track-grid">
            {board.tracks.map((track, index) => {
              const isPicked = picked.includes(track.id);
              const isBurned = burned.includes(track.id);
              const isPlayable = !finished && !busy && !isPicked && !isBurned;
              const streams = revealed[track.id]?.streams ?? finalReveal?.tracks.find((item) => item.id === track.id)?.streams;
              const isOptimal = finalReveal?.optimalHandIds.includes(track.id) ?? false;
              return <button key={track.id} className={`track-card ${isPlayable ? "playable" : ""} ${isBurned ? "burned" : ""} ${isOptimal && finished ? "optimal" : ""} ${finished && isPicked && !isOptimal ? "selected" : ""}`} onClick={() => void hit(track)} disabled={!isPlayable} aria-label={`${track.title} by ${track.artist}${streams ? `, ${formatStreams(streams)} streams` : ""}`}>
                <div className="artwork">
                  {track.albumArtUrl ? <Image src={track.albumArtUrl} alt="" fill sizes="(max-width: 680px) 28vw, 67px" /> : <div className={`art-fallback art-${index % 6}`}><span>{track.title.slice(0, 1)}</span></div>}
                  <span className="track-number">{String(index + 1).padStart(2, "0")}</span>
                  {isBurned && <span className="burn-stamp">BURNED</span>}
                </div>
                <div className="track-copy"><strong title={track.title}>{track.title}</strong><span title={track.artist}>{track.artist}</span><small>{track.releaseYear}</small></div>
                <div className={`stream-value ${streams !== undefined ? "revealed-value" : ""}`}>{streams !== undefined ? formatStreams(streams) : "???"}<small>{streams !== undefined ? "STREAMS" : "HIDDEN"}</small></div>
              </button>;
            })}
          </div>

          {!finished && <div className="action-row"><p>{picked.length + burned.length === 0 ? "Choose any song to start your hand." : shield ? "Pick again, or stand and lock your score." : "Shield spent. Stand safely or try another track."}</p><button className="stand-button" onClick={() => void finish("stand", total)} disabled={busy}>Stand <span>→</span></button></div>}
          {message && <p className="message" role="status">{message}</p>}
        </div>

        <aside className="side-column">
          {finished && rank ? <section className="result-panel"><span className="eyebrow">HAND COMPLETE</span><div className="rank-badge">{rank.badge}</div><h2>{rank.title}</h2><p>{rank.label}</p><div className="result-total">{formatStreams(total)}<span>of {formatStreams(board.targetStreams)}</span></div><div className="result-divider" />{finalReveal ? <div className="optimal-box"><span className="eyebrow">TODAY’S OPTIMAL HAND</span><strong>{formatStreams(finalReveal.optimalSum)} <small>({((finalReveal.optimalSum / board.targetStreams) * 100).toFixed(1)}%)</small></strong><p>{finalReveal.optimalHandIds.map((id) => board.tracks.find((track) => track.id === id)?.title).filter(Boolean).join(" + ")}</p></div> : <p className="muted">Loading answer reveal…</p>}<button className="share-button" onClick={() => void shareResult()}>▣ <span>Share result</span></button></section> : <section className="side-panel"><span className="eyebrow">YOUR HAND</span><div className="hand-count">{picked.length}<span> / 9</span></div><p>tracks selected</p><div className="side-rule" /><div className="shield-rule"><span className={shield ? "shield-on" : "shield-off"}>◇</span><div><strong>{shield ? "One bust shield" : "Shield used"}</strong><p>{shield ? "A song over the cap burns and your total rolls back to safety." : "Your next over-cap pick ends the hand."}</p></div></div><div className="side-rule" /><div className="tier-list"><span className="eyebrow">RANKS</span><div><span>🃏</span><b>98%+</b><small>Blackjack</small></div><div><span>💿</span><b>90%+</b><small>Gold Record</small></div><div><span>📻</span><b>75%+</b><small>Charting</small></div><div><span>🛋️</span><b>&lt;75%</b><small>Soundcheck</small></div></div></section>}
          <section className="fine-print"><span>STREAM DATA</span><p>Daily totals are snapshots. Your puzzle is saved locally on this device.</p></section>
        </aside>
      </section>
      <footer><span>STREAM BLACKJACK</span><span>One board. One shot. Every day.</span></footer>
    </main>
  );
}