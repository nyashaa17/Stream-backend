const express = require('express');
const { allRooms, roomDetail } = require('./socolive');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Cache ────────────────────────────────────────────────────────────────────
const cache = new Map();
const TTL   = 2 * 60 * 1000; // 2 min — streams expire fast

function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }
function getCache(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > TTL) { cache.delete(key); return null; }
  return e.data;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Only include rooms that are currently live
function isLive(room) {
  // Status 1 or "live" means currently streaming
  // Adjust field name after checking /api/raw
  return room.status === 1 ||
         room.status === 'live' ||
         room.isLive === 1 ||
         room.living === 1 ||
         room.liveStatus === 1;
}

// Extract stream URL — update field name after checking /api/raw
function streamUrl(room) {
  return room.pullUrl   ||
         room.hlsUrl    ||
         room.streamUrl ||
         room.liveUrl   ||
         room.playUrl   ||
         room.url       ||
         null;
}

// Format for ZimKickoff — room ID used internally only
function format(room) {
  return {
    title:     room.title,
    streamUrl: streamUrl(room),
    viewCount: room.viewCount || 0,
    cover:     room.cover || room.cutOutCustomCoverUrl || null,
    hd:        room.hd === 2,
    anchor:    room.anchor?.nickName || null,
  };
}

// Fetch + filter live rooms (cached)
async function getLiveRooms() {
  const cached = getCache('live');
  if (cached) return cached;

  const data  = await allRooms();
  const rooms = data?.hot || data?.rooms || data?.data || [];

  // Filter to live only
  const live  = rooms.filter(isLive);

  setCache('live', { rooms, live });
  return { rooms, live };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/live
// All currently live rooms
app.get('/api/live', async (req, res) => {
  try {
    const { live } = await getLiveRooms();
    res.json({ count: live.length, rooms: live.map(format) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/streams?fixture=Iran+vs+New+Zealand
// GET /api/streams?team=Arsenal
// Exact title match (case-insensitive)
app.get('/api/streams', async (req, res) => {
  const query = (req.query.fixture || req.query.team || req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'Provide ?fixture= or ?team=' });

  try {
    const { live } = await getLiveRooms();
    const q = query.toLowerCase();

    const matches = live.filter(r =>
      r.title?.toLowerCase().includes(q)
    );

    if (!matches.length) {
      return res.status(404).json({ error: 'No live stream found', query });
    }

    res.json({ query, count: matches.length, rooms: matches.map(format) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/streams/:matchId
// Match by scheduleId/matchId from TotalSportsLive
// Room ID used internally — not exposed
app.get('/api/streams/:matchId', async (req, res) => {
  const { matchId } = req.params;
  const cacheKey    = `match_${matchId}`;
  const cached      = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const { live } = await getLiveRooms();

    // Match by scheduleId or matchId — room ID stays internal
    const room = live.find(r =>
      String(r.scheduleId) === matchId ||
      String(r.matchId)    === matchId
    );

    if (!room) {
      return res.status(404).json({
        error:   'No live stream for this match',
        matchId,
        tip:     'Try /api/streams?fixture=TeamA+vs+TeamB',
      });
    }

    // Fetch full room detail using internal room ID
    const detail     = await roomDetail(room.roomNum);
    const roomData   = detail?.data || detail?.room || detail;
    const result     = { matchId, ...format({ ...room, ...roomData }) };

    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/raw
// Raw Socolive response — check field names here
app.get('/api/raw', async (req, res) => {
  try {
    const data = await allRooms();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Health
app.get('/', (req, res) => res.json({
  service:   'ZimKickoff Streams API',
  version:   '5.0.0',
  status:    'ok',
  endpoints: [
    'GET /api/live',
    'GET /api/streams?fixture=Iran+vs+New+Zealand',
    'GET /api/streams?team=Arsenal',
    'GET /api/streams/:matchId',
    'GET /api/raw',
  ],
}));

app.listen(PORT, () => console.log(`ZimKickoff API on port ${PORT}`));
