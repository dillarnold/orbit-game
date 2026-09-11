# Orbit — self-hosted multiplayer game

A tiny realtime multiplayer game: everyone who opens the page gets a glowing
ball and races to grab a pulsing orb. Built to run entirely on Cloudflare's
free tier.

## How it works

- **`src/worker.js`** — a Cloudflare Worker with a Durable Object (`GameRoom`)
  that acts as the authoritative game server. Every player connects to it
  over a WebSocket; it tracks positions, scores, and the orb, and broadcasts
  updates to everyone.
- **`public/index.html`** — the game itself (canvas + JS), served as a static
  file by the same Worker.

One Worker gives you both the website and the realtime backend — no separate
server to manage.

## Deploy it (5 minutes)

You'll need [Node.js](https://nodejs.org) installed, and a free Cloudflare
account.

1. **Install dependencies**
   ```
   npm install
   ```

2. **Log in to Cloudflare**
   ```
   npx wrangler login
   ```
   This opens a browser tab to authorize wrangler (Cloudflare's CLI) with
   your account.

3. **Try it locally (optional)**
   ```
   npm run dev
   ```
   Opens the game at `http://localhost:8787`. Open it in two browser tabs to
   see the two balls sync.

4. **Deploy**
   ```
   npm run deploy
   ```
   Wrangler will print a URL like:
   ```
   https://orbit-game.YOUR-SUBDOMAIN.workers.dev
   ```
   That's it — send that URL to your friends. Everyone who opens it joins
   the same game.

## Using a custom domain

If you want it at `game.yoursite.com` instead of the `workers.dev` URL:

1. Add your domain to Cloudflare (if it isn't already) and make sure its
   nameservers point to Cloudflare.
2. In the Cloudflare dashboard, go to **Workers & Pages → orbit-game →
   Settings → Domains & Routes**, and add a custom domain. Cloudflare
   provisions the SSL certificate automatically.

## Hosting the HTML on a *different* site

If you'd rather keep the game page on your own existing site/CMS and only
use Cloudflare for the realtime backend:

1. Deploy just the Worker (steps 1–4 above still apply — the Worker serves
   `public/index.html` too, you just won't use that copy).
2. Copy `public/index.html` to wherever your site is hosted.
3. In that copy, replace this line near the top of the `<script>` tag:
   ```js
   const WS_URL = location.origin.replace(/^http/, "ws") + "/ws";
   ```
   with your deployed Worker's URL:
   ```js
   const WS_URL = "wss://orbit-game.YOUR-SUBDOMAIN.workers.dev/ws";
   ```
   Durable Objects/WebSockets work cross-origin by default, so this just
   works — no CORS setup needed for WebSocket connections.

## Costs

Cloudflare's free plan includes Workers and Durable Objects with generous
daily limits — this game (a handful of friends, occasional sessions) will
sit comfortably inside the free tier.

## Extending it

- **Multiple rooms**: currently everyone shares one room (`idFromName("main")`
  in `worker.js`). To support separate rooms, derive the Durable Object ID
  from a room code in the URL instead, e.g. `/ws?room=abc123` →
  `idFromName(roomCode)`.
- **Persistence across restarts**: Durable Objects reset their in-memory
  state if idle long enough. To persist scores/leaderboards, write to
  `this.state.storage` (the Durable Object's built-in key-value store).
- **Anti-cheat**: movement is currently trusted from the client (fine for
  playing with friends). For anything more adversarial, validate speed/
  position deltas server-side in the `move` handler.
