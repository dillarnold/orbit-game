// Orbit — realtime multiplayer backend for Cloudflare Workers + Durable Objects
//
// One Durable Object instance ("main") holds the authoritative game room:
// every connected player, the current orb position, and everyone's score.
// Clients connect over WebSocket at /ws and get broadcast updates.

const WORLD_W = 900;
const WORLD_H = 560;
const RADIUS = 16;

function randomOrb() {
  return {
    x: RADIUS * 2 + Math.random() * (WORLD_W - RADIUS * 4),
    y: RADIUS * 2 + Math.random() * (WORLD_H - RADIUS * 4),
  };
}

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.sessions = new Map(); // WebSocket -> playerId
    this.players = {};         // playerId -> {x,y,name,color,score}
    this.orb = randomOrb();
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 400 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  handleSession(ws) {
    ws.accept();
    const id = crypto.randomUUID().slice(0, 8);

    ws.addEventListener("message", (msg) => {
      let data;
      try {
        data = JSON.parse(msg.data);
      } catch (e) {
        return;
      }

      if (data.type === "join") {
        const name = String(data.name || "Player").slice(0, 20);
        const color = /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : "#62e0c4";
        this.players[id] = {
          x: clamp(data.x, RADIUS, WORLD_W - RADIUS),
          y: clamp(data.y, RADIUS, WORLD_H - RADIUS),
          name,
          color,
          score: 0,
        };
        this.sessions.set(ws, id);
        ws.send(JSON.stringify({
          type: "init",
          id,
          world: { w: WORLD_W, h: WORLD_H },
          players: this.players,
          orb: this.orb,
        }));
        this.broadcast({ type: "join", id, player: this.players[id] }, ws);
      } else if (data.type === "move") {
        const p = this.players[id];
        if (!p) return;
        p.x = clamp(data.x, RADIUS, WORLD_W - RADIUS);
        p.y = clamp(data.y, RADIUS, WORLD_H - RADIUS);
        this.broadcast({ type: "move", id, x: p.x, y: p.y }, ws);
      } else if (data.type === "grab") {
        // Authoritative pickup: only accept if it matches the orb we currently have.
        if (Math.round(data.orbX) === Math.round(this.orb.x) &&
            Math.round(data.orbY) === Math.round(this.orb.y)) {
          const p = this.players[id];
          if (p) p.score += 1;
          this.orb = randomOrb();
          this.broadcast({
            type: "orb",
            orb: this.orb,
            scoreId: id,
            score: p ? p.score : 0,
          }, null); // null => send to everyone, including the sender
        }
      }
    });

    const cleanup = () => {
      const pid = this.sessions.get(ws);
      if (pid) {
        delete this.players[pid];
        this.sessions.delete(ws);
        this.broadcast({ type: "leave", id: pid }, ws);
      }
    };
    ws.addEventListener("close", cleanup);
    ws.addEventListener("error", cleanup);
  }

  broadcast(message, exclude) {
    const str = JSON.stringify(message);
    for (const ws of this.sessions.keys()) {
      if (ws === exclude) continue;
      try {
        ws.send(str);
      } catch (e) {
        // dead socket, ignore — close handler will clean it up
      }
    }
  }
}

function clamp(n, min, max) {
  n = Number(n);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const id = env.GAME_ROOM.idFromName("main"); // one shared room for everyone
      const room = env.GAME_ROOM.get(id);
      return room.fetch(request);
    }

    // everything else is served from the public/ folder (static assets)
    return env.ASSETS.fetch(request);
  },
};
