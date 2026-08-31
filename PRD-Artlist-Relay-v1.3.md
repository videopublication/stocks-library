# Product Requirement Document (PRD)

**Project Name:** Shared Artlist Asset Library & Download Relay

**Document Version:** 1.3.0 (supersedes 1.2.0, 1.1.0, 1.0.0)

**Node Platform:** macOS **or** Windows 11 — see §3.7. Cross-platform client interfaces.

**Primary Objective:** Build a shared, org-owned Artlist asset library that any editor can add to by dropping a link into Google Chat, so a track is licensed and downloaded once and then available to the whole team — without spending anyone's personal download quota and without manual Drive uploads.

**Companion document:** `Risk-Assessment-and-Mitigation-Strategy-v1.1.md`. Risk IDs (`RSK-nn`) referenced throughout.

---

## 0. Changelog

### 1.3.0 (this revision)

| # | Change | Reason |
| --- | --- | --- |
| E-1 | **Google Chat is now the primary ingestion path** (§3.8), via a Chat app on a **Cloud Pub/Sub pull** subscription. Web portal demoted to library browsing + admin. | Answers "where does the editor send the link." Pub/Sub means the node makes **outbound connections only** — no inbound port, no tunnel, no change to the security posture. Editors can also submit from home or phone. |
| E-2 | **`requested_by` is now server-derived from the verified Chat sender**, never client-supplied. | v1.2's `requested_by` was a free-text string any client could forge, which made the "central licence record" (§1.2) unattributable. Chat gives a Google-verified email for free. |
| E-3 | **Node is now OS-agnostic.** Windows 11 supported and viable; platform-specific config in §3.7. | Team has a Windows laptop available. Nothing in the design is macOS-specific once paths and supervision are parameterized. |
| E-4 | **`os.replace()` replaces `os.rename()`** for the staging→library handoff, plus retry-with-backoff. | `os.rename` raises `FileExistsError` on Windows when the destination exists — different behaviour from POSIX. `os.replace` is atomic on both NTFS and APFS. Retry covers antivirus briefly holding the file handle (`RSK-17`). |
| E-5 | **Filename sanitization is now mandatory** (FR-3.6), not a nicety. | Windows forbids `< > : " / \ | ? *`, reserved device names, and trailing dots/spaces. Artlist titles contain colons and question marks routinely. On a Windows node or Windows editor machines this is a hard failure, not cosmetic. |
| E-6 | **MV3 service-worker keepalive via `chrome.alarms`** replaces the 5s `setInterval` poll (§3.5). | `RSK-02`: MV3 service workers terminate after ~30s idle and take `setInterval` with them. v1.2's "polls every 5s" was broken as specified. |
| E-7 | **FR-2.1 inverted: job tabs now open `active: true`**, plus Chrome launched with throttling disabled. | `RSK-08`. Background tabs may not hydrate an SPA — `IntersectionObserver` never fires and lazy components never render, so the download control may not exist. Chrome flags also neutralise window occlusion on a locked or lid-closed node. |
| E-8 | **New §4.5: storage lifecycle and retention.** | `RSK-11`: nothing in v1.2 budgeted, monitored, or bounded cloud storage. At ~60MB/track the library grows unbounded against a finite Drive quota. |
| E-9 | **`variant` added to the job schema.** | `RSK-10` promised variant selection (Main / Instrumental / Stems) that the API had no field to express. |
| E-10 | **SQLite WAL mode + single-writer mandated; nightly DB backup added.** | `RSK-14`, `RSK-15`. The `tracks` table *is* the licence record and the cache — v1.2 had no backup for it, and async FastAPI over default-journal SQLite produces `database is locked` under concurrent submits. |
| E-11 | **Extension packed as `.crx` and force-installed by policy.** | `RSK-13`: unpacked extensions get disabled across Chrome updates, silently killing the relay mid-day. |

### 1.2.0

| # | Change |
| --- | --- |
| D-1 | Phase 0 gate closed — all 5 editors have working seats; relay runs on one designated account. |
| D-2 | Problem statement rewritten: shared library + quota preservation, not "editors walk to a workstation." |
| D-3 | Delivery via local folder + Drive sync rather than writing into the `CloudStorage` virtual mount. |
| D-4 | `STAGING_PATH` / `LIBRARY_PATH` as config; same-volume vs cross-volume auto-detected. |
| D-5 | Quota reframed as an additive pool, not a bottleneck. |
| D-6 | Blast-radius containment stated as a design property. |
| D-7 | Dedup cache promoted from optimization to core feature. |

### 1.1.0 (corrections to 1.0.0)

| # | Change |
| --- | --- |
| C-2 | Staged download + verified handoff instead of downloading into the sync target. |
| C-3 | Event-driven completion via `chrome.downloads.onChanged`, replacing a fixed 4.0s wait. |
| C-4 | Detection framing rewritten — MV3 cannot emit trusted events; "0% signature" was unsupportable. |
| C-5 | Track-level dedup cache. |
| C-6 | Job IDs, status endpoint, returned filename. |
| C-7 | Session health check + queue auto-pause. |
| C-8 | SQLite mandated over in-memory. |
| C-9 | Bearer-token auth over subnet-only. |
| C-10 | Latency KPIs recomputed. |

---

## 1. Executive Summary & Problem Statement

### 1.1 Context

The team runs a 5-member Artlist team subscription. **All five editors have their own working seats and use them directly** — there is no shared-credential workstation and no access bottleneck.

A **designated relay account** drives automation on a dedicated always-on node (macOS or Windows 11), which builds a shared asset library in Google Drive. The org is on Google Workspace, which is what makes the Google Chat ingestion path in §3.8 available.

> **Open question, carried from 1.2:** is the relay account a separate 6th subscription, or one of the 5 repurposed? If the latter, one editor loses their personal seat and that needs saying out loud. Everything below works either way; only seat accounting changes.

### 1.2 Problem

With every editor able to download for themselves, the remaining friction is not *access* — it is *duplication and dispersal*:

1. **The same track gets licensed and downloaded five times.** Editor A finds a bed; three weeks later Editor C needs the same one and spends their own daily quota on a file the team already owns.
2. **No shared library exists.** Downloads land in each editor's local Downloads folder. There is no team-wide place to look before searching Artlist, so nobody looks.
3. **Manual Drive upload is the only sharing path.** Download → find file → upload → tell them. Skipped under deadline, which is why (2) persists.
4. **Personal quota is the scarce resource.** Each editor's 40/day is consumed by re-downloads of tracks the org already licensed.
5. **No central licence record.** What the org has licensed, when, and at whose request is spread across five machines.

### 1.3 Solution

A relay on a dedicated node that turns any Artlist link — pasted into a Google Chat space — into a permanent entry in a shared, org-owned library:

* A **Google Chat app** on a Pub/Sub pull subscription: editors paste a link, the bot replies in-thread. No inbound ports; works off-LAN.
* A local job service (FastAPI + SQLite) with FIFO queue, quota accounting, and — centrally — a **track cache**.
* An MV3 Chrome Extension driving the download inside the relay account's authenticated session, strictly one job at a time.
* A **local staging dir** for Chrome's downloads and a **local library dir that Google Drive syncs**. The handoff between them is atomic.

**The dedup cache is the core of the value, not an optimization.** Submitting a track the library already holds returns its path in under a second, spends zero quota, and downloads nothing. Over time most requests become cache hits, and the relay's ~35/day covers only genuinely new music.

```
┌──────────────────────────────────────────────────────────┐
│  Editors (x5) — each with their own Artlist seat         │
│  Google Chat space  #artlist-library   (primary)         │
│  Web portal (library browse/search)    (secondary)       │
└───────────────┬──────────────────────────────▲───────────┘
                │ paste link in Chat           │ bot replies in-thread:
                │                              │ cached path, or queued -> done
                ▼                              │
        ┌───────────────┐              ┌───────┴────────┐
        │ Google Chat   │              │ Chat REST API  │
        │ API (Google)  │              │ (outbound)     │
        └───────┬───────┘              └───────▲────────┘
                │ publishes event              │
                ▼                              │
        ┌───────────────────────┐              │
        │ Cloud Pub/Sub topic   │              │
        └───────┬───────────────┘              │
                │  PULL (outbound only)        │
┌───────────────┼──────────────────────────────┼───────────┐
│  Dedicated Node (macOS or Windows 11)        │           │
│               ▼                              │           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Job Service (FastAPI / SQLite WAL / Port 5000)     │  │
│  │ - Pub/Sub subscriber  - Chat reply client          │  │
│  │ - TRACK CACHE: hit => 0 quota, instant answer      │  │
│  │ - FIFO queue, single in-flight job                 │  │
│  │ - Daily counter, stale-claim reaper, disk guard    │  │
│  └───────┬────────────────────────────────▲───────────┘  │
│          │ GET /worker/next (127.0.0.1)   │ downloaded / │
│          │ woken by chrome.alarms (30s)   │ failed       │
│          ▼                                │              │
│  ┌───────────────────────────────────────┴────────────┐  │
│  │ Chrome (relay account session, throttling off)     │  │
│  │ - MV3 Extension, force-installed .crx              │  │
│  │ - Job tab active:true, closed on onCreated         │  │
│  │ - chrome.downloads.onChanged -> state "complete"   │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │ writes to                     │
│                          ▼                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │ STAGING_PATH   — local, unsynced, unwatched        │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │ os.replace()  <- ATOMIC       │
│                          │ same volume, instant          │
│                          ▼                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │ LIBRARY_PATH   — local folder, Google Drive syncs  │  │
│  └───────────────────────┬────────────────────────────┘  │
└──────────────────────────┼───────────────────────────────┘
                           │ Google Drive sync (uplink-bound)
                           ▼
┌──────────────────────────────────────────────────────────┐
│  Shared Artlist Library — all 5 editors, offline-pinned  │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Goals & Success Metrics

### 2.1 Primary Goals

* **License Once, Use Forever.** Any track the org has licensed is permanently available to all five editors without a second download.
* **Preserve Personal Quota.** Editors stop spending their own 40/day on tracks the team already owns. The relay's quota is additive capacity.
* **Submission Where Work Already Happens.** Pasting a link into a Chat space is the whole interaction. No new app, no VPN, no LAN requirement.
* **File Integrity.** Every file that appears in the library is complete and playable. No partial or `.crdownload` artifacts ever reach the synced folder.
* **Attributable Licence Record.** One queryable record of what was licensed, when, and by **whom** — verified, not self-declared.
* **Contained Blast Radius.** All automation runs on one designated account. If it is ever restricted, the five editors' accounts and their day-to-day work are untouched, and the fallback is the workflow they use today.

> **Removed in 1.2:** "Zero Walking Friction" — measured a problem that no longer exists.
> **Removed in 1.1:** "100% Account Safety / 0% bot-detection signature" — not achievable as specified (§3.6).

### 2.2 Key Performance Indicators

| KPI | Target | Definition |
| --- | --- | --- |
| **Cache hit rate** | ≥ 40% by month 3 | Share of submissions answered from the library. **The headline metric.** |
| **Cache hit response** | < 3s | Submission → bot reply in Chat with the library path. Includes Pub/Sub delivery. |
| Personal quota displaced | ≥ 150 tracks/month | Cache hits + relay downloads = downloads editors did not spend their own quota on. |
| Download success rate | ≥ 98% | Valid, in-catalog URLs reaching `done`, rolling 7 days. Excludes cache hits. |
| Per-item processing time | median ≤ 60s | Job dequeue → file verified in `LIBRARY_PATH`. Excludes Drive sync. |
| End-to-end at depth ≤ 3 | p95 ≤ 4 min | Submission → file usable on a requesting editor's machine, including Drive sync. Baseline measured in Phase 1. |
| Wasted-quota rate | 0 | Downloads spent on a track already in the library. |
| Daily relay quota | hard stop at 35 | Successful downloads only. Cache hits and failures do not count. Alert at 30. |
| Library storage growth | tracked weekly | Against the Drive quota ceiling (§4.5). |

> **Latency note.** Per-item cost is ~12–20s of interaction + 5–40s of transfer + an 8–15s cooldown = **25–75s per item**, plus up to 30s for the `chrome.alarms` wake on the first job of an idle period (§3.5). A queue of 5 drains in 2–6 minutes. KPIs are per-item-from-dequeue, with a separate end-to-end figure naming its assumed queue depth. Drive sync time is not under this project's control and is measured separately in Phase 1.

---

## 3. System Architecture & Technical Specifications

### 3.1 Component Overview

| Component | Technology | Responsibility |
| --- | --- | --- |
| **Chat Ingestion** | Google Chat app + Cloud Pub/Sub (pull) | Primary submission path. Verified sender identity, in-thread replies, slash commands. |
| **Web Portal** | Static page served by the job service | Library browse and search; queue/status dashboard. Secondary submission path. |
| **Job Service** | Python 3.11 + FastAPI + SQLite (WAL) | Track cache, FIFO queue, single in-flight job, quota accounting, stale-claim reaping, staging→library handoff, disk/storage guards. |
| **Execution Engine** | Chrome Extension (Manifest V3, packed `.crx`) | Claims jobs, drives the page, waits on real download-complete events, reports back. |
| **`STAGING_PATH`** | Local disk, unsynced | Chrome's download target. Never watched by any sync client. |
| **`LIBRARY_PATH`** | Local disk, Drive-synced | The shared library. Receives only complete files. |
| **Sync** | Google Drive for Desktop | Propagates `LIBRARY_PATH` to the five editors. Configuration only — no code depends on it. |

### 3.2 Data Model (SQLite, WAL mode)

```sql
PRAGMA journal_mode = WAL;      -- required: see RSK-14
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;

CREATE TABLE jobs (
  id             TEXT PRIMARY KEY,        -- uuid4
  url            TEXT NOT NULL,
  track_id       TEXT NOT NULL,           -- parsed from URL, dedup key
  variant        TEXT NOT NULL DEFAULT 'main',   -- main|instrumental|stems|short
  format         TEXT NOT NULL DEFAULT 'WAV',
  requested_by   TEXT NOT NULL,           -- VERIFIED email, server-derived
  source         TEXT NOT NULL,           -- chat|portal
  chat_space     TEXT,                    -- spaces/XXXX, for the reply
  chat_thread    TEXT,                    -- spaces/XXXX/threads/YYYY
  status         TEXT NOT NULL,           -- queued|claimed|downloading|moving|done|failed|cached
  temp_filename  TEXT,
  filename       TEXT,
  library_path   TEXT,
  bytes          INTEGER,
  error          TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  claimed_at     TEXT,
  completed_at   TEXT
);
CREATE INDEX idx_jobs_status ON jobs(status, created_at);

-- The library index. This table IS the product. Backed up nightly (RSK-15).
CREATE TABLE tracks (
  track_id       TEXT NOT NULL,
  variant        TEXT NOT NULL DEFAULT 'main',
  title          TEXT,
  filename       TEXT NOT NULL,
  library_path   TEXT NOT NULL,
  bytes          INTEGER NOT NULL,
  first_job_id   TEXT NOT NULL,
  requested_by   TEXT NOT NULL,           -- who first licensed it
  downloaded_at  TEXT NOT NULL,
  hit_count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (track_id, variant)         -- same track, different variants coexist
);

CREATE TABLE counters (
  day            TEXT PRIMARY KEY,        -- YYYY-MM-DD, node local time
  downloads      INTEGER NOT NULL DEFAULT 0,
  cache_hits     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE health (
  k              TEXT PRIMARY KEY,        -- session_authenticated | last_heartbeat | queue_paused
  v              TEXT NOT NULL,           --   | disk_free_bytes | drive_used_bytes
  updated_at     TEXT NOT NULL
);
```

`track_id` is parsed from the URL path (`.../song/<slug>/<id>` → `<id>`). Dedup keys on the ID, not the full URL, because slugs and query strings vary for the same track. The composite primary key on `(track_id, variant)` means requesting the instrumental of a track you already have as `main` is a legitimate new download, not a cache hit.

**Concurrency:** WAL mode plus a single serialized writer path. All writes go through one connection guarded by a lock; readers are unrestricted. Default journal mode under async FastAPI produces `database is locked` under concurrent submissions (`RSK-14`).

### 3.3 Editor-Facing HTTP API

**Host:** `0.0.0.0:5000` on the node. Bearer token + subnet allowlist (§5.1). Used by the web portal; the Chat path (§3.8) reaches the same internal logic without traversing HTTP.

#### `POST /api/v1/jobs`

```json
{
  "url": "https://artlist.io/royalty-free-music/song/track-name/12345",
  "variant": "main",
  "format": "WAV"
}
```

`requested_by` is **not accepted from the client** — it is derived from the authenticated principal (portal session or verified Chat sender). A client-supplied value is ignored (E-2).

**200 OK** — cache hit. No quota spent, nothing downloaded. The common case at steady state:

```json
{
  "job_id": "3c9a1d22-7b40-4e88-a2f1-6d5c0e9b7714",
  "status": "cached",
  "filename": "Ambient Sunrise - Artlist.wav",
  "library_path": "Artlist Library/Ambient Sunrise - Artlist.wav",
  "first_licensed_by": "editor3@org",
  "first_licensed_at": "2026-07-02T11:14:00+05:30",
  "daily_usage": "14/35"
}
```

**201 Created** — new track, queued:

```json
{
  "job_id": "8f14e45f-ea2b-4c1d-9f3a-11b0c2d7e5a9",
  "status": "queued",
  "queue_position": 2,
  "estimated_wait_seconds": 130,
  "daily_usage": "14/35"
}
```

**400** — not an Artlist track URL, or no parseable track ID.
**401 / 403** — bad token / disallowed source subnet.
**429** — relay quota exhausted. The editor has their own seat, so this is an inconvenience, not a blocker:

```json
{
  "status": "rejected",
  "error": "Relay quota reached (35/35) for today. Download on your own Artlist seat and drop the file in the library folder — it will be indexed automatically. Or resubmit after midnight.",
  "resets_at": "2026-08-20T00:00:00+05:30"
}
```

**503** — queue paused (session expired, circuit breaker tripped). Same fallback.
**507 Insufficient Storage** — local free disk below threshold, or Drive quota headroom exhausted (§4.5).

#### `GET /api/v1/jobs/{job_id}`

Terminal state with `filename` + `library_path`, or a human-readable `error`.

#### `GET /api/v1/library?q=<search>`

Searches `tracks` by title/filename/variant. Lets an editor check the library **before** going to Artlist. This is the mechanism that produces cache hits rather than merely counting them (`RSK-12`).

#### `GET /api/v1/status`

Queue depth, in-flight job, `daily_usage`, today's `cache_hits`, `session_authenticated`, `queue_paused`, `disk_free`, `drive_headroom`.

### 3.4 Worker API (extension only)

Bound to `127.0.0.1`, rejected from any other source.

| Route | Purpose |
| --- | --- |
| `GET /api/v1/worker/next` | Atomically claims the oldest `queued` job → `claimed`. Returns `204` when empty or paused. Never hands out a second job while one is in flight. |
| `POST /api/v1/worker/jobs/{id}/downloaded` | Body `{ "temp_filename": "...", "bytes": 62914560 }`. Triggers the handoff (§3.6). |
| `POST /api/v1/worker/jobs/{id}/failed` | Body `{ "reason": "selector_timeout" }`. Increments `attempts`. |
| `POST /api/v1/worker/heartbeat` | Body `{ "authenticated": true }`. Drives §5.3. |

**Stale-claim reaper:** any job in `claimed`/`downloading` with `claimed_at` older than 180s is failed and requeued once (`attempts < 2`).

### 3.5 Extension Lifecycle & Service-Worker Keepalive

**This corrects v1.2's "polls every 5s," which does not work.** (`RSK-02`)

Manifest V3 service workers are terminated after roughly 30 seconds of inactivity. A `setInterval(poll, 5000)` in `background.js` dies with the worker and never resumes — the relay silently stops processing shortly after the queue empties.

**Required design:**

1. **`chrome.alarms` as the wake source.** Register `chrome.alarms.create('poll', { periodInMinutes: 0.5 })` — 30 seconds is the platform minimum. Alarms wake a terminated service worker. `chrome.alarms` also requires the `"alarms"` permission in the manifest.
2. **No keepalive needed while working.** Once a job is claimed, the worker is continuously calling `chrome.tabs` and `chrome.downloads` APIs and receiving their events, and each extension API call or event resets the idle timer. The worker stays alive naturally for the duration of a job and drains the rest of the queue without waiting on alarms.
3. **Consequence:** the queue is only cold when it is empty. Worst-case added latency is ≤30s on the **first** job after an idle period, and zero for every job behind it. Reflected in the KPI table.

This is a small amount of code against the alternative of a pinned-tab SSE bridge or a native-messaging host. **Native messaging remains the escalation path** if a 30s cold-start proves unacceptable — an open native port keeps the worker alive indefinitely and removes the loopback HTTP hop entirely — but it splits the service into two processes (Chrome spawns the host), which is not justified by a 30s worst case.

**Packaging (`RSK-13`):** the extension MUST be packed as a `.crx` and force-installed by policy (`ExtensionInstallForcelist` / `ExtensionSettings`) via a macOS configuration profile or Windows Group Policy / registry. An unpacked extension gets disabled across Chrome updates and behind developer-mode prompts, which silently kills the relay mid-day.

### 3.6 File Delivery — Staging and Atomic Handoff

**FR-3.1:** Chrome's default download directory MUST be `STAGING_PATH` — an ordinary local folder that **no sync client watches**. Both paths live on the same volume; neither is inside a Drive mount.

| | macOS | Windows 11 |
| --- | --- | --- |
| `STAGING_PATH` | `~/ArtlistRelay/staging/` | `C:\ArtlistRelay\staging\` |
| `LIBRARY_PATH` | `~/ArtlistRelay/library/` | `C:\ArtlistRelay\library\` |
| Filesystem | APFS | NTFS |

**Why staging is required even though the library is a plain local folder.** Chrome does not write `track.wav`. It writes `track.wav.crdownload`, grows it in place, and renames on completion. Any sync client watching that folder uploads the partial, propagates it to all five editors, and then chases the rename — and an aborted download leaves a partial artifact in the shared library permanently. The staging dir is what keeps Drive from ever seeing an incomplete file.

**Handoff procedure**, on receipt of `/downloaded`:

1. Assert `temp_filename` resolves inside `STAGING_PATH` (reject path traversal) and does not end in `.crdownload`.
2. `stat` it; assert size matches the `bytes` the extension reported.
3. Verify the RIFF/WAVE header (first 12 bytes: `RIFF....WAVE`). Reject anything under **1 MB** — enough to catch an HTML error page saved as `.wav`, low enough not to false-reject a legitimate short-version sting (`RSK-10`).
4. **Sanitize the filename** (FR-3.6) and compute the destination under `LIBRARY_PATH`. If that name exists, suffix ` (2)`, ` (3)`, … — never overwrite.
5. **`os.replace(staging, library)`** — atomic on APFS and NTFS alike. **Not `os.rename`:** on Windows `os.rename` raises `FileExistsError` when the destination exists, which is different behaviour from POSIX and would produce a platform-dependent bug (E-4).
6. **Retry with backoff** on `PermissionError` — 5 attempts over ~10s. On Windows, Defender or another AV scanner routinely holds a handle on a freshly written file for a second or two (`RSK-17`).
7. Write the `tracks` row, increment `counters.downloads`, mark the job `done`, reply in the Chat thread.

**Cross-volume fallback.** If the paths land on different filesystems, `os.replace` raises `OSError`/`EXDEV`. The service MUST detect this **at startup**, log the active mode, and fall back to single-pass `shutil.copy2` + destination size re-verification + `unlink` of the staging copy. A startup sweep re-verifies any job left in `moving`.

#### 3.6.1 Google Drive sync mode

| | **A. Mirrored folder** (recommended) | **B. Shared Drive, streamed** |
| --- | --- | --- |
| `LIBRARY_PATH` | Local folder added to Drive for Desktop as a synced folder | Inside the Drive virtual mount |
| Handoff | **Atomic `os.replace`** | Cross-device verified copy |
| Local copy on node | Yes — works offline | No — needs network |
| Ownership | Relay account | The organisation |
| Storage counts against | Relay account's Drive quota | Shared Drive quota |
| Editor access | Share folder; each editor adds a shortcut — **one-time setup per editor** | Appears automatically for Shared Drive members |
| Account deprovisioned | **Files at risk** | Files survive |

**Recommendation:** start with **A**, accepting the one-time per-editor setup and relay-account ownership. If a Shared Drive exists on the Workspace tier, **B** is the safer long-run home on ownership grounds — and note that under B, storage counts against a pooled org quota rather than one user's, which materially changes §4.5.

#### 3.6.2 Editor-side requirements (`RSK-04`)

The atomic handoff protects the library **on the node**. It does nothing for the failure that actually bites editors: opening a file on *their* machine while Drive is still fetching it. Both of these are required on **each editor's machine**, and neither is code:

* The library folder MUST be marked **Available offline** in Drive for Desktop. In Stream mode the file is a placeholder until opened, and an NLE handed a placeholder reports offline media.
* Editors MUST **copy tracks out of the library folder into project media** before importing, never link the NLE directly at a cloud-synced path. This is standard NLE practice and it is the real fix.

Verified during Phase 1 rollout, per editor, not delegated to a written instruction.

### 3.7 Node Platform — macOS or Windows 11

Nothing in the design is macOS-specific once paths and process supervision are parameterized. Choose whichever machine can stay **powered, awake, wired, logged in, and not walked off with**.

| Concern | macOS | Windows 11 |
| --- | --- | --- |
| Service supervision | `launchd` with `KeepAlive` | Task Scheduler, "At log on", restart-on-failure. **Not** a Windows Service — Session 0 isolation prevents a service from running Chrome with a rendering window. |
| Auto-login | Users & Groups → automatic login | `netplwiz` / autologon, required so the interactive session exists after reboot |
| Prevent sleep | `caffeinate -dimsu` under `launchd` | `powercfg /change standby-timeout-ac 0`, `monitor-timeout-ac 0`, `powercfg /hibernate off` |
| Laptop lid | Prevent sleep on lid close (clamshell) | Power Options → "When I close the lid: Do nothing" |
| Session lock | Disable screen lock, or rely on the Chrome flags below | Same — a locked session occludes windows |
| Forced updates | Defer macOS updates outside work hours | Set **Active Hours**, defer feature updates. Windows Update forced reboots are the bigger nuisance of the two. |
| Extension policy | Configuration profile (`ExtensionInstallForcelist`) | Group Policy or `HKLM\Software\Policies\Google\Chrome\ExtensionInstallForcelist` |
| Atomic move | `os.replace` on APFS | `os.replace` on NTFS — same volume only |
| AV interference | Rare | Defender may hold the file handle briefly — retry required (§3.6 step 6) |
| Filename limits | Permissive | `< > : " / \ | ? *` forbidden, reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`), no trailing dot/space, 260-char path unless long paths enabled |

**A laptop as an always-on node is workable but slightly worse than a desktop** — battery, thermals, and the ordinary risk that someone picks it up and leaves. If the Windows laptop is the choice, run it on mains power, lid configured to stay awake, wired if possible.

**Note on filenames:** because editors are on mixed platforms, sanitization (FR-3.6) is required **even if the node is macOS**. A file named `Whats Next? - Artlist.wav` created on the Mac will sync fine and then be unopenable for a Windows editor.

### 3.8 Google Chat Ingestion (primary path)

**This answers "where does the editor send the link."**

The org is on Google Workspace, so Google Chat is where the team already is. A Chat app is configured with **Cloud Pub/Sub** as its connection mode rather than an HTTP endpoint.

**Why Pub/Sub and not an HTTPS webhook.** An HTTP-endpoint Chat app requires a publicly reachable HTTPS URL, which for a node on the office LAN means a tunnel (Cloudflare Tunnel, ngrok) and an inbound path into the network — directly contrary to §5.1's "no external exposure." With Pub/Sub, Google publishes events to a topic and **the node pulls them over an outbound connection**. No inbound port, no tunnel, no firewall change. Google documents Pub/Sub as the intended mode for Chat apps behind a firewall. It also means editors can submit from home, from a phone, or off the corporate network — none of which the LAN-only web portal supports.

**Flow:**

```
Editor pastes link in #artlist-library
      │
      ▼
Google Chat API  ──publishes event──▶  Pub/Sub topic
                                            │
                        node pulls (outbound, long-lived)
                                            ▼
                                   Job Service subscriber
                                            │
                    ┌───────────────────────┴──────────────────┐
                    ▼                                          ▼
            cache hit (<3s)                            queued -> download
                    │                                          │
                    └──────────► Chat REST API (outbound) ◄─────┘
                                 reply in the same thread
```

**Setup (one-time, needs a Workspace admin):**

1. GCP project; enable the **Google Chat API** and **Cloud Pub/Sub API**.
2. Create the Pub/Sub topic and a **pull** subscription.
3. In the Chat API configuration, set connection type to **Cloud Pub/Sub** and name the topic.
4. Grant `chat-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role on that topic — this is the grant that lets Chat deliver into it, and it is the step most commonly missed.
5. Create a service account for the node with **Pub/Sub Subscriber** on the subscription and the `chat.bot` scope for replying. Key file stored on the node (§5.1).
6. Publish the app **internally to the org** and have the Workspace admin allow it. **This is an external dependency with a lead time — start it in Phase 0, not Phase 3.**

**Interaction design:**

| Editor action | Bot response |
| --- | --- |
| Pastes an Artlist link | Cache hit → path, in-thread, <3s. Miss → "Queued, position 2, ~2 min" then a follow-up in the same thread when done. |
| `/find piano ambient` | Card listing matching library tracks with paths. Turns a would-be download into a cache hit — the `RSK-12` mitigation. |
| `/status` | Queue depth, today's usage, pause state. |
| Pastes a non-Artlist link | Ignored silently (avoids noise in a shared space). |

**Identity (E-2).** The event carries `message.sender.email`, verified by Google. The service uses it for `requested_by` and ignores any client-supplied value. This closes a real hole: v1.2's `requested_by` was free text, so the "central licence record" recorded whatever the caller typed. It also removes bearer-token distribution from the primary path — no shared secret to leak for Chat submissions.

**Fallback if Pub/Sub is refused or delayed by IT:** the web portal (§3.3) is fully functional on its own and requires no Google configuration. Ship the portal in Phase 3 regardless; Chat is an additive front end, and the design must not become unshippable if admin approval stalls.

### 3.9 Interaction Pacing

Paced to stay well inside normal human usage rates — being a well-behaved client on a licensed account, not concealment. **Values below are canonical**; the risk document defers to these.

```text
[Tab created, active: true]        <- see RSK-08 and §3.9.1
      │
      ▼ wait 3.5s - 6.5s      (page render, SPA hydration, asset load)
[Dismiss known modals / cookie banners]
      │
      ▼ wait 1.2s - 2.4s
[Click download trigger]
      │
      ▼ wait 0.8s - 1.6s      (popover transition)
[Select variant + lossless WAV option]
      │
      ▼ AWAIT chrome.downloads.onCreated  -> capture downloadId
[Close tab immediately — downloads are browser-level, not tab-level]
      │
      ▼ AWAIT chrome.downloads.onChanged -> state === "complete"
      │  (tracked by the service worker after the tab is gone; ceiling 180s)
[POST /worker/jobs/{id}/downloaded]
      │
      ▼ cooldown 8s - 15s
[Claim next job]
```

**Completion detection.** The extension MUST register `chrome.downloads.onCreated` to capture the `downloadId` for the job's tab; close the tab at that point; then listen on `chrome.downloads.onChanged` for that ID until `state.current === "complete"`; read `filename` and `bytes` via `chrome.downloads.search({ id })`; treat `interrupted` as a failure with the `error` string attached; and fail at a 180s ceiling. Closing at `onCreated` rather than at completion is deliberate — it frees the tab in ~15–25s instead of holding it for the whole transfer, and the download is unaffected.

#### 3.9.1 Tab visibility and throttling (`RSK-08`)

**FR-2.1 is inverted from v1.2: job tabs open `active: true`.**

The reason is **SPA hydration, not timer throttling.** In a background tab `IntersectionObserver` does not fire, lazy-loaded components and virtualized lists do not populate, and the download control may never render at all — so the click target does not exist. Timer throttling is the weaker concern: background `setTimeout` clamps to roughly 1/sec, and every delay above is ≥800ms, so a 15–40s tab barely feels it.

**`active: true` alone is not sufficient.** A minimized, occluded, or locked-session Chrome window is treated as hidden regardless of which tab is selected — so on a lid-closed node or after a screen lock, the relay would break silently. Launch Chrome with:

```
--disable-background-timer-throttling
--disable-backgrounding-occluded-windows
--disable-renderer-backgrounding
```

With those flags the visibility question stops mattering, which is the actual robust fix. Keep `active: true` as well; the two together are belt and braces, and the node is unattended so a foreground tab costs nothing.

> **Honesty note on detection.** v1.0 asserted a "0% bot-detection signature." That is not supportable for this architecture. An MV3 content script cannot dispatch a trusted input event; `element.click()` and synthetic `MouseEvent`s carry `isTrusted === false`, and jitter does not change that. `navigator.webdriver === false` is true but is not the surface that matters. The only MV3 path to trusted input is `chrome.debugger` (CDP), which this design rejects on other grounds. Most sites do not gate downloads on `isTrusted`, so this is very likely to work — plan it as "very likely to work," not "undetectable." The defensible position is §2.1's: a real authenticated session on a licensed account, strictly serialized, well under the account's own allowance. **Containment is the real mitigation:** the worst realistic outcome is one restricted account while five editors keep working on theirs.

---

## 4. Functional Requirements

### 4.1 Library Cache, Queue & Quota

* **FR-1.1:** MUST reject any URL whose host is not `artlist.io`, and any URL with no parseable track ID.
* **FR-1.2:** On submission, MUST check the cache by `(track_id, variant)` **before anything else**. On hit, MUST `stat` the recorded `library_path`: if present, respond `cached`, increment `hit_count` and `counters.cache_hits`, spend no quota. If the file is gone, evict the row and queue normally.
* **FR-1.3:** MUST reject a submission whose `(track_id, variant)` is already `queued` or in flight, returning the existing `job_id`.
* **FR-1.4:** MUST maintain a daily counter on node-local date, incremented **only on successful download**. Cache hits and failures MUST NOT consume quota.
* **FR-1.5:** MUST hard-stop at 35 successful downloads/day; alert at 30. Quota-exhausted responses MUST name the personal-seat fallback.
* **FR-1.6:** MUST serialize strictly — exactly one job `claimed`/`downloading` at any moment.
* **FR-1.7:** All queue, cache, and counter state MUST persist in SQLite (WAL, single writer) and survive restart.
* **FR-1.8:** MUST expose library search over both HTTP (`GET /api/v1/library`) and Chat (`/find`). This is what produces cache hits rather than merely counting them.
* **FR-1.9:** On startup, MUST reconcile `tracks` against the actual contents of `LIBRARY_PATH` — evicting rows whose files are gone, and indexing files present on disk but absent from the table (e.g. dropped in manually after a `429`).

### 4.2 Extension & DOM Automation

* **FR-2.1 (inverted in 1.3):** Job tabs MUST open with `active: true`, and Chrome MUST run with the three throttling flags in §3.9.1.
* **FR-2.2:** MUST handle SPA DOM variations via a single `SELECTORS` dictionary at the top of `content.js`, each step an ordered array of fallback strategies (`data-testid`, `aria-label`, resilient text matchers).
* **FR-2.3:** MUST run a pre-flight modal/banner dismissal pass before targeting download controls.
* **FR-2.4:** MUST detect completion via `chrome.downloads` events, never a fixed timer (§3.9).
* **FR-2.5:** MUST close the job tab at `onCreated` and continue tracking completion in the service worker.
* **FR-2.6:** MUST fail a job — 20s per-step selector timeout, 180s overall — and POST to `/worker/jobs/{id}/failed` with a machine-readable reason.
* **FR-2.7:** MUST use `chrome.alarms` (30s) as its wake source, not `setInterval` (§3.5).
* **FR-2.8:** MUST heartbeat the relay account's authentication state.
* **FR-2.9:** MUST select the requested `variant`, defaulting to Main Track, and MUST fail rather than silently download a different variant than requested.

### 4.3 Storage & Delivery

* **FR-3.1:** Chrome's download directory MUST be `STAGING_PATH`, a local folder no sync client watches.
* **FR-3.2:** *"Ask where to save each file before downloading"* MUST be OFF.
* **FR-3.3:** Files MUST enter `LIBRARY_PATH` only via the §3.6 handoff — size-checked, header-checked, atomically replaced, never under a `.crdownload` name.
* **FR-3.4:** The service MUST detect same-volume vs cross-volume at startup, log the mode, and use `os.replace` or verified-copy accordingly.
* **FR-3.5:** `filename` and `library_path` MUST be recorded on the job and returned by the status endpoint and the Chat reply.
* **FR-3.6 (new):** Filenames MUST be sanitized before entering the library, on every platform: strip `< > : " / \ | ? *`, strip trailing dots and spaces, avoid Windows reserved device names, normalize Unicode to NFC, and cap the basename so the full path stays under 260 characters. Editors are on mixed platforms; an unsanitized name created on macOS is unopenable on Windows.
* **FR-3.7 (new):** MUST retry the handoff with backoff on `PermissionError` (5 attempts, ~10s) to survive AV file locks.

### 4.4 Notification & Feedback

* **FR-4.1:** Every submission MUST return a `job_id`.
* **FR-4.2:** `GET /api/v1/jobs/{job_id}` MUST report terminal state with either a `library_path` or a human-readable `error`.
* **FR-4.3:** Chat submissions MUST be answered **in the originating thread** — immediately for cache hits, and again on completion or failure for queued jobs.
* **FR-4.4:** On job failure and queue pause, the service MUST alert the team lead via the Chat space.
* **FR-4.5:** The web portal MUST lead with the **library search box**, not the submit box — searching first is the behaviour the system exists to create (`RSK-12`).

### 4.5 Storage Lifecycle & Retention (new in 1.3)

`RSK-11`. Nothing in v1.2 budgeted, monitored, or bounded storage. At ~60MB per WAV, even 10 tracks/day is ~18GB/month, growing forever, against a finite Drive quota — 15GB on a bare account, and consumed on the *relay account's personal quota* under sync Option A.

* **FR-5.1:** Before accepting a job, MUST check both local free disk and remaining Drive quota. Below threshold → `507 Insufficient Storage` with an actionable message.
* **FR-5.2:** MUST record library size and Drive quota headroom in `health` and expose them on `/api/v1/status`.
* **FR-5.3:** MUST alert the team lead at **80%** of Drive quota, and pause new downloads at **95%**.
* **FR-5.4:** MUST report the library's top-N largest and least-used tracks (`hit_count = 0`, older than 6 months) to support manual pruning. **Automatic deletion is explicitly out of scope** — these are licensed assets and a project may reference one years later.
* **FR-5.5:** Staging dir garbage collection: startup sweep purges unreferenced files older than 1 hour; a nightly job purges orphans not tied to an in-flight job.
* **FR-5.6:** A retention decision MUST be made before Phase 1 — confirm the relay account's Drive quota and, at the expected rate, how many months of runway that buys. If under 12 months, choose sync Option B (Shared Drive, pooled org quota) instead.

---

## 5. Non-Functional & Security Requirements

### 5.1 Access Control

* **Chat path:** identity comes from Google. `message.sender.email` is verified; no shared secret is involved in the primary submission path.
* **Portal path:** bearer token from an environment variable, plus subnet allowlist (`192.168.0.0/16`, `10.0.0.0/8`, `127.0.0.1`) as defense in depth. **Token rotation procedure:** change the env var, restart the service, redistribute out of band — documented in the runbook, because "rotate the token" with no procedure is not a control.
* **Worker routes** bound to loopback and rejected from any non-loopback source.
* **Service-account key** for Pub/Sub and Chat stored with restrictive file permissions on the node, scoped to `pubsub.subscriber` on the one subscription plus `chat.bot`. Nothing broader. This key is the most sensitive artifact on the machine.
* **Audit log:** every submission records timestamp, verified `requested_by`, source, `track_id`, `variant`, and outcome. This is the central licence record §1.2 identified as missing — and it is only trustworthy because identity is verified (E-2).
* **No external exposure.** The node accepts no inbound connections from outside the LAN. Pub/Sub is pull-only. No Selenium, Puppeteer, or CDP debug port is ever opened.

### 5.2 Resilience

* Per-step selector timeout 20s; overall job ceiling 180s.
* Stale-claim reaper requeues once (`attempts < 2`), then fails permanently.
* **Circuit breaker:** after 3 consecutive job failures, set `queue_paused` and alert — stops quota burn against a changed frontend.
* Startup sweep reconciles jobs left in `moving`, plus library reconciliation (FR-1.9) and staging GC (FR-5.5).
* **Nightly SQLite backup** (`VACUUM INTO` a timestamped file inside `LIBRARY_PATH`, so it syncs to Drive with everything else). Keep 14 days. The `tracks` table is the licence record and the cache; losing it loses both (`RSK-15`).

### 5.3 Session Health

* The extension reports the relay account's authentication state on each heartbeat.
* If `authenticated` is false, or no heartbeat arrives for 15 minutes, the queue pauses and submissions get `503` naming the personal-seat fallback.
* Recovery is a human logging back into Artlist in Chrome on the node; the next successful heartbeat clears the pause.

### 5.4 Compliance

Automated interaction with Artlist is very likely restricted by their terms of service regardless of how the traffic is paced. v1.0's framing — "mask automation patterns," "0% bot-detection signature" — made evasion the stated objective rather than a side effect; that framing is removed throughout.

The substance is defensible: licensed downloads, on a paid team plan, delivered to seat-holding editors who each already hold their own licence, at a rate below the account's own daily allowance. Two things strengthen the position over v1.0: the five editors are individually licensed, so the library is not serving unlicensed users; and automation is confined to one account, so normal work does not depend on it.

**Required before Phase 1:** someone with authority reads the current Artlist team-plan terms and confirms (a) whether automated access is permitted or tolerable, and (b) whether a shared org library assembled under one seat and used by five other seat-holders is consistent with the licence. **(b) is the one that matters**, and it is a question about the licence, not the technology.

---

## 6. Implementation Roadmap

### Phase 0: Decisions & Long-Lead Items (1 day) — **BLOCKING**

* [ ] **Start the Google Chat app approval now.** GCP project, Chat API, Pub/Sub topic, Workspace admin allowlisting. External dependency with a lead time — everything else can proceed in parallel, but this cannot be compressed later.
* [ ] **Node choice:** Mac or the Windows laptop (§3.7). Confirm it can stay powered, awake, wired, and logged in.
* [ ] **Relay account:** 6th subscription, or one of the 5 repurposed?
* [ ] **Sync mode:** mirrored folder (A) or Shared Drive (B)? (§3.6.1)
* [ ] **Drive quota runway** (FR-5.6). If under 12 months at the expected rate, pick B.
* [ ] **ToS check**, especially §5.4(b).
* [ ] **Confirm §1.2 is the real driver.** Making cache hit rate the headline KPI follows from it.

### Phase 1: Node, Paths & Sync Verification (Day 1)

* [ ] Configure the node per §3.7 — supervision, auto-login, sleep, lid, updates, extension policy.
* [ ] Create `STAGING_PATH` and `LIBRARY_PATH` on the same volume; confirm `os.replace` between them succeeds.
* [ ] Add `LIBRARY_PATH` to Drive for Desktop; share it; complete per-editor setup **including Available offline** (§3.6.2).
* [ ] **Manual sync test:** drop a 60MB WAV in, time the round trip to an editor's machine. Sets the end-to-end KPI baseline.
* [ ] **Partial-file test:** confirm a `.crdownload` placed in `LIBRARY_PATH` does propagate to editors — validates *why* staging exists. Two minutes.
* [ ] **Cross-platform filename test:** create `Test: Whats Next?.wav` on the node, confirm behaviour on a Windows editor machine. Drives FR-3.6.
* [ ] Set Chrome's download dir to `STAGING_PATH`; "ask where to save" OFF; launch flags per §3.9.1.
* [ ] FastAPI service: WAL schema, job CRUD, cache + search, quota, reaper, startup reconciliation, disk/quota guards, nightly backup.
* [ ] Implement and unit-test the §3.6 handoff — `os.replace`, `PermissionError` retry, cross-volume fallback, sanitization.

### Phase 2: Chrome Extension (Day 1–2)

* [ ] MV3 boilerplate; **`chrome.alarms` wake loop, not `setInterval`** (§3.5).
* [ ] Build the `SELECTORS` dictionary against the live Artlist page, including variant selection. **Highest-unknown task in the project** — budget generously.
* [ ] Modal/banner dismissal pass.
* [ ] Tab lifecycle: `active: true`, close at `onCreated`, track `complete` in the worker.
* [ ] Failure reporting and heartbeat.
* [ ] Pack as `.crx`; force-install by policy; **verify it survives a Chrome update** (`RSK-13`).

### Phase 3: Interfaces (Day 2–3)

* [ ] **Web portal** — search box first, submit box second. Ships regardless of Chat approval status.
* [ ] **Google Chat app** — Pub/Sub subscriber, in-thread replies, `/find`, `/status`.
* [ ] Optional: Raycast / Apple Shortcut / PowerToys Run for clipboard submission.

### Phase 4: Integration Testing (Day 3–4)

* [ ] **Cache test (primary):** submit, wait for `done`, resubmit → `cached` in <3s via Chat, quota unchanged, `hit_count` incremented.
* [ ] **Variant test:** request the instrumental of a track already held as `main` → correctly treated as a new download, not a cache hit.
* [ ] **Stale-cache test:** delete a file from the library, resubmit → row evicted, job queued.
* [ ] **Reconciliation test:** drop a WAV in by hand, restart → indexed and served as a cache hit (FR-1.9).
* [ ] **MV3 idle test:** leave the queue empty 10 minutes, then submit → job starts within 30s. Directly validates `RSK-02`; would have failed on v1.2's design.
* [ ] **Chrome update test:** force an update, confirm the extension survives and the relay resumes.
* [ ] **Lock-screen test:** lock the node, submit a job → completes. Validates §3.9.1's flags.
* [ ] **Concurrency test:** 5 simultaneous submissions → strict serialization, no `database is locked`, correct queue positions.
* [ ] **Integrity test:** every delivered `.wav` opens in Premiere and Resolve; **no `.crdownload` ever appeared in `LIBRARY_PATH`**.
* [ ] **Cross-platform test:** a track with `:` and `?` in its title opens on both a Mac and a Windows editor machine.
* [ ] **Kill test:** force-quit Chrome mid-download → reaper requeues, no partial in the library, no leaked quota.
* [ ] **AV-lock test (Windows node):** confirm the `PermissionError` retry path actually fires and succeeds.
* [ ] **Session-expiry test:** log the relay account out → `503` naming the fallback, no quota burned.
* [ ] **Selector-drift test:** break a selector → clean failure, 3 failures pause the queue, alert fires in Chat.
* [ ] **Quota test:** drive to 35 → `429` with correct `resets_at` and fallback text; verify midnight reset.
* [ ] **Storage guard test:** simulate low disk → `507`.
* [ ] Measure end-to-end p95 at depth 3 against the Phase 1 baseline.

---

## 7. Risks

Full analysis lives in `Risk-Assessment-and-Mitigation-Strategy-v1.1.md`. The three that most shape this design:

| Risk | Why it shapes the design |
| --- | --- |
| `RSK-12` — editors don't check the library first | The **top risk to the project's value**. If people go straight to Artlist, this is a slower way to download. Drives search-first portal (FR-4.5), `/find` in Chat, and cache hit rate as the headline KPI. |
| `RSK-11` — cloud storage exhaustion | Unbounded growth against a finite quota. Drives §4.5 in its entirety and the Phase 0 runway check. |
| `RSK-02` — MV3 service worker hibernation | Would have silently broken the relay as specified in v1.2. Drives §3.5. |
