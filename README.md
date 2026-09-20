# Seep — classy multiplayer card table

A web-based implementation of **Seep** (100-point North Indian / Baazi rules, as
documented on [pagat.com](https://www.pagat.com/fishing/seep.html)): fixed 2v2
partnerships, house building/cementing/breaking, sweeps, and Baazi scoring.

- Real-time multiplayer over Socket.IO, 4 seats, shareable room links.
- Any empty seat (or a seat that disconnects mid-game) can be filled by a bot,
  with **low / medium / high** difficulty.
- Dark, felt-table UI with Framer Motion animations and a quality toggle
  (Auto / High quality / Light) that adapts to the device.
- Three self-drawn SVG card skins (no external asset dependency).
- Optional Supabase persistence: profiles, finished games, and badges.

## Project layout

```
server/   Node + TypeScript + Socket.IO game server (rules engine, bots, rooms)
client/   React + TypeScript + Vite front end
```

## Rules engine

The rules live entirely in `server/src/game/` and are transport-agnostic:

- `types.ts` — card/house/game-state types
- `rules.ts` — capture-partition and house build/cement/break option finders
- `engine.ts` — the state machine (deal, bid, play, sweeps, scoring, Baazi/dealer rotation)
- `bots.ts` — low/medium/high bot heuristics

Run `npm run test:engine` inside `server/` to simulate 25 full games with bots
of every difficulty and assert card-count invariants hold throughout (deal,
bid, capture, build, sweep, scoring).

## Running locally

### Server

```bash
cd server
cp .env.example .env   # fill in Supabase keys if you want persistence
npm install
npm run dev             # http://localhost:8787
```

### Client

```bash
cd client
cp .env.example .env    # set VITE_SERVER_URL, and Supabase keys if desired
npm install
npm run dev              # http://localhost:5173
```

Open the client URL, create a room, share the link (or room code) with other
players, and fill any remaining seats with bots before starting.

## Optional: Supabase persistence

1. Create a free project at [supabase.com](https://supabase.com).
2. Run `server/supabase/schema.sql` in the Supabase SQL editor.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `server/.env`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `client/.env` if you
   want the client to read profile summaries directly.

Without these variables the app runs exactly the same — persistence is
skipped and a warning is logged once.

## Deploying

- **Server**: any Node host that keeps a persistent process (Socket.IO needs
  a long-lived connection) — e.g. Render, Railway, Fly.io. Set `PORT` and
  `CLIENT_ORIGIN` to your deployed client's origin.
- **Client**: any static host (Vercel, Netlify, Cloudflare Pages) — `npm run
  build` in `client/` produces a static `dist/` folder. Set `VITE_SERVER_URL`
  to your deployed server's URL at build time.
