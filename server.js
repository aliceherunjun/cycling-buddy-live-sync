import http from "node:http";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadDotEnv(path.join(__dirname, ".env"));

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const publicBaseUrl = process.env.PUBLIC_BASE_URL || "";
const amapKey = process.env.AMAP_KEY || "";
const amapSecurityJsCode = process.env.AMAP_SECURITY_JS_CODE || "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".zip": "application/zip",
};

const runtimeConfigScript = `window.CYCLING_BUDDY_CONFIG = ${JSON.stringify({
  AMAP_KEY: amapKey,
  AMAP_SECURITY_JS_CODE: "",
  AMAP_PROXY_ENABLED: Boolean(amapKey && amapSecurityJsCode),
  PUBLIC_BASE_URL: publicBaseUrl,
})};\n`;

const roomDefaults = {
  title: "滨江绿道晨骑",
  distanceKm: 18.6,
  etaMinutes: 52,
};

const rooms = new Map();
const roomStreams = new Map();
const liveTtlMs = 15000;

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

function loadDotEnv(filePath) {
  try {
    const raw = fsSync.readFileSync(filePath, "utf8");
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((line) => {
        const eqIndex = line.indexOf("=");
        if (eqIndex === -1) return;
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        if (!key || process.env[key]) return;
        process.env[key] = value;
      });
  } catch {
    // .env is optional in local development.
  }
}

function proxyAmapService(req, res, pathname, searchParams) {
  if (!amapSecurityJsCode) {
    json(res, 503, { error: "AMap proxy is not configured" });
    return;
  }

  const targetPath = pathname.replace(/^\/_AMapService/, "") || "/";
  const upstreamQuery = new URLSearchParams(searchParams);
  upstreamQuery.set("jscode", amapSecurityJsCode);
  const upstreamPath = `${targetPath}?${upstreamQuery.toString()}`;

  const upstreamReq = https.request(
    {
      protocol: "https:",
      hostname: "restapi.amap.com",
      method: req.method,
      path: upstreamPath,
      headers: {
        Accept: req.headers.accept || "*/*",
        "User-Agent": req.headers["user-agent"] || "cycling-buddy-live-sync",
      },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, {
        "Content-Type": upstreamRes.headers["content-type"] || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      upstreamRes.pipe(res);
    },
  );

  upstreamReq.on("error", () => {
    json(res, 502, { error: "AMap upstream request failed" });
  });

  req.pipe(upstreamReq);
}

function normalizeRoomId(input) {
  return String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function buildRoom(roomId, seed = {}) {
  return {
    id: roomId,
    title: seed.title || roomDefaults.title,
    hostId: seed.hostId || null,
    demoEnabled: seed.demoEnabled ?? false,
    createdAt: Date.now(),
    participants: {},
  };
}

function getRoom(roomId, createIfMissing = false, seed = {}) {
  const normalized = normalizeRoomId(roomId);
  if (!normalized) return null;

  if (!rooms.has(normalized) && createIfMissing) {
    rooms.set(normalized, buildRoom(normalized, seed));
  }

  return rooms.get(normalized) || null;
}

function getLiveParticipants(room) {
  const now = Date.now();
  return Object.values(room.participants).filter(
    (participant) => participant.isBot || now - participant.lastSeen < liveTtlMs,
  );
}

function adoptHostIfNeeded(room) {
  const liveParticipants = getLiveParticipants(room)
    .filter((participant) => !participant.isBot)
    .sort((a, b) => b.lastSeen - a.lastSeen);
  if (!room.hostId || !room.participants[room.hostId]) {
    room.hostId = liveParticipants[0]?.id || null;
  }
}

function sanitizeRoom(room) {
  adoptHostIfNeeded(room);
  return {
    ...clone(room),
    participants: Object.fromEntries(
      getLiveParticipants(room)
        .sort((a, b) => b.progress - a.progress)
        .map((participant) => [participant.id, clone(participant)]),
    ),
  };
}

function broadcastRoom(roomId) {
  const room = getRoom(roomId);
  if (!room) return;

  const payload = JSON.stringify({
    type: "room",
    room: sanitizeRoom(room),
  });

  const streams = roomStreams.get(roomId);
  if (!streams) return;
  for (const res of streams) {
    res.write(`event: room\n`);
    res.write(`data: ${payload}\n\n`);
  }
}

function attachStream(roomId, res) {
  if (!roomStreams.has(roomId)) {
    roomStreams.set(roomId, new Set());
  }

  roomStreams.get(roomId).add(res);
  res.on("close", () => {
    const streams = roomStreams.get(roomId);
    if (!streams) return;
    streams.delete(res);
    if (!streams.size) {
      roomStreams.delete(roomId);
    }
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function serveStatic(req, res, pathname) {
  if (pathname === "/config.js") {
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(runtimeConfigScript);
    return;
  }

  const filePath = pathname === "/" ? path.join(__dirname, "index.html") : path.join(__dirname, pathname);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(__dirname)) {
    json(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const content = await fs.readFile(resolved);
    const ext = path.extname(resolved);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  } catch {
    json(res, 404, { error: "Not found" });
  }
}

function handleCreateRoom(req, res, body) {
  const requestedId = normalizeRoomId(body.roomId) || makeRoomCode();
  const room = getRoom(requestedId, true, {
    title: body.title,
    hostId: body.hostId || null,
    demoEnabled: body.demoEnabled ?? false,
  });
  json(res, 200, { room: sanitizeRoom(room) });
}

function handleGetRoom(req, res, roomId) {
  const room = getRoom(roomId, false);
  if (!room) {
    json(res, 404, { error: "Room not found" });
    return;
  }
  json(res, 200, { room: sanitizeRoom(room) });
}

function handleUpsertParticipant(req, res, roomId, body) {
  const room = getRoom(roomId, true, {
    hostId: body.participant?.id || null,
    demoEnabled: body.demoEnabled ?? false,
  });

  if (!body.participant?.id) {
    json(res, 400, { error: "participant.id is required" });
    return;
  }

  room.demoEnabled = body.demoEnabled ?? room.demoEnabled;
  room.participants[body.participant.id] = {
    ...room.participants[body.participant.id],
    ...body.participant,
    lastSeen: Date.now(),
    updatedAt: Date.now(),
  };

  if (!room.hostId || body.participant.isHost) {
    room.hostId = body.participant.id;
  }

  broadcastRoom(room.id);
  json(res, 200, { room: sanitizeRoom(room) });
}

function pruneRoomIfEmpty(roomId) {
  const room = getRoom(roomId, false);
  if (!room) return;

  const hasHumanParticipants = Object.values(room.participants).some((participant) => !participant.isBot);
  if (hasHumanParticipants) return;

  rooms.delete(roomId);
  const streams = roomStreams.get(roomId);
  if (streams) {
    for (const res of streams) {
      res.write(`event: room\n`);
      res.write(`data: ${JSON.stringify({ type: "room-closed", roomId })}\n\n`);
      res.end();
    }
    roomStreams.delete(roomId);
  }
}

function handleRemoveParticipant(req, res, roomId, participantId) {
  const room = getRoom(roomId, false);
  if (!room) {
    json(res, 404, { error: "Room not found" });
    return;
  }

  if (!participantId || !room.participants[participantId]) {
    json(res, 404, { error: "Participant not found" });
    return;
  }

  delete room.participants[participantId];
  adoptHostIfNeeded(room);
  broadcastRoom(room.id);
  pruneRoomIfEmpty(room.id);
  json(res, 200, { room: sanitizeRoom(room) });
}

function handleStream(req, res, roomId) {
  const room = getRoom(roomId, true);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(`event: room\n`);
  res.write(`data: ${JSON.stringify({ type: "room", room: sanitizeRoom(room) })}\n\n`);
  attachStream(room.id, res);
}

function routeApi(req, res, pathname, searchParams) {
  if (req.method === "GET" && pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      now: new Date().toISOString(),
      publicBaseUrl: publicBaseUrl || null,
      amap: {
        keyConfigured: Boolean(amapKey),
        proxyEnabled: Boolean(amapKey && amapSecurityJsCode),
      },
    });
    return true;
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)$/i);
  const participantMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/participants$/i);
  const participantItemMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/participants\/([^/]+)$/i);
  const streamMatch = pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/stream$/i);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return true;
  }

  if (req.method === "POST" && pathname === "/api/rooms") {
    readBody(req)
      .then((body) => handleCreateRoom(req, res, body))
      .catch(() => json(res, 400, { error: "Invalid JSON body" }));
    return true;
  }

  if (req.method === "GET" && roomMatch) {
    handleGetRoom(req, res, roomMatch[1]);
    return true;
  }

  if (req.method === "POST" && participantMatch) {
    readBody(req)
      .then((body) => handleUpsertParticipant(req, res, participantMatch[1], body))
      .catch(() => json(res, 400, { error: "Invalid JSON body" }));
    return true;
  }

  if (
    participantItemMatch &&
    (req.method === "DELETE" || (req.method === "POST" && searchParams.get("_method") === "DELETE"))
  ) {
    handleRemoveParticipant(req, res, participantItemMatch[1], decodeURIComponent(participantItemMatch[2]));
    return true;
  }

  if (req.method === "GET" && streamMatch) {
    handleStream(req, res, streamMatch[1]);
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith("/_AMapService/")) {
    proxyAmapService(req, res, pathname, url.searchParams);
    return;
  }

  if (pathname.startsWith("/api/")) {
    const handled = routeApi(req, res, pathname, url.searchParams);
    if (!handled) {
      json(res, 404, { error: "API not found" });
    }
    return;
  }

  await serveStatic(req, res, pathname);
});

server.listen(port, host, () => {
  console.log(`Cycling buddy server listening on http://${host}:${port}`);
});
