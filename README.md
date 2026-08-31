# 🎵 Artlist Asset Library & Automated Download Relay

A high-performance, automated music and sound effects licensing relay and shared asset library for Artlist. Designed to eliminate manual download friction, build a permanent team audio library, and operate with **effective zero ban risk** through authentic human-mimicry behavioral automation.

---

## 🌟 Key Features

* **🛡️ Dual Execution Engines:**
  * **Option A (Chrome Extension):** Lightweight MV3 extension running in your everyday Chrome profile.
  * **Option B (Native OS-Level Agent):** Python OS desktop agent using Windows UIAutomation (UIA) and Hardware input (`isTrusted: true`).
* **⚡ Instant Deduplication Cache (<50ms, 0 Quota):**
  * Once a track is downloaded, subsequent requests return the existing file path instantly with **zero quota spent**.
* **📦 Full Format Support:**
  * Master Lossless WAV music tracks.
  * Sound Effects (SFX) with size-adjusted verification.
  * Multi-Track Stems (`.ZIP` archives) with integrity check.
* **🔒 Two-Stage Atomic Delivery:**
  * Downloads to isolated staging/downloads directories.
  * Verifies 12-byte RIFF/WAVE or PKZip headers before atomically moving files into the shared studio library.
* **📊 Modern Web Dashboard:**
  * Search-first library explorer.
  * Real-time queue telemetry and daily safety quota tracking.

---

## 🚀 Quickstart Guide

### Option 1: Native OS-Level Agent Mode (Recommended for Dedicated Machines)

This mode controls Chrome via **real operating-system hardware clicks (`isTrusted: true`)** using Windows UIAutomation (`pywinauto`) and PyAutoGUI:

```bash
# 1. Install dependencies
pip install fastapi uvicorn pydantic pyautogui pywinauto

# 2. Run Relay with Native OS Agent
python run_relay.py --os-agent
```

* Open the dashboard at **`http://127.0.0.1:5000`** (or `http://<YOUR_IP>:5000` from any computer on the LAN).
* Paste any Music, SFX, or Stems link. The OS Agent will bring Chrome to the front, use UIA to locate the precise DOM element coordinates, click them with real hardware input, and deliver the asset to `library/`!

> [!WARNING]
> **Physical Desktop Required**: The OS Agent requires an active, unobstructed Windows desktop session. **Screensavers, lock screens, and minimized/disconnected RDP sessions will instantly break OS-level input injection and UIA traversal.** The agent will fail safely, but jobs will not process until the session is unlocked.

---

### Option 2: Chrome Extension Mode (Standard Web Worker)

```bash
# 1. Start Server
python run_relay.py

# 2. Load Extension in Chrome
# - Open chrome://extensions
# - Enable 'Developer mode'
# - Click 'Load unpacked' -> Select 'd:\Code\Artlist\extension'
```

---

## 📁 Directory Structure

```
Artlist/
├── backend/
│   ├── os_agent.py         # Native OS-Level Automation Agent (UIA + Hardware Input)
│   ├── config.py           # Configuration (Paths, Safe Quotas, Working Hours)
│   ├── database.py         # SQLite WAL mode & single-writer lock
│   ├── models.py           # Pydantic API & Telemetry schemas
│   ├── service.py          # Atomic file delivery, RIFF check & Cache
│   ├── main.py             # FastAPI REST endpoints
│   └── web/                # High-aesthetic dark mode Web UI
│       ├── index.html
│       ├── style.css
│       └── app.js
├── extension/              # Manifest V3 Chrome Extension
│   ├── manifest.json
│   ├── selectors.js        # Resilient Artlist DOM selector dictionary
│   ├── content.js          # Human-mimicry execution & mouse trajectory
│   └── background.js       # Alarms keepalive & chrome.downloads tracking
├── staging/                # Temporary download directory (watched by Agent)
├── library/                # Shared Artlist Library (synced to Drive/NAS)
├── run_relay.py            # Startup runner (supports --os-agent)
└── test_relay.py           # Automated unit & integration tests
```

---

## ⚙️ Configuration Options (`backend/config.py`)

| Setting | Default | Description |
| :--- | :--- | :--- |
| `DAILY_SAFETY_LIMIT` | `20` | Daily download ceiling to guarantee fair-use safety (Artlist limit is ~40). |
| `COOLDOWN_MIN_SECONDS` | `45` | Minimum randomized human delay between jobs. |
| `COOLDOWN_MAX_SECONDS` | `90` | Maximum randomized human delay between jobs. |
| `WORKING_HOURS_ENABLED` | `False` | When True, restricts worker processing to active studio hours. |
| `WORKING_HOURS_START` | `09:00` | Start of active working hours window. |
| `WORKING_HOURS_END` | `21:00` | End of active working hours window. |
