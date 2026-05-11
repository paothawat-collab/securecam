/**
 * SecureCam Backend — RTSP → HLS Transcoder
 * Node.js + FFmpeg
 *
 * ฟีเจอร์:
 *  - รับ RTSP URL จาก API
 *  - แปลงเป็น HLS (.m3u8 + .ts) ผ่าน FFmpeg
 *  - รองรับหลาย stream พร้อมกัน
 *  - Auto-reconnect เมื่อ stream หลุด
 *  - บันทึกข้อมูลกล้องลงไฟล์ cameras.json
 *  - ไม่ expose credentials ใน frontend
 */

'use strict';

// โหลด .env ถ้ามี (ไม่ error ถ้าไม่มีไฟล์)
try { require('dotenv').config(); } catch (_) {}

const express   = require('express');
const cors      = require('cors');
const fs        = require('fs');
const path      = require('path');
const { spawn } = require('child_process');
const http      = require('http');
const crypto    = require('crypto');

// ─── CONFIG ────────────────────────────────────────
const PORT       = process.env.PORT || 3000;
const HLS_DIR    = path.join(__dirname, 'hls');          // HLS output root
const CONFIG_FILE = path.join(__dirname, 'cameras.json'); // persistent config
const HLS_TIME   = 2;       // seconds per .ts segment
const HLS_LIST   = 6;       // number of segments in playlist
const RECONNECT_DELAY = 5000; // ms before reconnect attempt
const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';

// ─── STATE ─────────────────────────────────────────
// streams: Map<streamId, StreamState>
const streams = new Map();
// StreamState = {
//   id, name, rtspUrl (has creds), hlsId (public token, no creds),
//   process, status, lastError, reconnectTimer, startedAt, reconnectCount
// }

// ─── INIT ──────────────────────────────────────────
if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });

// Load saved cameras on startup
let savedCameras = [];
try {
  if (fs.existsSync(CONFIG_FILE)) {
    savedCameras = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    console.log(`[boot] โหลดกล้องที่บันทึกไว้ ${savedCameras.length} ตัว`);
  }
} catch (e) {
  console.warn('[boot] อ่าน cameras.json ไม่ได้:', e.message);
}

// ─── EXPRESS APP ───────────────────────────────────
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname)));

// Serve HLS segments — only if the stream directory exists
app.use('/hls', (req, res, next) => {
  // Prevent directory traversal
  const safe = path.normalize(req.path).replace(/^(\.\.(\/|\\|$))+/, '');
  const target = path.join(HLS_DIR, safe);
  if (!target.startsWith(HLS_DIR)) return res.status(403).json({ error: 'forbidden' });

  if (!fs.existsSync(target)) return res.status(404).json({ error: 'not found' });

  // Cache-control: playlists must not be cached, segments can be
  if (target.endsWith('.m3u8')) {
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  } else if (target.endsWith('.ts')) {
    res.setHeader('Cache-Control', 'max-age=60');
    res.setHeader('Content-Type', 'video/mp2t');
  }
  res.sendFile(target);
});

// ─── HELPERS ───────────────────────────────────────
function saveConfig() {
  const data = [...streams.values()].map(s => ({
    id:      s.id,
    name:    s.name,
    rtspUrl: s.rtspUrl,    // stored on server only, never sent to client
    hlsId:   s.hlsId,
  }));
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

function safeStreamInfo(s) {
  // Public-safe: never expose rtspUrl (contains password)
  return {
    id:             s.id,
    name:           s.name,
    hlsId:          s.hlsId,
    hlsUrl:         `/hls/${s.hlsId}/stream.m3u8`,
    status:         s.status,
    lastError:      s.lastError || null,
    startedAt:      s.startedAt,
    reconnectCount: s.reconnectCount,
  };
}

// ─── FFMPEG SPAWNER ────────────────────────────────
function startFFmpeg(s) {
  const outDir = path.join(HLS_DIR, s.hlsId);
  fs.mkdirSync(outDir, { recursive: true });

  // FFmpeg args: RTSP → HLS
  // -rtsp_transport tcp  — more reliable on LAN than UDP
  // -fflags nobuffer     — low latency
  // -flags low_delay     — low latency
  // -hls_time 2          — 2-second segments
  // -hls_list_size 6     — keep 6 segments in playlist
  // -hls_flags delete_segments+append_list  — clean up old .ts files
  const args = [
    '-loglevel', 'warning',
    '-rtsp_transport', 'tcp',
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-i', s.rtspUrl,
    '-c:v', 'copy',            // copy video stream (no re-encode = fast)
    '-c:a', 'aac',             // re-encode audio to AAC for browser compat
    '-b:a', '128k',
    '-f', 'hls',
    '-hls_time', String(HLS_TIME),
    '-hls_list_size', String(HLS_LIST),
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', path.join(outDir, 'seg%05d.ts'),
    path.join(outDir, 'stream.m3u8'),
  ];

  console.log(`[ffmpeg] กำลังเริ่ม stream "${s.name}" (${s.hlsId})`);
  const proc = spawn(FFMPEG_BIN, args);
  s.process = proc;
  s.status  = 'starting';
  s.startedAt = new Date().toISOString();

  // Mark online after first .m3u8 appears
  const m3u8Path = path.join(outDir, 'stream.m3u8');
  const checkOnline = setInterval(() => {
    if (fs.existsSync(m3u8Path)) {
      s.status = 'online';
      clearInterval(checkOnline);
      console.log(`[ffmpeg] "${s.name}" online ✓`);
    }
  }, 500);
  setTimeout(() => clearInterval(checkOnline), 30000); // give up after 30s

  proc.stderr.on('data', data => {
    const msg = data.toString().trim();
    if (msg) {
      // Only log non-trivial messages
      if (!/frame=\s*0/.test(msg)) {
        s.lastError = msg.slice(-300);
        console.log(`[ffmpeg:${s.name}]`, msg.slice(0, 120));
      }
    }
  });

  proc.on('exit', (code, signal) => {
    clearInterval(checkOnline);
    if (s.status === 'stopped') return; // intentional stop
    console.warn(`[ffmpeg] "${s.name}" exited (code=${code} signal=${signal}) — reconnecting in ${RECONNECT_DELAY/1000}s`);
    s.status = 'reconnecting';
    s.reconnectCount = (s.reconnectCount || 0) + 1;
    s.reconnectTimer = setTimeout(() => {
      if (s.status !== 'stopped') startFFmpeg(s);
    }, RECONNECT_DELAY);
  });

  proc.on('error', err => {
    if (err.code === 'ENOENT') {
      s.status = 'error';
      s.lastError = 'ไม่พบ ffmpeg — กรุณาติดตั้ง: brew install ffmpeg';
      console.error('[ffmpeg] ERROR: ไม่พบ ffmpeg binary!');
    }
  });
}

function stopFFmpeg(s) {
  s.status = 'stopped';
  if (s.reconnectTimer) { clearTimeout(s.reconnectTimer); s.reconnectTimer = null; }
  if (s.process) {
    try { s.process.kill('SIGTERM'); } catch(_) {}
    s.process = null;
  }
}

// ─── API ROUTES ────────────────────────────────────

// GET /api/streams — list all streams (no credentials)
app.get('/api/streams', (req, res) => {
  res.json([...streams.values()].map(safeStreamInfo));
});

// POST /api/streams — add new RTSP stream
// Body: { name, rtspUrl }
app.post('/api/streams', (req, res) => {
  const { name, rtspUrl } = req.body;

  if (!rtspUrl || !rtspUrl.startsWith('rtsp://')) {
    return res.status(400).json({ error: 'rtspUrl ต้องขึ้นต้นด้วย rtsp://' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'กรุณาใส่ชื่อกล้อง' });
  }

  const id    = 'cam_' + Date.now();
  const hlsId = crypto.randomBytes(8).toString('hex'); // opaque token

  const s = {
    id, name: name.trim(), rtspUrl,
    hlsId, process: null,
    status: 'starting', lastError: null,
    reconnectTimer: null, startedAt: null, reconnectCount: 0,
  };

  streams.set(id, s);
  saveConfig();
  startFFmpeg(s);

  res.status(201).json(safeStreamInfo(s));
});

// GET /api/streams/:id — single stream status
app.get('/api/streams/:id', (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'ไม่พบ stream' });
  res.json(safeStreamInfo(s));
});

// POST /api/streams/:id/start — (re)start stopped stream
app.post('/api/streams/:id/start', (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'ไม่พบ stream' });
  if (s.status !== 'stopped') return res.status(400).json({ error: 'stream ยังทำงานอยู่' });
  s.reconnectCount = 0;
  startFFmpeg(s);
  res.json(safeStreamInfo(s));
});

// POST /api/streams/:id/stop — stop stream
app.post('/api/streams/:id/stop', (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'ไม่พบ stream' });
  stopFFmpeg(s);
  res.json(safeStreamInfo(s));
});

// DELETE /api/streams/:id — remove stream permanently
app.delete('/api/streams/:id', (req, res) => {
  const s = streams.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'ไม่พบ stream' });
  stopFFmpeg(s);
  streams.delete(req.params.id);
  // Clean up HLS files
  const outDir = path.join(HLS_DIR, s.hlsId);
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch(_) {}
  saveConfig();
  res.json({ ok: true });
});

// GET /api/health — health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    streams: streams.size,
    ffmpeg: FFMPEG_BIN,
    uptime: process.uptime(),
  });
});

// ─── START SERVER ──────────────────────────────────
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║  SecureCam Backend                   ║`);
  console.log(`║  http://localhost:${PORT}               ║`);
  console.log(`╚═══════════════════════════════════════╝\n`);

  // Auto-start saved cameras
  for (const cam of savedCameras) {
    if (!streams.has(cam.id)) {
      const s = {
        ...cam,
        process: null, status: 'starting',
        lastError: null, reconnectTimer: null,
        startedAt: null, reconnectCount: 0,
      };
      streams.set(cam.id, s);
      startFFmpeg(s);
      console.log(`[boot] เริ่ม stream อัตโนมัติ: "${cam.name}"`);
    }
  }
});

// ─── GRACEFUL SHUTDOWN ─────────────────────────────
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  console.log('\n[shutdown] กำลังหยุด streams ทั้งหมด...');
  for (const s of streams.values()) stopFFmpeg(s);
  server.close(() => { console.log('[shutdown] เสร็จสิ้น'); process.exit(0); });
}
