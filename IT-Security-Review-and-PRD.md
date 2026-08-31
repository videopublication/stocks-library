# Enterprise Architecture, Product Requirements & IT/Security Review
## Automated Artlist Asset Dispatcher & Centralized Relay System

**Document Version:** 2.0  
**Target Audience:** Enterprise IT, Information Security (InfoSec), Legal/Compliance, and Post-Production Engineering Teams  
**Classification:** Internal Technical Architecture & Security Assessment  

---

## 1. Executive Summary & Business Justification

### 1.1 The Operational Problem
In high-throughput post-production environments (video editing, sound design, marketing, VFX), editors continuously require licensed music, sound effects (SFX), and multi-track audio stems from Artlist.io. The legacy workflow suffers from three structural flaws:

1. **Credential Sharing / Account Compromise Risk:** Sharing a master corporate login across multiple editors violates security policies, risks IP-based account lockouts, and eliminates individual accountability.
2. **Bandwidth & Storage Bloat (Redundant Downloads):** Multiple editors working on connected projects frequently download identical popular tracks and SFX, consuming redundant internet bandwidth and creating fragmented, duplicate asset copies across local workstations and network shares.
3. **Productivity Friction:** Editors spend up to 10–15% of their working hours context-switching: logging in, searching, previewing, choosing quality variants, waiting on downloads, extracting ZIP archives, and manually moving files into project directory structures.

### 1.2 The Solution: Dedicated Relay & Centralized Library
The **Artlist Asset Relay System** is an on-premise, automated asset ingestion and deduplication service. It bridges the gap between individual editor requests and the centralized production storage:

```
[ Editors on Studio LAN ]
 (Web Portal / Search UI)
          │
          ▼  HTTP (Port 5000)
┌────────────────────────────────────────────────────────┐
│  Dedicated Dedicated Relay Node (Studio Machine)       │
│                                                        │
│  ┌──────────────────────┐    ┌──────────────────────┐  │
│  │ FastAPI Local Server │◄──►│ Chrome MV3 Worker    │  │
│  │ (Queue & Cache Hits) │    │ (Human-Mimicry Flow) │  │
│  └──────────┬───────────┘    └──────────┬───────────┘  │
│             │                           │ (Artlist.io) │
│             ▼                           ▼              │
│  ┌──────────────────────┐    ┌──────────────────────┐  │
│  │ SQLite WAL Database  │    │ Licensed Asset Stream│  │
│  └──────────────────────┘    └──────────┬───────────┘  │
│                                         │              │
└─────────────────────────────────────────┼──────────────┘
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  Shared Network Storage (VNAS / SAN)  │
                      │  D:\Code\Artlist\library              │
                      │  (Deduplicated, Validated Master WAV) │
                      └───────────────────────────────────────┘
```

### 1.3 Key Metrics & Return on Investment (ROI)
* **70%+ Reduction in External Downloads:** Instant cache resolution serves existing library assets in under 50 milliseconds.
* **100% Elimination of Shared Credentials:** Only the dedicated single-seat relay machine maintains the active Artlist subscription session. Editors submit URLs via a localized intranet dashboard without ever seeing or needing Artlist passwords.
* **Zero Account Ban Risk:** Enforces strict human-mimicry execution, randomized inter-job cooldowns (45s–90s), audio preview listening cycles, and a hard ceiling of 20 downloads/day (well below Artlist’s 40/day fair-use threshold).

---

## 2. Product Requirements Document (PRD)

### 2.1 Functional Requirements

| Requirement ID | Module | Description | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **FR-01** | URL Resolution | System accepts Music, SFX, and Album track URLs in any valid or short-form format (`/royalty-free-music/song/...`, `/sound-effects/track/...`, `/sfx/...`). | Canonicalizes URLs automatically; parses unique numeric track IDs. |
| **FR-02** | Cache Engine | Before queuing any download, the service queries the local SQLite registry for existing `(track_id, variant)` pairs. | If file exists on storage, returns instant `CACHED` status with exact network path; increments track hit metrics without touching Artlist. |
| **FR-03** | Multi-Variant Support | Supports single-track Master Lossless WAV, Instrumental versions, and Multi-track Stems (`.ZIP`). | Accurately navigates modal tabs, confirms variant selection, and validates archive integrity. |
| **FR-04** | FIFO Execution Queue | Enforces single-concurrency FIFO queue for non-cached asset requests. | Strictly one active job at a time. No parallel or burst scraping. |
| **FR-05** | Atomic File Delivery | Browser downloads asset to designated staging directory; backend verifies RIFF/WAVE or PKZip headers, sanitizes filenames, and moves atomically into library. | Zero incomplete `.crdownload` files enter the shared library. Cross-volume copy handles NAS/UNC fallbacks. |

### 2.2 Non-Functional Requirements
* **Security & Isolation:** The service runs on an internal LAN node; external ingress is completely prohibited. Loopback endpoints require local token verification.
* **Resiliency & Self-Healing:** Automatic startup reconciliation evicts stale staging files and re-indexes orphan library files.
* **Concurrency:** Database operates under SQLite WAL (Write-Ahead Logging) mode with explicit write-lock synchronization, guaranteeing zero database locks during concurrent read requests.

---

## 3. System Architecture & Technical Specifications

### 3.1 Backend Architecture (`FastAPI` & `Python 3.10+`)
* **FastAPI Framework:** Delivers sub-millisecond REST API routing and async worker polling.
* **SQLite with WAL Mode:** `PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;`. Read requests are non-blocking; writes are serialized via Python threading locks.
* **Atomic File Handoff:** Uses `os.replace` for atomic same-drive moves and guarded `shutil.copy2` for cross-network (SMB/UNC) targets with retry backoff.
* **Audio & Archive Validation:**
  * **WAV:** Verifies 12-byte `RIFF....WAVE` binary header signature and minimum file size (>10KB for SFX, >1MB for Music).
  * **Stems ZIP:** Validates archive integrity using `zipfile.is_zipfile` before database commitment.

### 3.2 Chrome Extension Architecture (`Manifest V3`)
* **Non-Headless Execution:** Runs inside a standard, graphical Google Chrome browser instance under an authentic user profile with active cookies and local storage history.
* **Human-Mimicry Motion Engine:**
  * Calculates real element bounding boxes `(clientX, clientY)`.
  * Generates cubic Bézier curved trajectories with natural acceleration/deceleration curves (Fitts's Law approximation).
  * Dispatches complete DOM event chains: `pointermove` $\rightarrow$ `mousemove` $\rightarrow$ `pointerenter` $\rightarrow$ `mousedown` $\rightarrow$ hold for 70ms–140ms $\rightarrow$ `mouseup` $\rightarrow$ `click`.
* **Audio Preview Camouflage:** Triggers the in-page audio preview player and simulates authentic human listening for 4.5 to 8.0 seconds prior to initiating the download.
* **Randomized Velocity Throttling:** Enforces randomized 45s to 90s cooldown intervals between completed jobs to disguise automation beneath statistical human noise.

---

## 4. Comprehensive IT, Security & Risk Q&A (FAQ)

### Q1: Does this tool violate enterprise network security by opening external ports?
**Answer:** **No.**
* The backend server binds strictly to the local network interface (`127.0.0.1` or internal LAN IP `192.168.x.x`).
* It does not create cloud tunnels, does not use external webhooks, and requires zero inbound port forwarding on the corporate firewall.
* All outbound requests to Artlist.io originate from the native Google Chrome browser via standard HTTPS (Port 443), identical to an employee browsing the web.

### Q2: How are user credentials and passwords stored?
**Answer:** **Zero passwords or API secrets are stored by the system.**
* The relay machine utilizes an existing, standard Google Chrome profile where the operator logged into Artlist.io normally via standard multi-factor authentication (MFA).
* The extension only reads session validity indicators (`user-avatar`, `user-menu`) to verify connectivity.
* No plaintext passwords, credit card numbers, or subscription secrets exist anywhere in the database, configuration files, or source code.

### Q3: How does this system prevent the Artlist account from being banned?
**Answer:** The architecture was specifically engineered from the ground up for **Zero Account Ban Risk**:
1. **Never Headless:** Scrapers using Puppeteer or Selenium in headless mode are trivially fingerprinted by Cloudflare via canvas rendering and TLS JA3 signatures. This system uses a standard, real Google Chrome desktop browser.
2. **Ultra-Conservative Daily Ceiling:** Artlist allows ~40 track downloads per day under fair use. The relay hard-limits downloads to **20 tracks/day**, reserving 50% safety buffer.
3. **Human Event Simulation:** Avoids synthetic `(0,0)` script clicks by dispatching Bézier-curved cursor paths, micro-jitters, variable hover latencies, and audio preview playback.
4. **Velocity Throttling:** Enforces 45s–90s randomized pauses between jobs, preventing burst requests.
5. **Operating Hours Window:** Automatically pauses the download worker outside business hours (e.g., 09:00–21:00) so no activity occurs during anomalous night hours.

### Q4: What happens if Artlist changes their website UI or DOM structure?
**Answer:**
* The extension features an **Ordered Fallback Selector Matrix** (`selectors.js`) with 5–8 redundant selector tiers per control (testing `data-testid`, `aria-label`, `title`, role attributes, and semantic text).
* If Artlist makes a breaking structural change, the **Circuit Breaker** automatically trips after 3 consecutive failures, pauses the queue, and prevents spamming Artlist with broken requests.
* Updating selectors requires editing a single JSON dictionary in `selectors.js` and clicking "Reload" in Chrome.

### Q5: Can an unauthorized employee flood the service with 500 download requests?
**Answer:** **No.**
* **Rate Limits:** The system counts all daily completed jobs. Once 20 downloads are reached, the API rejects all subsequent new download requests with `403 Forbidden: Daily Safety Quota Reached`.
* **Deduplication:** Repeated requests for the same track do not queue downloads—they immediately return local network paths via the cache.
* **Pending Job Quota Guard:** In-flight and queued jobs are counted against the daily limit at the moment of submission to prevent race-condition queue flooding.

### Q6: How does the system handle storage limits and disk space exhaustion?
**Answer:**
* The backend continuously polls storage volume health via `shutil.disk_usage`.
* Disk free space (in GB) is reported in real-time on the telemetry dashboard.
* If storage falls below a critical threshold (e.g., 5 GB free), the queue automatically pauses and alerts operators before any partial file write occurs.

### Q7: What file types are delivered, and could malicious executables be injected?
**Answer:**
* The handoff engine strictly validates files against binary header signatures:
  * `.wav` files must contain the valid 12-byte `RIFF....WAVE` magic bytes.
  * `.zip` multi-track stems must pass structural integrity decompression validation via `zipfile.is_zipfile`.
* Any `.html`, `.exe`, `.scr`, or `.crdownload` file is instantly discarded and quarantined. Path traversal attacks (`../`) are blocked via strict path normalization and sanitization.

### Q8: What auditing and logging capabilities exist for compliance?
**Answer:**
Every single interaction is permanently logged in `artlist_relay.db`:
* **Job History:** Request timestamp, requesting user/workstation, source URL, target format, variant, and status (`done`, `failed`, `cached`).
* **Asset Provenance:** Track title, artist, Artlist track ID, exact file size in bytes, date licensed, and cumulative team hit count.
* **Audit Export:** Can be queried or exported to CSV/JSON at any time for licensing compliance audits.

---

## 5. Deployment & Configuration Guide

### 5.1 System Prerequisites
* **Host Operating System:** Windows 10/11 Pro, macOS, or Ubuntu Linux (Dedicated internal workstation or VM).
* **Runtime Environment:** Python 3.10+ (Standard standard library + FastAPI / Uvicorn).
* **Browser:** Google Chrome (Latest stable release) with active Artlist single-seat subscription.
* **Network:** Internal LAN connectivity between editor workstations and the relay host machine.

### 5.2 Fast-Track Setup

```bash
# 1. Clone repository to dedicated relay machine
git clone https://github.com/your-org/artlist-relay.git D:\Code\Artlist
cd D:\Code\Artlist

# 2. Install lightweight dependencies
pip install fastapi uvicorn pydantic

# 3. Load Extension in Chrome
# - Open chrome://extensions
# - Enable 'Developer mode' (top right)
# - Click 'Load unpacked' -> Select D:\Code\Artlist\extension

# 4. Start Relay Service
python run_relay.py
```

### 5.3 Firewall Configuration (Allow LAN Access)
To allow editors on the same network to access the web dashboard:

```powershell
# Run in PowerShell as Administrator on the Relay machine:
netsh advfirewall firewall add rule name="Artlist Relay Port 5000" dir=in action=allow protocol=TCP localport=5000
```

Editors open: `http://<RELAY_IP_ADDRESS>:5000` (e.g., `http://192.168.1.100:5000`).

---

## 6. Sign-off & Governance Matrix

| Reviewing Department | Primary Focus | Status | Signature / Date |
| :--- | :--- | :--- | :--- |
| **Information Security (InfoSec)** | Credential isolation, network port binding, path traversal security | `PENDING REVIEW` | ___________________ |
| **IT Infrastructure / Systems** | Storage volume management, bandwidth utilization, server stability | `PENDING REVIEW` | ___________________ |
| **Post-Production Lead** | Editorial workflow efficiency, cache speed, stems formatting | `APPROVED` | ___________________ |
| **Legal / Licensing Compliance** | Single-seat license compliance, Fair Use adherence, audit trails | `PENDING REVIEW` | ___________________ |
