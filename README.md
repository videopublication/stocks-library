# 🌉 Setu (सेतु) • Creative Asset Bridge & Studio Sangraha

A high-performance, automated stock media bridge and shared asset library for **Artlist** and **Envato Elements**. Designed to eliminate manual download bottlenecks, build a permanent studio media archive (*Sangraha*), and operate securely with zero credential sharing and authentic human-mimicry behavioral automation.

---

## 🌟 Key Architecture

* **🤖 Native OS-Level Automation Agent:**
  * Uses real Windows operating system hardware input (`isTrusted: true`) and UIAutomation (UIA).
  * Requires **no Chrome extension, no developer mode, and no browser modifications**.
* **⚡ Instant Deduplication Cache (<50ms, 0 Quota):**
  * Once an asset is downloaded, subsequent requests return the existing file path instantly with **zero quota spent**.
* **📦 Full Format & Provider Support:**
  * Master Lossless WAV music tracks.
  * Sound Effects (SFX) with 1-click automatic capture.
  * Multi-Track Stems (`.ZIP` archives) with automated modal navigation.
  * Support for Artlist and Envato Elements.
* **🔒 Two-Stage Atomic Verification:**
  * Downloads to an isolated staging directory (`staging/`).
  * Verifies RIFF/WAVE or PKZip headers before atomically moving files into the shared studio library (`library/`).
* **📊 Modern Web Dashboard:**
  * Clean dark-mode library explorer with live search.
  * Real-time queue telemetry and daily safety quota tracking.

---

## 🚀 Quickstart Guide

### Running the Relay Host (Standalone Native OS Agent)

The service runs locally on a designated workstation with an active stock subscription:

```bash
# 1. Install dependencies
pip install fastapi uvicorn pydantic pyautogui pywinauto

# 2. Start Relay with Native OS Automation Agent
python run_relay.py --os-agent
```

* **Dashboard URL:** `http://127.0.0.1:5000` (or `http://<HOST_IP>:5000` across the local office network).
* **Usage:** Paste any track or SFX link into the dashboard. The agent will bring Chrome into focus, navigate to the asset, click download with organic human-like mouse trajectories, verify the file, and place it directly into `library/`!

---

## 📁 Directory Structure

```
Artlist/
├── backend/
│   ├── os_agent.py         # Native OS-Level Automation Engine (UIA + Hardware Input)
│   ├── vision.py           # Gemini Multimodal Vision UI Grounding Engine
│   ├── service.py          # Atomic file delivery, RIFF/ZIP checks, & deduplication cache
│   ├── database.py         # SQLite WAL schema & connection management
│   ├── config.py           # Configuration (Paths, Safe Quotas, Working Hours)
│   ├── models.py           # Pydantic schemas & telemetry models
│   ├── main.py             # FastAPI REST endpoints
│   ├── reset_queue.py      # Circuit breaker & maintenance reset script
│   └── web/                # Local Web Dashboard UI
│       ├── index.html
│       ├── style.css
│       └── app.js
├── staging/                # Temporary download directory (watched by Agent)
├── library/                # Shared Media Library (synced to Drive/NAS)
├── IT_Approval_Request_and_Security_Brief.md # Official IT Security Document
├── run_relay.py            # Startup runner (python run_relay.py --os-agent)
└── test_relay.py           # Automated unit & integration test suite (15/15 tests)
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
