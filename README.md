# 🏛️ Stocks Library • Studio Media Archive & Automated Asset Bridge

**Stocks Library** is a high-performance, automated stock media bridge and shared asset library for **Artlist** and **Envato Elements**. 

It eliminates manual download bottlenecks for video editing teams, builds a permanent studio media archive, and operates with **zero credential sharing** using native OS hardware-level automation.

---

## 🌟 Key Features

* **🤖 Native OS Hardware Automation:**
  * Uses real Windows operating system hardware input (`isTrusted: true`) and UIAutomation (UIA).
  * Requires **no Chrome extension, no developer mode, and no browser modifications**.
* **⚡ Instant Deduplication Cache (<50ms, 0 Quota):**
  * When an asset is already in the library, requests return the existing file path instantly with **zero quota spent**.
* **📦 Multi-Stock Platform & Format Support:**
  * **Artlist**: Lossless WAV Music, SFX, and Multi-track Stems (`.ZIP`).
  * **Envato Elements**: Video Templates (Premiere Pro, After Effects, DaVinci Resolve), Stock Footage, Graphics & 3D, and Audio FX.
* **🔒 Two-Stage Atomic Verification:**
  * Downloads to an isolated staging directory (`staging/`).
  * Validates binary headers (RIFF/WAVE or PKZip) before atomically moving verified files into the shared studio library (`library/`).
* **📊 Professional Studio Dashboard:**
  * Clean dark-mode media explorer with instant search (`/` shortcut).
  * Direct 1-click **Copy Local Path** for Premiere Pro / DaVinci Resolve import.
  * In-browser audio streaming player with waveform controls.
  * Real-time pipeline tracking and daily safety quota monitoring.

---

## 💻 Dedicated Backend Host Laptop Setup Guide

Follow these steps to set up this machine as the dedicated backend download host.

### Step 1: System Requirements & Prerequisites
1. **Operating System**: Windows 10 / 11 (64-bit).
2. **Python**: Python 3.10, 3.11, or 3.12 ([Download from python.org](https://www.python.org/downloads/)).
   * *Make sure to check "Add Python to PATH" during installation.*
3. **Google Chrome**: Installed and logged in with your active **Artlist** and **Envato Elements** subscriptions.
4. **Git**: Installed ([Download from git-scm.com](https://git-scm.com/)).

---

### Step 2: Clone the Repository
Open PowerShell or Command Prompt on the backend laptop and run:

```bash
git clone https://github.com/videopublication/stocks-library.git
cd stocks-library
```

---

### Step 3: Install Python Dependencies
Create a virtual environment and install the required packages:

```bash
# Create virtual environment (optional but recommended)
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn pydantic pyautogui pywinauto pywin32 requests
```

---

### Step 4: Configure Chrome Download Settings (One-Time)
To ensure automated atomic file delivery works smoothly:
1. Open Google Chrome on the host laptop.
2. Go to `chrome://settings/downloads`.
3. Set the **Location** to your `staging` folder:
   * Example: `C:\Users\<Username>\stocks-library\staging`
4. **Turn OFF** the toggle for: *"Ask where to save each file before downloading"*.
5. Log into your **Artlist** and **Envato Elements** accounts in this Chrome browser.

---

### Step 5: Start the Stocks Library Backend Service
Run the relay with the native OS Automation Agent:

```bash
python run_relay.py --os-agent
```

You will see:
```text
======================================================================
 STOCKS LIBRARY • STUDIO MEDIA ARCHIVE & DOWNLOAD RELAY
======================================================================
 Staging directory : C:\Users\<Username>\stocks-library\staging
 Library directory : C:\Users\<Username>\stocks-library\library
 Database          : C:\Users\<Username>\stocks-library\artlist_relay.db
 Daily safe limit  : 20 downloads/day
 Bind address      : 127.0.0.1:5000
 OS-Agent Mode     : ENABLED (Hardware OS Input)
======================================================================
 Dashboard         : http://127.0.0.1:5000/
======================================================================
```

---

## 🌐 Allowing Other Studio Editors to Access Over Local Network (LAN)

If editors want to access the **Stocks Library** web dashboard from their own editing workstations:

1. In `backend/config.py`, change `HOST = "127.0.0.1"` to:
   ```python
   HOST = "0.0.0.0"
   ```
2. Find the local IP address of the host laptop (e.g. `192.168.1.150` via `ipconfig`).
3. Add a Windows Firewall rule to allow incoming TCP traffic on port `5000`:
   ```powershell
   netsh advfirewall firewall add rule name="Stocks Library" dir=in action=allow protocol=TCP localport=5000
   ```
4. Other editors on the studio Wi-Fi/LAN can now open:
   ```
   http://192.168.1.150:5000/
   ```
   They can paste stock links directly from their laptops, and the host machine will automatically perform the download and save it to the shared archive!

---

## 📁 Repository Structure

```
stocks-library/
├── backend/
│   ├── os_agent.py         # Native OS Automation Engine (UIA + Hardware Input)
│   ├── vision.py           # Gemini Multimodal Vision UI Grounding Fallback
│   ├── service.py          # Atomic delivery, RIFF/ZIP checks, & dedup cache
│   ├── database.py         # SQLite WAL schema & connection management
│   ├── config.py           # Configuration (Paths, Safe Quotas, Working Hours)
│   ├── models.py           # Pydantic schemas & telemetry models
│   ├── main.py             # FastAPI REST endpoints
│   ├── reset_queue.py      # Circuit breaker & maintenance reset script
│   ├── providers/          # Multi-Stock provider engine
│   │   ├── base.py
│   │   ├── artlist.py
│   │   └── envato.py
│   └── web/                # High-Ergonomics Studio Web Dashboard
│       ├── index.html
│       ├── style.css
│       └── app.js
├── staging/                # Temporary download directory (watched by Agent)
├── library/                # Shared Media Library (synced to Drive/NAS)
├── run_relay.py            # Startup runner (python run_relay.py --os-agent)
└── test_relay.py           # Test suite (41/41 passing unit & regression tests)
```

---

## 🧪 Testing & Verification

To verify that all components, deduplication caches, and provider parsers are working properly:

```bash
python -m unittest test_relay.py -v
```

All 41 unit tests should pass with `OK`.

---

## 🛡️ IT & Safety Parameters (`backend/config.py`)

| Parameter | Default | Purpose |
| :--- | :--- | :--- |
| `DAILY_SAFETY_LIMIT` | `20` | Daily download ceiling to protect account standing. |
| `COOLDOWN_MIN_SECONDS`| `45` | Minimum randomized delay between consecutive automated downloads. |
| `COOLDOWN_MAX_SECONDS`| `90` | Maximum randomized delay between consecutive automated downloads. |
| `CONSECUTIVE_FAILURES_LIMIT` | `3` | Circuit breaker trips and pauses queue if 3 failures occur in a row. |
| `WORKING_HOURS_ENABLED` | `False` | Optional schedule restricting downloads to business hours. |
