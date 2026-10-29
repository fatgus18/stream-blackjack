# Stream Blackjack

A daily push-your-luck game. Everyone gets the same 3x3 track board and target. Track stream counts are returned only after a track is selected; the full answer and optimal hand are revealed after standing or busting.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The curated 33-track seed pool works without API credentials. Its stream totals are illustrative snapshots and should be refreshed before using this as a live public game.

## Rules

- Pick tracks to add their stream totals while staying at or below the daily target.
- The first over-cap pick is burned, consumes the bust shield, and does not change the safe total.
- A later over-cap pick ends the hand as a bust. Standing locks the current total.
- The answer screen reveals every count and the best 3-to-5 track hand.
- Ranks: Blackjack at 98%+, Gold Record at 90%+, Charting at 75%+, and Soundcheck below 75%.
- Streak and completed result data are stored in the browser's local storage.

## Refresh track data

Create a Spotify app in the Spotify developer dashboard, then set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in the environment. Optionally set `TRACK_LIMIT` (default `5000`). Run:

```bash
npm run import:tracks
```

The importer reads the Kworb all-time Spotify song table, extracts track IDs and stream totals, enriches metadata in Spotify batches of up to 50, and writes `data/tracks.json`. The daily generator consumes this file automatically if at least nine valid tracks were enriched; otherwise it falls back to the bundled seed pool. Spotify credentials are never sent to the browser.

Kworb and Spotify may change their markup, API access, rate limits, or terms. The importer fails rather than silently writing an empty dataset. Stream counts are snapshots, and no server-side persistence is configured: each day's board is deterministically generated from the current data pool.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```