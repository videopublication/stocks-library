# Product Requirement Document (PRD)

**Project Name:** Internal Music Asset Dispatcher & Local Downloader Relay

**Document Version:** 1.1.0 (supersedes 1.0.0)

**Target Platform:** macOS (Dedicated Node) + Cross-Platform Client Interfaces

**Primary Objective:** Eliminate manual relay overhead for team audio licensing by automating link ingestion, serialized in-session browser execution, and shared cloud-drive directory delivery.

---

## 0. Changelog vs. 1.0.0

| # | Change | Reason |
| --- | --- | --- |
| C-1 | **Added Phase 0 gate** (seat/quota verification) before any build work. | v1.0 assumed single-account centralization is required. If the plan issues 5 seats, most of this project is unnecessary. Must be answered first. |
| C-2 | **Two-stage file delivery:** download to local staging dir, then single-pass copy into the Drive mount. | v1.0 downloaded directly into the Drive mount. Chrome writes `*.crdownload` then renames; Drive syncs the partial and the rename, producing truncated or duplicated files for editors. |
| C-3 | **Event-driven completion** via `chrome.downloads.onChanged` (`state === "complete"`). | v1.0 used a fixed 4.0s wait. WAV stems are 30-80MB; the fixed timer is a guess that fails on any slow response. |
| C-4 | **Reframed §2.1 and §3.3** from "0% bot-detection signature" to bounded request rate + real authenticated session. | MV3 content scripts cannot emit trusted events (`isTrusted === false`). The v1.0 claim was unsupportable, and the only MV3 route to trusted input is `chrome.debugger`, which v1.0 explicitly rejects. |
| C-5 | **Added track-level dedup cache.** | Two editors requesting the same track spent 2 of 35 daily slots. Cache hits now cost zero quota and return instantly. |
| C-6 | **Added job IDs, status endpoint, and returned filename.** | v1.0 was fire-and-forget; editors were never told what the file was called or whether it landed. The NFR promised editor notification with no mechanism behind it. |
| C-7 | **Added session health check and queue auto-pause.** | Chrome's Artlist session expires. v1.0 would fail every job into a 20s timeout, silently, forever. |
| C-8 | **SQLite mandated** (was "in-memory / SQLite"). | In-memory loses the queue *and* the daily counter on restart — and the counter is the quota guard. |
| C-9 | **Bearer-token auth** added on top of subnet restriction. | Subnet-only meant anyone on office wifi could drain the daily quota. The token also produces the per-request audit log §7 needs. |
| C-10 | **Latency KPIs recomputed and redefined.** | v1.0's sample response (`queue_position: 1, estimated_wait_seconds: 15`) was arithmetically impossible against its own timing spec, and the ≤60s end-to-end KPI was unreachable at any queue depth >1. |

---

## 1. Executive Summary & Problem Statement

### 1.1 Context

The video editing team operates under a consolidated 5-member team subscription on Artlist. Downloads are currently centralized on a single dedicated workstation.

> **Note (new in 1.1):** "Centralized for credential management" is an operational choice, not a platform constraint. Phase 0 exists to test whether it is still the right one.

### 1.2 Problem

The existing sequence introduces non-creative friction:

1. Editor finds a track on their personal workstation.
2. Editor walks to the dedicated workstation (or requests manual access).
3. Track is manually downloaded on the dedicated machine.
4. File is manually uploaded to Google Drive.
5. Editor returns to their workstation to pull the file into their NLE (Premiere Pro / DaVinci Resolve).

### 1.3 Solution

A local relay pipeline on the dedicated Mac:

* A local queue/job API (FastAPI) with SQLite-backed state, quota accounting, and a track cache.
* An unpacked private Chrome Extension (Manifest V3) that drives the download inside the existing authenticated session, strictly one job at a time.
* A **staging directory** for downloads, with the server performing a verified single-pass copy into the Google Drive for Desktop mount only after the download is fully complete.

```
┌──────────────────────────────────────────────────────────┐
│  Editor Workstations (x5)                                │
│  Web UI / Slack / Raycast / Apple Shortcut               │
└───────────────┬──────────────────────────────▲───────────┘
                │ POST /api/v1/jobs            │ job status
                │ (Bearer token)               │ + final filename
                ▼                              │
┌──────────────────────────────────────────────┴───────────┐
│  Dedicated Node (macOS)                                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Job Service (FastAPI / SQLite / Port 5000)         │  │
│  │ - FIFO queue, single in-flight job                 │  │
│  │ - Track cache (dedup, zero-quota hits)             │  │
│  │ - Daily counter, stale-claim reaper                │  │
│  └───────┬────────────────────────────────▲───────────┘  │
│          │ GET /worker/next (127.0.0.1)   │ downloaded / │
│          ▼                                │ failed       │
│  ┌───────────────────────────────────────┴────────────┐  │
│  │ Native Chrome Instance (Authenticated Session)     │  │
│  │ - MV3 Extension, background tab                    │  │
│  │ - Paced interaction delays                         │  │
│  │ - chrome.downloads.onChanged -> state "complete"   │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │ writes to                     │
│                          ▼                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │ STAGING DIR (local disk, NOT synced)               │  │
│  │ ~/ArtlistRelay/staging/                            │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │ server: verified single-pass  │
│                          │ copy, size check, then unlink │
│                          ▼                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Google Drive for Desktop (Virtual Path)            │  │
│  │ /Users/<User>/Library/CloudStorage/GoogleDrive-*   │  │
│  └───────────────────────┬────────────────────────────┘  │
└──────────────────────────┼───────────────────────────────┘
                           │ Cloud Sync
                           ▼
┌──────────────────────────────────────────────────────────┐
│  Editor Local Drives (availability in NLE)               │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Goals & Success Metrics

### 2.1 Primary Goals

* **Zero Walking Friction:** Replace the ~5-10 minute manual round trip with a fire-and-forget submission; the editor never leaves their workstation.
* **File Integrity:** Every file that appears in the shared Drive folder is complete and playable. No partial or `.crdownload` artifacts ever reach the shared drive.
* **Bounded, Well-Behaved Request Rate:** All traffic originates from a real, human-authenticated Chrome session on a licensed account, strictly serialized, capped well below the account's daily allowance.
* **Automated Asset Availability:** Files populate editors' Drive directories with no manual file moving, and the requesting editor is told the exact filename.

> **Removed from 1.0:** the "100% Account Safety / 0% bot-detection signature" goal. See §3.6 for why it was not achievable as specified and what replaces it.

### 2.2 Key Performance Indicators

| KPI | Target | Definition |
| --- | --- | --- |
| Download success rate | ≥ 98% | Valid, in-catalog track URLs reaching `done`, over a rolling 7 days. Excludes cache hits. |
| Cache hit response | < 1s | Submission to `cached` response with a valid `drive_path`. |
| Per-item processing time | median ≤ 45s | Job dequeue → file verified in the Drive mount. Excludes Drive upload time. |
| End-to-end at depth ≤ 3 | p95 ≤ 3 min | Submission → file present on a *requesting editor's* machine, including Drive sync. |
| Wasted-quota rate | 0 | Downloads spent on a track already in the shared folder. |
| Daily quota | hard stop at 35 | Successful downloads only; cache hits and failures do not count. Alert to team lead at 30. |

> **Latency note (corrects 1.0):** per-item cost is roughly 12-20s of interaction, plus 5-40s of actual transfer, plus an 8-15s inter-item cooldown — call it **25-75s per item**. A queue of 5 therefore takes 2-6 minutes to drain. v1.0's "≤60 seconds ingestion to Drive sync completion" only ever held at queue depth 1, and its sample `estimated_wait_seconds: 15` contradicted its own timing table. The KPIs above are stated per-item-from-dequeue, with a separate end-to-end figure that names the queue depth it assumes.

---

## 3. System Architecture & Technical Specifications

### 3.1 Component Overview

| Component | Technology | Responsibility |
| --- | --- | --- |
| **Client Ingestion** | HTTP REST / Web UI / Shortcut / Slack | Accepts URLs, validates, authenticates, submits, surfaces status. |
| **Job Service** | Python 3.11 + FastAPI + SQLite | FIFO queue, single in-flight job, track cache, quota accounting, stale-claim reaping, file move + verification. |
| **Execution Engine** | Chrome Extension (Manifest V3) | Claims jobs, drives the page, waits on real download-complete events, reports back. |
| **Staging** | Local disk (`~/ArtlistRelay/staging`) | Chrome's download target. Never inside a synced folder. |
| **Storage Pipeline** | Google Drive for Desktop (macOS) | Delivery sink. Only ever receives finished, size-verified files. |

### 3.2 Data Model (SQLite)

```sql
CREATE TABLE jobs (
  id             TEXT PRIMARY KEY,        -- uuid4
  url            TEXT NOT NULL,
  track_id       TEXT NOT NULL,           -- parsed from URL, dedup key
  requested_by   TEXT NOT NULL,
  format         TEXT NOT NULL DEFAULT 'WAV',
  status         TEXT NOT NULL,           -- queued|claimed|downloading|moving|done|failed|cached
  temp_filename  TEXT,                    -- absolute path in staging
  filename       TEXT,                    -- final basename
  drive_path     TEXT,                    -- absolute path in Drive mount
  bytes          INTEGER,
  error          TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  claimed_at     TEXT,
  completed_at   TEXT
);
CREATE INDEX idx_jobs_status ON jobs(status, created_at);

CREATE TABLE tracks (
  track_id       TEXT PRIMARY KEY,
  filename       TEXT NOT NULL,
  drive_path     TEXT NOT NULL,
  bytes          INTEGER NOT NULL,
  first_job_id   TEXT NOT NULL,
  downloaded_at  TEXT NOT NULL
);

CREATE TABLE counters (
  day            TEXT PRIMARY KEY,        -- YYYY-MM-DD, local time
  downloads      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE health (
  k              TEXT PRIMARY KEY,        -- session_authenticated | last_heartbeat | queue_paused
  v              TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
```

`track_id` is parsed from the URL path (`.../song/<slug>/<id>` → `<id>`). Dedup keys on the ID, not the full URL, because slugs and query strings vary for the same track.

### 3.3 Editor-Facing API

**Host:** `0.0.0.0:5000` on the dedicated Mac. **All routes require `Authorization: Bearer <TEAM_TOKEN>`.**

#### `POST /api/v1/jobs`

```json
{
  "url": "https://artlist.io/royalty-free-music/song/track-name/12345",
  "requested_by": "editor_1",
  "format": "WAV"
}
```

**201 Created** — queued:

```json
{
  "job_id": "8f14e45f-ea2b-4c1d-9f3a-11b0c2d7e5a9",
  "status": "queued",
  "queue_position": 2,
  "estimated_wait_seconds": 95,
  "daily_usage": "14/35"
}
```

**200 OK** — cache hit; no quota spent, no download performed:

```json
{
  "job_id": "3c9a1d22-7b40-4e88-a2f1-6d5c0e9b7714",
  "status": "cached",
  "filename": "Ambient_Sunrise__Artlist.wav",
  "drive_path": "/Users/relay/Library/CloudStorage/GoogleDrive-team@org/Shared drives/Editorial/Artlist/Ambient_Sunrise__Artlist.wav",
  "daily_usage": "14/35"
}
```

**400 Bad Request** — not an Artlist track URL, or no parseable track ID.
**401 Unauthorized** — missing or invalid token.
**403 Forbidden** — source IP outside the allowed subnets.

**429 Too Many Requests** — quota:

```json
{
  "status": "rejected",
  "error": "Daily safety quota reached (35/35). Manual download required.",
  "resets_at": "2026-08-20T00:00:00+05:30"
}
```

**503 Service Unavailable** — queue paused (session expired or failure threshold tripped):

```json
{
  "status": "rejected",
  "error": "Relay paused: Artlist session not authenticated on dedicated node. Team lead notified.",
  "paused_since": "2026-08-19T14:22:10+05:30"
}
```

#### `GET /api/v1/jobs/{job_id}`

```json
{
  "job_id": "8f14e45f-ea2b-4c1d-9f3a-11b0c2d7e5a9",
  "status": "done",
  "requested_by": "editor_1",
  "filename": "Ambient_Sunrise__Artlist.wav",
  "drive_path": "/Users/relay/.../Shared drives/Editorial/Artlist/Ambient_Sunrise__Artlist.wav",
  "bytes": 62914560,
  "error": null,
  "created_at": "2026-08-19T14:05:02+05:30",
  "completed_at": "2026-08-19T14:05:44+05:30"
}
```

#### `GET /api/v1/status`

Queue depth, in-flight job, `daily_usage`, `session_authenticated`, `queue_paused`. Backs the web UI and team-lead alerting.

### 3.4 Worker API (extension only)

Bound to `127.0.0.1` and rejected from any other source address. The extension polls `/worker/next` every 5s.

| Route | Purpose |
| --- | --- |
| `GET /api/v1/worker/next` | Atomically claims the oldest `queued` job → `claimed`, stamps `claimed_at`. Returns `204` when the queue is empty or paused. Never returns a second job while one is in flight. |
| `POST /api/v1/worker/jobs/{id}/downloaded` | Body `{ "temp_filename": "...", "bytes": 62914560 }`. Triggers the server-side move (§3.5). |
| `POST /api/v1/worker/jobs/{id}/failed` | Body `{ "reason": "selector_timeout" }`. Increments `attempts`. |
| `POST /api/v1/worker/heartbeat` | Body `{ "authenticated": true }`, every 5 min. Drives §5.3. |

**Stale-claim reaper:** any job in `claimed`/`downloading` with `claimed_at` older than 180s is marked `failed` and requeued once (`attempts < 2`). Prevents a crashed service worker from wedging the queue permanently.

### 3.5 File Delivery — Staging and Verified Move

This is the correction to v1.0's most damaging defect.

**FR-3.1 (revised):** Chrome's default download directory on the dedicated node MUST be set to a **local, non-synced** staging path:

```
~/ArtlistRelay/staging/
```

It MUST NOT be set to any path under `~/Library/CloudStorage/`.

**Rationale.** Chrome downloads as `name.wav.crdownload`, grows the file in place, then renames it to `name.wav` on completion. Pointed at a Drive mount, that produces two problems: Drive may upload the partial `.crdownload` and propagate it to all five editors, and the completion rename becomes a remote rename that Drive can resolve as a duplicate. An aborted download leaves a partial artifact in the shared folder permanently. Staging locally removes both failure modes.

**Move procedure**, executed by the service on receipt of `/downloaded`:

1. Assert `temp_filename` resolves inside the staging dir (reject path traversal) and does not end in `.crdownload`.
2. `stat` the file; assert its size matches the `bytes` reported by the extension.
3. Compute the destination path in the Drive folder. If a file with that name already exists, suffix with ` (2)`, ` (3)`, … rather than overwriting.
4. **Single-pass copy** (`shutil.copy2`) staging → destination. One open, one write stream, one close. Google Drive for Desktop's virtual mount initiates upload on file close, so a single-handle write uploads exactly once, with no intermediate rename for Drive to chase.
5. Re-`stat` the destination; assert size equality. On mismatch, `unlink` the destination, mark the job `failed`, and keep the staging copy for inspection.
6. Verify the RIFF/WAVE header (first 12 bytes: `RIFF....WAVE`) as a cheap corruption check.
7. `unlink` the staging file. Write the `tracks` row. Increment `counters` for today. Mark the job `done`.

Steps 5-6 guard the residual risk: a crash mid-copy leaves a partial file under the final name. Size verification catches it, and a startup sweep re-verifies any job left in `moving`.

**FR-3.2 (unchanged):** *"Ask where to save each file before downloading"* MUST be toggled **OFF**.

### 3.6 Interaction Pacing

The extension paces its interactions to stay well inside normal human usage rates. This is about being a well-behaved client on a licensed account, not about concealment — see the honesty note below.

```text
[Tab created, active: false]
      │
      ▼ wait 3.5s - 6.5s      (page render, SPA hydration, asset load)
[Scroll into view / focus target]
      │
      ▼ wait 1.2s - 2.4s
[Click download trigger]
      │
      ▼ wait 0.8s - 1.6s      (popover transition)
[Select lossless WAV option]
      │
      ▼ AWAIT chrome.downloads.onChanged -> state === "complete"
      │  (no fixed timer; hard ceiling 180s, then fail the job)
[POST /worker/jobs/{id}/downloaded, close tab]
      │
      ▼ cooldown 8s - 15s
[Claim next job]
```

**Completion detection (corrects 1.0).** v1.0 waited a fixed 4.0s for "file binary handoff" and then closed the tab. A 60MB WAV does not reliably transfer in 4s, and a fixed wait gives the service no idea whether the file is whole. The extension MUST instead:

* register `chrome.downloads.onCreated` to capture the `downloadId` initiated by the job's tab;
* listen on `chrome.downloads.onChanged` for that ID until `state.current === "complete"`;
* read `filename` and `bytes` (via `chrome.downloads.search({ id })`) and report both to the service;
* treat `state.current === "interrupted"` as a job failure, with the `error` string attached;
* fail the job at a 180s ceiling.

This also supplies the final filename, which §3.3's status response returns to the editor — v1.0 had no way to tell an editor what their file was called.

> **Honesty note on detection (replaces v1.0 §3.3's framing).** v1.0 asserted a "0% bot-detection signature." That claim is not supportable for this architecture. An MV3 content script cannot dispatch a trusted input event; `element.click()` and synthetic `MouseEvent`s carry `isTrusted === false`, and no amount of jitter changes that. The only MV3 path to genuinely trusted input is `chrome.debugger` (CDP), which this design deliberately rejects on other grounds. In practice most sites do not gate downloads on `isTrusted`, so this approach is very likely to work — but the project should be planned as "very likely to work," not as "undetectable." The defensible position is the one in §2.1: a real authenticated session on a licensed account, strictly serialized, at a rate far below the account's own allowance. The timing bounds here exist to avoid hammering the origin, not to defeat a detector.

---

## 4. Functional Requirements

### 4.1 Queue, Cache & Quota

* **FR-1.1:** MUST reject any URL whose host is not `artlist.io`, and any URL with no parseable track ID.
* **FR-1.2:** MUST maintain a daily counter keyed on local-time date, incremented **only on successful completion**. Cache hits and failures MUST NOT consume quota.
* **FR-1.3:** MUST serialize strictly. Exactly one job may be `claimed`/`downloading` at any moment; `/worker/next` MUST NOT hand out a second.
* **FR-1.4 (new):** On submission, MUST check the `tracks` cache by `track_id`. On hit, MUST `stat` the recorded `drive_path` before answering: if the file still exists, respond `cached` with its path and spend no quota; if it has been deleted from the shared drive, evict the row and queue the job normally.
* **FR-1.5 (new):** MUST reject a submission whose `track_id` is already `queued` or in flight, returning the existing `job_id` instead of creating a duplicate.
* **FR-1.6 (new):** MUST hard-stop at 35 successful downloads/day and alert the team lead at 30.
* **FR-1.7 (new):** All queue and counter state MUST persist in SQLite and survive a service restart. In-memory state is not acceptable — a restart would silently reset the quota guard.

### 4.2 Extension & DOM Automation

* **FR-2.1:** MUST operate in inactive background tabs (`active: false`).
* **FR-2.2:** MUST handle SPA DOM variations — both the direct download icon and the secondary modal dropdown — via a single `SELECTORS` dictionary at the top of `content.js`, each step holding an ordered array of fallback selectors tried in sequence.
* **FR-2.3:** MUST close the job tab after reporting completion. Downloads are browser-level, not tab-level, so closing after the `complete` event is safe.
* **FR-2.4 (new):** MUST detect completion via `chrome.downloads` events, never a fixed timer (§3.6).
* **FR-2.5 (new):** MUST fail a job — 20s per-step selector timeout, 180s overall — closing the tab and POSTing to `/worker/jobs/{id}/failed` with a machine-readable reason.
* **FR-2.6 (new):** MUST send a heartbeat every 5 minutes reporting whether the Artlist session is still authenticated.

### 4.3 Storage & Delivery

* **FR-3.1 (revised):** Chrome's download directory MUST be the local staging dir, never the Drive mount (§3.5).
* **FR-3.2:** *"Ask where to save each file"* MUST be OFF.
* **FR-3.3 (new):** Files MUST enter the shared Drive folder only via the verified move in §3.5 — size-checked, header-checked, and never under a `.crdownload` name.
* **FR-3.4 (new):** The final `drive_path` and `filename` MUST be recorded on the job and returned by the status endpoint.

### 4.4 Notification & Feedback (new)

* **FR-4.1:** Every submission MUST return a `job_id`.
* **FR-4.2:** `GET /api/v1/jobs/{job_id}` MUST report terminal state with either a `drive_path` or a human-readable `error`.
* **FR-4.3:** On job failure, and on queue pause, the service MUST notify — Slack incoming webhook if configured, otherwise a `status` flag the web UI surfaces. v1.0 promised editor notification with nothing behind it; this is the mechanism.
* **FR-4.4:** The web UI MUST poll `/api/v1/status` and show queue depth, in-flight track, daily usage, and pause state.

---

## 5. Non-Functional & Security Requirements

### 5.1 Access Control

* **Bearer token.** Every editor-facing route requires `Authorization: Bearer <TEAM_TOKEN>`, read from an environment variable on the dedicated node and distributed to the five editors out of band. Subnet restriction alone (v1.0) left the quota drainable by anyone on office wifi or VPN, and produced no attributable request log.
* **Subnet allowlist** retained as defense in depth: `192.168.0.0/16`, `10.0.0.0/8`, `127.0.0.1`.
* **Worker routes** bound to loopback and rejected from any non-loopback source.
* **Audit log.** Every submission logs timestamp, `requested_by`, source IP, `track_id`, and outcome. This is what makes §7's per-person accountability real.
* **No external exposure.** The service must not be port-forwarded or tunnelled. No Selenium, Puppeteer, or CDP debug port is opened at any point.

### 5.2 Resilience

* Per-step selector timeout 20s; overall job ceiling 180s. On timeout: close the tab, log a structured error payload, notify.
* Stale-claim reaper requeues a job once (`attempts < 2`), then fails it permanently.
* After **3 consecutive job failures**, the service sets `queue_paused` and alerts the team lead. Prevents burning the daily quota against a changed frontend.
* Startup sweep: any job left in `moving` re-verifies its destination file and either completes or fails it.

### 5.3 Session Health (new)

* The extension checks authentication state every 5 minutes and reports it on the heartbeat.
* If `authenticated` is false, or no heartbeat arrives for 15 minutes, the service pauses the queue and returns `503` with an actionable message.
* Recovery is a human logging back into Artlist in Chrome on the dedicated node; the next successful heartbeat clears the pause automatically.

### 5.4 Compliance

Automated interaction with Artlist is very likely restricted by their terms of service regardless of how the traffic is paced, and v1.0's framing — "mask automation patterns," "0% bot-detection signature" — made evasion the stated objective rather than a side effect. The substance here is defensible: licensed downloads, on a paid account, delivered to seat-holding editors, at a rate below the account's own daily allowance. The framing was not, and has been rewritten throughout this revision.

**Required before Phase 1:** someone with authority reads the current Artlist team-plan terms and confirms (a) whether automated access is permitted or tolerable, and (b) whether centralizing downloads on one account for five people is consistent with the licence. If either answer is no, the Phase 0 alternative in §6 is the path forward instead.

---

## 6. Implementation Roadmap

### Phase 0: Verification Gate (half day) — **BLOCKING**

Nothing else starts until these are answered. Two of the four outcomes make most of this project unnecessary.

* [ ] Does the 5-member team plan issue **5 independent logins**? If yes, the correct fix is to hand each editor their own seat and delete this project — downloads then land on each editor's own machine with zero infrastructure.
* [ ] Is the 40-track daily cap **per account or per seat**? If per seat, centralizing collapses 200 downloads/day of capacity into 35. That is a five-person bottleneck presented in v1.0 §7 as a safety feature.
* [ ] Confirm the Artlist ToS position (§5.4).
* [ ] Confirm the shared drive is a **Shared Drive**, not a personal My Drive folder shared out — the latter has different sync and ownership semantics and will surprise you later.

> If seats are per-editor **and** the cap is per-seat, stop here and write a one-paragraph note instead of building any of the following.

### Phase 1: Service & Path Verification (Day 1)

* [ ] Configure Google Drive for Desktop; verify the `~/Library/CloudStorage/` path and write permissions.
* [ ] **Manual sync test:** copy a 60MB WAV into the target folder and time the round trip to a second editor's machine. This number sets the realistic end-to-end KPI; it is not under this project's control.
* [ ] Create the staging directory. Set Chrome's download dir to it. Turn off "ask where to save."
* [ ] FastAPI service: SQLite schema, job CRUD, quota counter, track cache, stale-claim reaper.
* [ ] Implement and unit-test the §3.5 move procedure, including the size-mismatch and pre-existing-filename branches.
* [ ] Bearer auth + subnet allowlist + audit log.

### Phase 2: Chrome Extension (Day 1-2)

* [ ] MV3 boilerplate: `manifest.json`, `background.js` (service worker), `content.js`.
* [ ] Build the `SELECTORS` dictionary against the live Artlist page. **Highest-unknown task in the project** — budget generously.
* [ ] Job claim loop, paced interaction wrappers, tab lifecycle.
* [ ] `chrome.downloads` completion tracking with the 180s ceiling and `interrupted` handling.
* [ ] Failure reporting and 5-minute heartbeat.

### Phase 3: Client Interfaces (Day 2-3)

* [ ] **Option A (recommended baseline):** static web portal at `http://dedicated-mac.local:5000` — paste URL, see the queue, see your file's name when it lands. Covers everyone with no per-machine setup.
* [ ] **Option B:** Raycast script / Apple Shortcut for one-click clipboard submission.
* [ ] **Option C:** Slack webhook listener on `#asset-requests`, replying in-thread with the final filename.

### Phase 4: Integration Testing (Day 3)

* [ ] 5 simultaneous submissions from 5 machines → verify strict serialization, correct queue positions, and that the ETA shown matches actual drain time.
* [ ] **Duplicate test:** two editors submit the same track → the second returns `cached` in under a second, quota unchanged.
* [ ] **Integrity test:** verify every delivered `.wav` opens in Premiere and Resolve; confirm no `.crdownload` artifact ever appeared in the shared drive during the run.
* [ ] **Kill test:** force-quit Chrome mid-download → reaper requeues, no partial file in Drive, no leaked quota.
* [ ] **Session-expiry test:** log out of Artlist → the next submission returns `503` with the actionable message, no quota burned.
* [ ] **Selector-drift test:** deliberately break a selector → job fails cleanly, 3 failures pause the queue, alert fires.
* [ ] **Quota test:** drive the counter to 35 → `429` with correct `resets_at`; verify the midnight reset.
* [ ] Measure end-to-end p95 at depth 3 against the Phase 1 sync baseline.

---

## 7. Operational Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| **Artlist frontend redesign** | Medium | Medium | Centralized `SELECTORS` dictionary with ordered fallbacks; 3-consecutive-failure auto-pause stops quota burn while it is fixed. |
| **Partial/corrupt files reaching editors** | **Was high in v1.0** | High | Local staging + verified single-pass copy + size and RIFF-header checks (§3.5). Primary defect fixed in this revision. |
| **Wasted quota on duplicates** | High | Medium | Track cache (FR-1.4) and in-flight dedup (FR-1.5). Cache hits cost nothing. |
| **Artlist session expiry** | High | High | Heartbeat + auto-pause + actionable `503` (§5.3). |
| **Hit the daily cap** | Medium | High | Server-side hard stop at 35, alert at 30, quota charged only on success. |
| **Mac sleep / app suspension** | Medium | Medium | Energy Saver "prevent sleeping when display is off"; `caffeinate -s` under launchd, or Amphetamine. Service and Chrome both under launchd with `KeepAlive`. |
| **Quota drained by an unauthorized submitter** | Low | Medium | Bearer token + subnet allowlist + per-request audit log (§5.1). |
| **Service restart loses queue/counter** | **Was certain in v1.0 in-memory mode** | High | SQLite persistence mandated (FR-1.7); startup sweep reconciles interrupted moves. |
| **Detection despite pacing** | Low-Medium | High | Cannot be reduced to zero (§3.6 honesty note). Mitigated by low serialized volume, a real session, a sub-allowance cap, and by not depending on the relay — manual download remains available, and the `429`/`503` paths say so explicitly. |
| **ToS / licence conflict** | Unknown | High | Phase 0 gate (§5.4). Answer before building. |
