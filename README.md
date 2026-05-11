# 📷 SecureCam — RTSP → HLS CCTV System

ระบบ CCTV monitoring ที่แปลง RTSP กล้อง IP ให้ดูผ่าน browser ได้ทันที  
รองรับ Yoosee, Hikvision, Dahua, ONVIF cameras

```
[IP Camera] ──RTSP──► [Node.js + FFmpeg] ──HLS──► [Chrome/Safari/Edge]
```

---

## ⚡ Quick Start

```bash
# 1. Clone
git clone https://github.com/<YOUR_USERNAME>/securecam.git
cd securecam

# 2. ติดตั้ง dependencies
npm install

# 3. ติดตั้ง FFmpeg (Mac)
brew install ffmpeg

# 4. รัน server
node server.js

# 5. เปิด browser
open http://localhost:3000
```

---

## 🔧 การติดตั้ง (Mac — ละเอียด)

### ขั้นตอนที่ 1 — ติดตั้ง Homebrew (ถ้ายังไม่มี)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### ขั้นตอนที่ 2 — ติดตั้ง FFmpeg + Node.js
```bash
brew install ffmpeg node

# ตรวจสอบ
ffmpeg -version     # ffmpeg version 7.x.x
node --version      # v20.x.x
```

### ขั้นตอนที่ 3 — Clone repo และติดตั้ง
```bash
git clone https://github.com/<YOUR_USERNAME>/securecam.git
cd securecam
npm install
```

### ขั้นตอนที่ 4 — รัน backend
```bash
node server.js
# หรือ dev mode (auto-reload)
node --watch server.js
```

เห็นแบบนี้ = สำเร็จ ✓
```
╔═══════════════════════════════════════╗
║  SecureCam Backend                   ║
║  http://localhost:3000               ║
╚═══════════════════════════════════════╝
```

### ขั้นตอนที่ 5 — เพิ่มกล้อง
เปิด `http://localhost:3000` → คลิก **+** → ใส่ RTSP URL → **ADD CAMERA**

---

## 🔒 ความปลอดภัยก่อน Push ขึ้น GitHub

> ⚠️ **สำคัญมาก** — ไฟล์เหล่านี้ถูก `.gitignore` ห้าม commit แล้ว:

| ไฟล์ | เหตุผล |
|------|--------|
| `cameras.json` | มี RTSP URL + **password กล้อง** |
| `.env` | มี secret keys |
| `hls/` | ไฟล์ video ขนาดใหญ่ |
| `node_modules/` | ไม่จำเป็นต้อง push |

ตรวจสอบก่อน push:
```bash
git status
# ต้องไม่เห็น cameras.json ใน list
```

---

## 🚀 วิธี Push ขึ้น GitHub (ครั้งแรก)

### วิธีที่ 1 — สร้าง repo ใหม่ผ่าน GitHub CLI (แนะนำ)

```bash
# ติดตั้ง GitHub CLI
brew install gh

# Login
gh auth login
# → เลือก GitHub.com → HTTPS → Login with a web browser

# สร้าง repo และ push ในขั้นตอนเดียว
cd securecam
git init
git add .
git commit -m "feat: SecureCam RTSP→HLS CCTV system"
gh repo create securecam --public --source=. --remote=origin --push
```

เสร็จแล้วจะได้ URL ประมาณ:
```
https://github.com/<YOUR_USERNAME>/securecam
```

---

### วิธีที่ 2 — สร้าง repo บน github.com แล้ว push

**ขั้นตอน A — สร้าง repo บน GitHub:**
1. ไปที่ https://github.com/new
2. Repository name: `securecam`
3. เลือก **Public** หรือ **Private**
4. **ไม่ต้อง** เลือก "Add README" (เรามีอยู่แล้ว)
5. กด **Create repository**

**ขั้นตอน B — Push จาก Terminal:**
```bash
cd securecam

# Init git
git init
git branch -M main

# เพิ่มไฟล์ทั้งหมด (cameras.json จะถูก ignore อัตโนมัติ)
git add .

# ตรวจสอบว่าไม่มี cameras.json ก่อน commit!
git status
# ควรเห็นแค่: index.html, server.js, package.json, .gitignore, .env.example, README.md

# Commit
git commit -m "feat: SecureCam RTSP→HLS CCTV system"

# เชื่อมกับ GitHub (แทนที่ <YOUR_USERNAME> ด้วย username จริง)
git remote add origin https://github.com/<YOUR_USERNAME>/securecam.git

# Push
git push -u origin main
```

---

## 💻 ให้เครื่องอื่น Clone และรัน

เครื่องอื่น (Mac/Linux/Windows):

```bash
# 1. Clone
git clone https://github.com/<YOUR_USERNAME>/securecam.git
cd securecam

# 2. ติดตั้ง (ต้องมี Node.js และ FFmpeg ในเครื่องนั้น)
npm install

# 3. รัน
node server.js

# 4. เปิด browser
open http://localhost:3000

# 5. เพิ่มกล้องด้วย RTSP URL ของกล้องในเครือข่ายนั้น
```

> 💡 แต่ละเครื่องต้องเพิ่มกล้องใหม่ เพราะ `cameras.json` ไม่ได้ push ขึ้น GitHub (ปลอดภัย)

---

## 🌐 ให้คนอื่นเข้าดูจาก internet (Optional)

### ตัวเลือก 1 — ngrok (ง่ายสุด ทดสอบเร็ว)
```bash
# ติดตั้ง
brew install ngrok

# รัน server ก่อน
node server.js

# แล้ว tunnel
ngrok http 3000
# จะได้ URL เช่น: https://abc123.ngrok-free.app
```
แชร์ URL นั้นให้คนอื่นเปิดได้เลย (ฟรี แต่ URL เปลี่ยนทุกครั้ง)

### ตัวเลือก 2 — Cloudflare Tunnel (ฟรี ถาวร)
```bash
# ติดตั้ง cloudflared
brew install cloudflare/cloudflare/cloudflared

# Login
cloudflared tunnel login

# สร้าง tunnel ถาวร
cloudflared tunnel create securecam
cloudflared tunnel route dns securecam cam.yourdomain.com
cloudflared tunnel run securecam
```

### ตัวเลือก 3 — Render.com / Railway (cloud hosting)
Deploy backend ขึ้น cloud ฟรี — แต่ต้องการ IP กล้องที่ public accessible

---

## 📡 API Reference

```
GET    /api/health              → สถานะ server
GET    /api/streams             → รายการ stream ทั้งหมด (ไม่มี credentials)
POST   /api/streams             → เพิ่ม RTSP stream { name, rtspUrl }
GET    /api/streams/:id         → สถานะ stream เดียว
POST   /api/streams/:id/start   → เริ่ม stream
POST   /api/streams/:id/stop    → หยุด stream
DELETE /api/streams/:id         → ลบ stream + ไฟล์
GET    /hls/:hlsId/stream.m3u8  → HLS playlist
```

---

## 🛠 Requirements

| Software | Version | ติดตั้ง |
|----------|---------|---------|
| Node.js | ≥ 18 | `brew install node` |
| FFmpeg | ≥ 5 | `brew install ffmpeg` |
| Browser | Chrome/Edge/Safari | — |

---

## 📁 โครงสร้างโปรเจกต์

```
securecam/
├── index.html        ← Web UI (HLS.js player, RTSP manager)
├── server.js         ← Express + FFmpeg spawner + auto-reconnect
├── package.json      ← dependencies
├── .env.example      ← template สำหรับ environment variables
├── .gitignore        ← ห้าม commit cameras.json, hls/, node_modules/
├── README.md         ← ไฟล์นี้
│
│   [สร้างอัตโนมัติ — ไม่อยู่ใน git]
├── cameras.json      ← บันทึกกล้อง (มี RTSP URL)
├── hls/              ← HLS segments ที่ FFmpeg สร้าง
└── node_modules/     ← npm packages
```

---

## 🔄 อัปเดต repo หลังแก้ไข

```bash
git add .
git commit -m "fix: แก้ไข..."
git push
```

เครื่องอื่น pull อัปเดต:
```bash
git pull
# restart server
```

---

## License

MIT © 2025
