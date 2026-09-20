# Seepify — classy multiplayer Seep, online

Seepify is a web-based implementation of **Seep** (100-point North Indian / Baazi rules, as
documented on [pagat.com](https://www.pagat.com/fishing/seep.html)): fixed 2v2
partnerships, house building/cementing/breaking, sweeps, and Baazi scoring.

- **No backend server** — just a static site (Vercel) and Supabase. Real-time
  play happens over Supabase Realtime broadcast channels; the room host's
  browser runs the authoritative game engine and bot AI.
- 4 seats, shareable room links. Any empty seat (or one that disconnects
  mid-game) can be filled by a bot, with **low / medium / high** difficulty.
- Dark, felt-table UI with Framer Motion animations and a quality toggle
  (Auto / High quality / Light) that adapts to the device.
- Three self-drawn SVG card skins (no external asset dependency).
- Supabase persistence: profiles, finished games, and badges.

## Architecture: host-authoritative, serverless

There's no Node process running the game. Instead:

- The player who **creates** a room is the **host**. Their browser holds the
  single authoritative `GameState` (dealing, bidding, captures, house
  building, scoring, bot turns — all of it), exactly like a server would.
- Other players' browsers send their moves (bid / play / continue-deal) over
  a Supabase Realtime broadcast channel; the host validates and applies them
  with the same engine, then broadcasts the resulting state back down each
  player's private channel (so nobody sees anyone else's hand).
- Bot turns are just `setTimeout`s in the host's tab, same as a server would
  schedule them.

**The tradeoff**: the host's tab has to stay open for the game to keep
running. If they close it mid-game, play pauses until they reopen the same
room URL (a `?room=CODE` link). There's no host migration yet. For a casual
game among friends this is a fine trade for "no server to run or pay for."

## Project layout

```
client/    React + TypeScript + Vite front end (the whole app)
supabase/  SQL migration (run once in your Supabase project)
```

## Rules engine

The rules live in `client/src/game/engine/` and are transport-agnostic (no
DOM/browser APIs) — the same code runs in the host's browser tab and in a
plain Node test:

- `types.ts` — card/house/game-state types
- `rules.ts` — capture-partition and house build/cement/break option finders
- `engine.ts` — the state machine (deal, bid, play, sweeps, scoring, Baazi/dealer rotation)
- `bots.ts` — low/medium/high bot heuristics

Run `npm run test:engine` inside `client/` to simulate 25 full games with
bots of every difficulty and assert card-count invariants hold throughout
(deal, bid, capture, build, sweep, scoring).

## Running locally

```bash
cd client
cp .env.example .env    # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev              # http://localhost:5173
```

Supabase is required (not optional) since Realtime channels are how players
talk to each other at all. See below for the one-time setup.

Open the client URL, create a room, share the link (or room code) with other
players, and fill any remaining seats with bots before starting.

## Supabase setup (one-time)

1. Create a free project at [supabase.com](https://supabase.com).
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. In your Supabase project, make sure **Realtime** is enabled (it is by
   default on new projects) — Seepify uses Realtime *broadcast* channels,
   which don't require enabling replication on any table.
4. From Project Settings → API, copy the **Project URL** and **anon public**
   key into `client/.env` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

Note: because there's no server, the browser writes finished-game results
(scores, badges) directly to Supabase using the anon key. The schema's RLS
policies allow public inserts on the game-history tables accordingly — see
the comment at the top of `supabase/schema.sql`. There's nothing sensitive
stored (display names and scores only), which is why this is an acceptable
trust model here; don't reuse it as-is for data that needs to stay private.

## Deploying

- **Client (Vercel)**: import the repo, set the project root to `client/`,
  build command `npm run build`, output directory `dist`. Add
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.
- **Supabase**: nothing to deploy beyond running the migration — it's
  already a hosted service.

That's the whole deployment — no server to provision, scale, or pay for
separately.
