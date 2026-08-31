# Product Requirement Document (PRD)

**Project Name:** Shared Artlist Asset Library & Download Relay

**Document Version:** 1.2.0 (supersedes 1.1.0, 1.0.0)

**Target Platform:** macOS (Dedicated Node) + Cross-Platform Client Interfaces

**Primary Objective:** Build a shared, org-owned Artlist asset library that any editor can add to with one link submission, so a track is licensed and downloaded once and then available to the whole team — without spending anyone's personal download quota and without manual Drive uploads.

---

## 0. Changelog

### 1.2.0 (this revision)

| # | Change | Reason |
| --- | --- | --- |
| D-1 | **Phase 0 gate closed.** All 5 editors already have working seats and use them. The relay runs on **one designated account**. | Confirmed by the team. The v1.1 gate existed to test exactly this; it is answered. |
| D-2 | **Problem statement and goals rewritten.** No longer "editors walk to a dedicated workstation." Now: shared library, quota preservation, license traceability. | With 5 working seats, nobody walks anywhere. The old §1.2 described a workflow that no longer exists, and the old headline goal ("Zero Walking Friction") measured the wrong thing. |
| D-3 | **Delivery is now local-folder-plus-Drive-sync**, not a write into the `CloudStorage` virtual mount. Staging and library are both real local dirs on the same volume → the move becomes an **atomic `os.rename`**. | Team preference, and strictly better: no 60MB copy, no partial-file window at all, instant. |
| D-4 | **`STAGING_PATH` / `LIBRARY_PATH` are config vars**; the service auto-detects same-volume vs cross-volume and picks `rename` or verified-copy accordingly. | Makes the Mirror-vs-Stream decision (§3.5.1) a config change rather than a rewrite. |
| D-5 | **Quota reframed as an additive pool, not a bottleneck.** Relay account contributes ~35/day on top of the editors' own 5 × 40. | v1.1 §7 flagged centralization as a five-person bottleneck. That risk is gone: the relay adds capacity, and the personal-account fallback always exists. |
| D-6 | **Blast-radius containment stated explicitly.** If the relay account is ever flagged, the 5 editors' accounts are unaffected and work continues. | A genuine benefit of the one-account design, worth stating as a design property rather than leaving implicit. |
| D-7 | **Dedup cache promoted from optimization to core feature.** | It is now the main value of the system, not a nice-to-have. See §1.3. |

### 1.1.0 (retained — corrections to 1.0.0)

| # | Change | Reason |
| --- | --- | --- |
| C-2 | Staged download + verified handoff instead of downloading into the sync target. | Chrome writes `*.crdownload` then renames; a sync client will propagate the partial and chase the rename. Still applies in 1.2 (§3.5). |
| C-3 | Event-driven completion via `chrome.downloads.onChanged`. | v1.0's fixed 4.0s wait is a guess against 30-80MB files. |
| C-4 | Detection framing rewritten. | MV3 content scripts cannot emit trusted events; the "0% signature" claim was unsupportable (§3.6). |
| C-5 | Track-level dedup cache. | Duplicate requests were spending quota twice. |
| C-6 | Job IDs, status endpoint, returned filename. | v1.0 never told an editor what their file was called or whether it landed. |
| C-7 | Session health check + queue auto-pause. | An expired Chrome session would fail every job silently, forever. |
| C-8 | SQLite mandated over in-memory. | A restart would silently reset the quota guard. |
| C-9 | Bearer-token auth over subnet-only. | Anyone on office wifi could drain the quota, unattributably. |
| C-10 | Latency KPIs recomputed. | v1.0's own sample response contradicted its own timing table. |

---

## 1. Executive Summary & Problem Statement

### 1.1 Context

The team runs a 5-member Artlist team subscription. **All five editors have their own working seats and use them directly** — there is no shared-credential workstation and no access bottleneck.

A **sixth designated account** (or one seat set aside for this purpose — see the open question below) drives an automated relay on a dedicated Mac, which builds a shared asset library in Google Drive.

> **Open question for the team:** is the relay account a separate 6th subscription, or one of the 5 seats repurposed? If it is one of the 5, one editor loses their personal seat and this needs saying out loud before Phase 1. The rest of this document works either way; only the seat accounting changes.

### 1.2 Problem

With every editor able to download for themselves, the remaining friction is not *access* — it is *duplication and dispersal*:

1. **The same track gets licensed and downloaded five times.** Editor A finds a good bed; three weeks later Editor C needs the same one and downloads it again, spending their own daily quota on a file the team already owns.
2. **No shared library exists.** Downloads land in each editor's local Downloads folder. There is no team-wide place to look before searching Artlist, so nobody looks.
3. **Manual Drive upload is the only sharing path.** Getting a track to a colleague means download → find file → upload to Drive → tell them. That step is skipped under deadline, which is why (2) persists.
4. **Personal quota is the scarce resource.** Each editor's 40/day is consumed by re-downloads of tracks the org already has a licence for.
5. **No central licence record.** Which tracks the org has licensed, when, and for what project, is spread across five machines.

### 1.3 Solution

A relay on a dedicated Mac that turns any submitted Artlist link into a permanent entry in a shared, org-owned library:

* A local job API (FastAPI + SQLite) with FIFO queue, quota accounting, and — centrally — a **track cache**.
* An MV3 Chrome Extension driving the download inside the relay account's authenticated session, strictly one job at a time.
* A **local staging dir** for Chrome's downloads, and a **local library dir that Google Drive syncs**. The move between them is atomic.

**The dedup cache is the core of the value, not an optimization.** Submitting a track the library already holds returns its path in under a second, spends zero quota, and downloads nothing. Over time most requests become cache hits, and the relay's ~35/day covers only genuinely new music.

```
┌──────────────────────────────────────────────────────────┐
│  Editor Workstations (x5)  — each with their own seat    │
│  Web UI / Slack / Raycast / Apple Shortcut               │
└───────────────┬──────────────────────────────▲───────────┘
                │ POST /api/v1/jobs            │ cached path (instant)
                │ (Bearer token)               │ or job status + filename
                ▼                              │
┌──────────────────────────────────────────────┴───────────┐
│  Dedicated Node (macOS) — relay account                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Job Service (FastAPI / SQLite / Port 5000)         │  │
│  │ - TRACK CACHE: hit => 0 quota, instant answer      │  │
│  │ - FIFO queue, single in-flight job                 │  │
│  │ - Daily counter, stale-claim reaper                │  │
│  └───────┬────────────────────────────────▲───────────┘  │
│          │ GET /worker/next (127.0.0.1)   │ downloaded / │
│          ▼                                │ failed       │
│  ┌───────────────────────────────────────┴────────────┐  │
│  │ Native Chrome (relay account session)              │  │
│  │ - MV3 Extension, background tab                    │  │
│  │ - Paced interaction delays                         │  │
│  │ - chrome.downloads.onChanged -> state "complete"   │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │ writes to                     │
│                          ▼                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │ STAGING_PATH  ~/ArtlistRelay/staging/              │  │
│  │ local disk, NOT synced, NOT watched by Drive       │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │ os.rename()  <- ATOMIC        │
│                          │ same volume, instant          │
│                          ▼                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │ LIBRARY_PATH  ~/ArtlistRelay/library/              │  │
│  │ ordinary local folder that Google Drive syncs      │  │
│  └───────────────────────┬────────────────────────────┘  │
└──────────────────────────┼───────────────────────────────┘
                           │ Google Drive sync (uplink-bound)
                           ▼
┌──────────────────────────────────────────────────────────┐
│  Shared Artlist Library — visible to all 5 editors       │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Goals & Success Metrics

### 2.1 Primary Goals

* **License Once, Use Forever.** Any track the org has licensed is permanently available to all five editors without a second download.
* **Preserve Personal Quota.** Editors stop spending their own 40/day on tracks the team already owns. The relay's quota is additive capacity, not a replacement.
* **File Integrity.** Every file that appears in the library is complete and playable. No partial or `.crdownload` artifacts ever reach the synced folder.
* **Zero Manual Handling.** Submit a link, get a path. No downloading, finding, uploading, or telling anyone.
* **Central Licence Record.** One queryable record of what was licensed, when, by whose request.
* **Contained Blast Radius.** All automation runs on one designated account. If that account is ever restricted, the five editors' accounts and their day-to-day work are untouched, and the fallback is the workflow they already use today.

> **Removed in 1.2:** "Zero Walking Friction." With five working seats, nobody walks anywhere — that goal measured a problem that no longer exists.
> **Removed in 1.1:** "100% Account Safety / 0% bot-detection signature." Not achievable as specified — see §3.6.

### 2.2 Key Performance Indicators

| KPI | Target | Definition |
| --- | --- | --- |
| **Cache hit rate** | ≥ 40% by month 3 | Share of submissions answered from the library. **The headline metric** — it is the whole point of the system. |
| **Cache hit response** | < 1s | Submission → `cached` response with a valid path. |
| Personal quota displaced | ≥ 150 tracks/month | Cache hits + relay downloads = downloads editors did not spend their own quota on. |
| Download success rate | ≥ 98% | Valid, in-catalog URLs reaching `done`, rolling 7 days. Excludes cache hits. |
| Per-item processing time | median ≤ 45s | Job dequeue → file verified in `LIBRARY_PATH`. Excludes Drive sync. |
| End-to-end at depth ≤ 3 | p95 ≤ 3 min | Submission → file on a requesting editor's machine, including Drive sync. Baseline measured in Phase 1. |
| Wasted-quota rate | 0 | Downloads spent on a track already in the library. |
| Daily relay quota | hard stop at 35 | Successful downloads only. Cache hits and failures do not count. Alert at 30. |

> **Latency note:** per-item cost is ~12-20s of interaction + 5-40s of transfer + an 8-15s cooldown = **25-75s per item**. A queue of 5 drains in 2-6 minutes. KPIs above are per-item-from-dequeue, with a separate end-to-end figure that names its assumed queue depth. Drive sync time is not under this project's control and is measured separately in Phase 1.

---

## 3. System Architecture & Technical Specifications

### 3.1 Component Overview

| Component | Technology | Responsibility |
| --- | --- | --- |
| **Client Ingestion** | HTTP REST / Web UI / Shortcut / Slack | Accepts URLs, validates, authenticates, submits, surfaces status. |
| **Job Service** | Python 3.11 + FastAPI + SQLite | Track cache, FIFO queue, single in-flight job, quota accounting, stale-claim reaping, staging→library handoff. |
| **Execution Engine** | Chrome Extension (Manifest V3) | Claims jobs, drives the page, waits on real download-complete events, reports back. |
| **`STAGING_PATH`** | Local disk, unsynced | Chrome's download target. Never watched by any sync client. |
| **`LIBRARY_PATH`** | Local disk, Drive-synced | The shared library. Receives only complete files. |
| **Sync** | Google Drive for Desktop | Propagates `LIBRARY_PATH` to the five editors. Configuration only — no code depends on it. |

### 3.2 Data Model (SQLite)

```sql
CREATE TABLE jobs (
  id             TEXT PRIMARY KEY,        -- uuid4
  url            TEXT NOT NULL,
  track_id       TEXT NOT NULL,           -- parsed from URL, dedup key
  requested_by   TEXT NOT NULL,
  format         TEXT NOT NULL DEFAULT 'WAV',
  status         TEXT NOT NULL,           -- queued|claimed|downloading|moving|done|failed|cached
  temp_filename  TEXT,                    -- absolute path under STAGING_PATH
  filename       TEXT,                    -- final basename
  library_path   TEXT,                    -- absolute path under LIBRARY_PATH
  bytes          INTEGER,
  error          TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  claimed_at     TEXT,
  completed_at   TEXT
);
CREATE INDEX idx_jobs_status ON jobs(status, created_at);

-- The library index. This table IS the product.
CREATE TABLE tracks (
  track_id       TEXT PRIMARY KEY,
  title          TEXT,                    -- slug from URL, for search
  filename       TEXT NOT NULL,
  library_path   TEXT NOT NULL,
  bytes          INTEGER NOT NULL,
  first_job_id   TEXT NOT NULL,
  requested_by   TEXT NOT NULL,           -- who first licensed it
  downloaded_at  TEXT NOT NULL,
  hit_count      INTEGER NOT NULL DEFAULT 0   -- times served from cache
);

CREATE TABLE counters (
  day            TEXT PRIMARY KEY,        -- YYYY-MM-DD, local time
  downloads      INTEGER NOT NULL DEFAULT 0,
  cache_hits     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE health (
  k              TEXT PRIMARY KEY,        -- session_authenticated | last_heartbeat | queue_paused
  v              TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
```

`track_id` is parsed from the URL path (`.../song/<slug>/<id>` → `<id>`). Dedup keys on the ID, not the full URL, because slugs and query strings vary for the same track. `hit_count` and `counters.cache_hits` back the headline KPI.

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

**200 OK** — cache hit. No quota spent, nothing downloaded. The common case at steady state:

```json
{
  "job_id": "3c9a1d22-7b40-4e88-a2f1-6d5c0e9b7714",
  "status": "cached",
  "filename": "Ambient_Sunrise__Artlist.wav",
  "library_path": "Artlist Library/Ambient_Sunrise__Artlist.wav",
  "first_licensed_by": "editor_3",
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
  "estimated_wait_seconds": 95,
  "daily_usage": "14/35"
}
```

**400 Bad Request** — not an Artlist track URL, or no parseable track ID.
**401 Unauthorized** — missing or invalid token.
**403 Forbidden** — source IP outside the allowed subnets.

**429 Too Many Requests** — relay quota exhausted. Note the message: the editor has their own seat, so this is a minor inconvenience, not a blocker:

```json
{
  "status": "rejected",
  "error": "Relay quota reached (35/35) for today. Download on your own Artlist seat and drop the file in the library folder, or resubmit after midnight.",
  "resets_at": "2026-08-20T00:00:00+05:30"
}
```

**503 Service Unavailable** — queue paused (session expired or failure threshold tripped). Same fallback applies.

#### `GET /api/v1/jobs/{job_id}`

Terminal state with `filename` + `library_path`, or a human-readable `error`.

#### `GET /api/v1/library?q=<search>`

Searches the `tracks` table by title/filename. Lets an editor check the library **before** going to Artlist at all — this is what converts a would-be download into a cache hit. Backs the web UI's search box.

#### `GET /api/v1/status`

Queue depth, in-flight job, `daily_usage`, today's `cache_hits`, `session_authenticated`, `queue_paused`.

### 3.4 Worker API (extension only)

Bound to `127.0.0.1`, rejected from any other source. The extension polls every 5s.

| Route | Purpose |
| --- | --- |
| `GET /api/v1/worker/next` | Atomically claims the oldest `queued` job → `claimed`. Returns `204` when the queue is empty or paused. Never hands out a second job while one is in flight. |
| `POST /api/v1/worker/jobs/{id}/downloaded` | Body `{ "temp_filename": "...", "bytes": 62914560 }`. Triggers the handoff (§3.5). |
| `POST /api/v1/worker/jobs/{id}/failed` | Body `{ "reason": "selector_timeout" }`. Increments `attempts`. |
| `POST /api/v1/worker/heartbeat` | Body `{ "authenticated": true }`, every 5 min. Drives §5.3. |

**Stale-claim reaper:** any job in `claimed`/`downloading` with `claimed_at` older than 180s is failed and requeued once (`attempts < 2`). Prevents a crashed service worker from wedging the queue.

### 3.5 File Delivery — Staging and Atomic Handoff

**FR-3.1 (revised in 1.2):** Chrome's default download directory MUST be `STAGING_PATH` — an ordinary local folder that **no sync client watches**:

```
STAGING_PATH = ~/ArtlistRelay/staging/
LIBRARY_PATH = ~/ArtlistRelay/library/     # this is the folder Google Drive syncs
```

Both live on the same volume. Neither is under `~/Library/CloudStorage/`.

**Why staging is still required even though the library is now a plain local folder.** Chrome does not write `track.wav`. It writes `track.wav.crdownload`, grows it in place, and renames it on completion. Any sync client watching that folder will upload the partial file, propagate it to all five editors, and then have to chase the rename — and an aborted download leaves a partial artifact in the shared library permanently. This is true of a synced local folder exactly as it was true of the virtual mount. The staging dir is what keeps Drive from ever seeing an incomplete file.

**Why this revision is better than 1.1.** Because `STAGING_PATH` and `LIBRARY_PATH` are on the same volume, the handoff is `os.rename()` — atomic, instant, no data copied. There is no window in which a partially-written file exists under the final name. v1.1 had to copy 60MB across a device boundary into the virtual mount and then verify the result, because `rename` cannot cross filesystems. The team's suggested layout removes that entire failure mode rather than mitigating it.

**Handoff procedure**, on receipt of `/downloaded`:

1. Assert `temp_filename` resolves inside `STAGING_PATH` (reject path traversal) and does not end in `.crdownload`.
2. `stat` it; assert the size matches the `bytes` the extension reported.
3. Verify the RIFF/WAVE header (first 12 bytes: `RIFF....WAVE`).
4. Compute the destination under `LIBRARY_PATH`. If that name exists, suffix ` (2)`, ` (3)`, … — never overwrite.
5. **`os.rename(staging, library)`** — atomic. Drive observes a complete, correctly named file appearing in one step.
6. Write the `tracks` row, increment `counters.downloads`, mark the job `done`.

**Cross-volume fallback.** If the two paths land on different filesystems (e.g. `LIBRARY_PATH` is later pointed at a streamed Shared Drive mount), `os.rename` raises `EXDEV`. The service MUST detect this **at startup**, log which mode it is in, and fall back to single-pass `shutil.copy2` + destination size re-verification + `unlink` of the staging copy — the v1.1 procedure. A startup sweep re-verifies any job left in `moving`. Same behaviour, one config change, no code rewrite.

#### 3.5.1 Google Drive sync mode — decision required

Both options work with the design above; only `LIBRARY_PATH` changes.

| | **A. Mirrored folder** (matches the team's stated preference) | **B. Shared Drive, streamed** |
| --- | --- | --- |
| `LIBRARY_PATH` | `~/ArtlistRelay/library/`, added to Drive for Desktop as a synced folder | `~/Library/CloudStorage/GoogleDrive-<acct>/Shared drives/<Team>/Artlist/` |
| Handoff | **Atomic `os.rename`** | Verified copy (cross-device) |
| Local copy on relay Mac | Yes — full local copy, works offline | No — virtual, needs network |
| File ownership | The relay account | The organisation |
| Counts against | Relay account's Drive storage | Shared Drive storage |
| Editor access | Share the folder; each editor adds a shortcut to their own Drive — **one-time setup per editor** | Appears automatically for all Shared Drive members |
| Account deprovisioned | **Files at risk** — owned by that account | Files survive; org owns them |

**Recommendation:** start with **A** as requested — it is simpler, faster, and gives the atomic handoff. Accept two consequences deliberately: the one-time shortcut setup for each of the five editors, and the fact that the library is owned by the relay account. If that account is ever deprovisioned, migrate the folder into a Shared Drive first.

If a Shared Drive already exists on the Workspace tier, **B** is the safer long-run home purely on ownership grounds, at the cost of the copy step. The service supports both; this is a config decision, not an architectural one.

### 3.6 Interaction Pacing

The extension paces its interactions to stay well inside normal human usage rates — being a well-behaved client on a licensed account, not concealment. See the note below.

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

**Completion detection.** The extension MUST:

* register `chrome.downloads.onCreated` to capture the `downloadId` initiated by the job's tab;
* listen on `chrome.downloads.onChanged` for that ID until `state.current === "complete"`;
* read `filename` and `bytes` via `chrome.downloads.search({ id })` and report both;
* treat `state.current === "interrupted"` as a job failure, with the `error` string attached;
* fail the job at a 180s ceiling.

v1.0's fixed 4.0s wait is not acceptable: a 60MB WAV does not reliably transfer in 4s, and a fixed wait leaves the service unable to know whether the file is whole. The event also supplies the final filename returned to the editor.

> **Honesty note on detection.** v1.0 asserted a "0% bot-detection signature." That is not supportable for this architecture. An MV3 content script cannot dispatch a trusted input event; `element.click()` and synthetic `MouseEvent`s carry `isTrusted === false`, and jitter does not change that. The only MV3 path to trusted input is `chrome.debugger` (CDP), which this design rejects on other grounds. In practice most sites do not gate downloads on `isTrusted`, so this is very likely to work — plan it as "very likely to work," not "undetectable." The defensible position is §2.1's: a real authenticated session on a licensed account, strictly serialized, well under the account's own allowance. **And note the containment property:** because this runs on one designated account, the worst realistic outcome is that one account is restricted while five editors keep working normally on theirs.

---

## 4. Functional Requirements

### 4.1 Library Cache, Queue & Quota

* **FR-1.1:** MUST reject any URL whose host is not `artlist.io`, and any URL with no parseable track ID.
* **FR-1.2:** On submission, MUST check the `tracks` cache by `track_id` **before anything else**. On hit, MUST `stat` the recorded `library_path`: if present, respond `cached` with the path, increment `hit_count` and `counters.cache_hits`, and spend no quota. If the file has been deleted from the library, evict the row and queue normally.
* **FR-1.3:** MUST reject a submission whose `track_id` is already `queued` or in flight, returning the existing `job_id` rather than creating a duplicate.
* **FR-1.4:** MUST maintain a daily counter keyed on local-time date, incremented **only on successful download**. Cache hits and failures MUST NOT consume quota.
* **FR-1.5:** MUST hard-stop at 35 successful downloads/day; alert the team lead at 30. Quota-exhausted responses MUST name the personal-seat fallback (§3.3).
* **FR-1.6:** MUST serialize strictly. Exactly one job may be `claimed`/`downloading` at any moment.
* **FR-1.7:** All queue, cache, and counter state MUST persist in SQLite and survive a service restart. In-memory state is not acceptable — a restart would silently reset the quota guard and lose the library index.
* **FR-1.8 (new):** MUST expose library search (`GET /api/v1/library?q=`) so editors can check the library before searching Artlist. This is the mechanism that produces cache hits rather than merely counting them.
* **FR-1.9 (new):** On startup, MUST reconcile the `tracks` table against the actual contents of `LIBRARY_PATH` — evicting rows whose files are gone, and indexing files present on disk but absent from the table (e.g. dropped in manually after a `429`).

### 4.2 Extension & DOM Automation

* **FR-2.1:** MUST operate in inactive background tabs (`active: false`).
* **FR-2.2:** MUST handle SPA DOM variations — direct download icon and secondary modal dropdown — via a single `SELECTORS` dictionary at the top of `content.js`, each step an ordered array of fallback selectors tried in sequence.
* **FR-2.3:** MUST close the job tab after reporting completion. Downloads are browser-level, not tab-level, so closing after the `complete` event is safe.
* **FR-2.4:** MUST detect completion via `chrome.downloads` events, never a fixed timer (§3.6).
* **FR-2.5:** MUST fail a job — 20s per-step selector timeout, 180s overall — closing the tab and POSTing to `/worker/jobs/{id}/failed` with a machine-readable reason.
* **FR-2.6:** MUST heartbeat every 5 minutes with the relay account's authentication state.

### 4.3 Storage & Delivery

* **FR-3.1 (revised):** Chrome's download directory MUST be `STAGING_PATH`, a local folder no sync client watches. It MUST NOT be `LIBRARY_PATH` and MUST NOT be under `~/Library/CloudStorage/`.
* **FR-3.2:** *"Ask where to save each file before downloading"* MUST be OFF.
* **FR-3.3:** Files MUST enter `LIBRARY_PATH` only via the §3.5 handoff — size-checked, header-checked, atomically renamed, never under a `.crdownload` name.
* **FR-3.4:** The service MUST detect same-volume vs cross-volume at startup, log the active mode, and use `rename` or verified-copy accordingly.
* **FR-3.5:** `filename` and `library_path` MUST be recorded on the job and returned by the status endpoint.

### 4.4 Notification & Feedback

* **FR-4.1:** Every submission MUST return a `job_id`.
* **FR-4.2:** `GET /api/v1/jobs/{job_id}` MUST report terminal state with either a `library_path` or a human-readable `error`.
* **FR-4.3:** On job failure and on queue pause, the service MUST notify — Slack incoming webhook if configured, otherwise a `status` flag the web UI surfaces.
* **FR-4.4:** The web UI MUST poll `/api/v1/status` and show queue depth, in-flight track, daily usage, today's cache hits, and pause state. It MUST lead with the library search box (FR-1.8), not the submit box — searching first is the behaviour the system is trying to create.

---

## 5. Non-Functional & Security Requirements

### 5.1 Access Control

* **Bearer token** on every editor-facing route, from an environment variable on the dedicated node, distributed to the five editors out of band.
* **Subnet allowlist** as defense in depth: `192.168.0.0/16`, `10.0.0.0/8`, `127.0.0.1`.
* **Worker routes** bound to loopback, rejected from any non-loopback source.
* **Audit log:** every submission records timestamp, `requested_by`, source IP, `track_id`, and outcome. This is the central licence record §1.2 identified as missing.
* **No external exposure.** Not port-forwarded, not tunnelled. No Selenium, Puppeteer, or CDP debug port opened at any point.

### 5.2 Resilience

* Per-step selector timeout 20s; overall job ceiling 180s. On timeout: close the tab, log a structured error, notify.
* Stale-claim reaper requeues once (`attempts < 2`), then fails permanently.
* After **3 consecutive job failures**, set `queue_paused` and alert the team lead — stops quota burn against a changed frontend.
* Startup sweep reconciles any job left in `moving`, plus the FR-1.9 library reconciliation.

### 5.3 Session Health

* The extension reports the relay account's authentication state on each 5-minute heartbeat.
* If `authenticated` is false, or no heartbeat arrives for 15 minutes, the service pauses the queue and returns `503` with an actionable message naming the personal-seat fallback.
* Recovery is a human logging back into Artlist in Chrome on the dedicated node; the next successful heartbeat clears the pause.

### 5.4 Compliance

Automated interaction with Artlist is very likely restricted by their terms of service regardless of how the traffic is paced. v1.0's framing — "mask automation patterns," "0% bot-detection signature" — made evasion the stated objective rather than a side effect; that framing has been removed throughout.

The substance is defensible: licensed downloads, on a paid team plan, delivered to seat-holding editors who each already hold their own licence, at a rate below the account's own daily allowance. Two things strengthen the position in 1.2 over 1.0: the five editors are individually licensed (so the library is not being used to serve unlicensed users), and the automation is confined to one account, so the org's normal work does not depend on it.

**Required before Phase 1:** someone with authority reads the current Artlist team-plan terms and confirms (a) whether automated access is permitted or tolerable, and (b) whether a shared org library assembled under one seat and used by five other seat-holders is consistent with the licence. Point (b) is the one that matters most now, and it is a question about the licence, not about the technology.

---

## 6. Implementation Roadmap

### Phase 0: Remaining Decisions (1 hour) — **BLOCKING**

The v1.1 seat/quota gate is closed. What is left:

* [ ] **Relay account:** 6th subscription, or one of the 5 repurposed? (§1.1)
* [ ] **Sync mode:** Mirrored folder (A) or Shared Drive (B)? (§3.5.1) — recommendation is A.
* [ ] **ToS check**, especially point (b) in §5.4.
* [ ] **Confirm the reframed problem statement in §1.2 is right.** Everything downstream — especially making cache hit rate the headline KPI — follows from it. If the real driver is something else, say so now.

### Phase 1: Service & Sync Verification (Day 1)

* [ ] Create `STAGING_PATH` and `LIBRARY_PATH` on the same volume. Confirm `os.rename` between them succeeds (no `EXDEV`).
* [ ] Add `LIBRARY_PATH` to Google Drive for Desktop as a synced folder; share it and complete the one-time shortcut setup for all five editors.
* [ ] **Manual sync test:** drop a 60MB WAV into `LIBRARY_PATH`, time the round trip to a second editor's machine. Sets the realistic end-to-end KPI; not under this project's control.
* [ ] **Partial-file test:** confirm that a `.crdownload` file placed in `LIBRARY_PATH` does propagate to editors — this validates *why* staging exists, and takes two minutes.
* [ ] Set Chrome's download dir to `STAGING_PATH`. Turn off "ask where to save."
* [ ] FastAPI service: SQLite schema, job CRUD, track cache + library search, quota counter, stale-claim reaper, startup reconciliation.
* [ ] Implement and unit-test the §3.5 handoff, both `rename` and `EXDEV` fallback paths.
* [ ] Bearer auth + subnet allowlist + audit log.

### Phase 2: Chrome Extension (Day 1-2)

* [ ] MV3 boilerplate: `manifest.json`, `background.js`, `content.js`.
* [ ] Build the `SELECTORS` dictionary against the live Artlist page. **Highest-unknown task in the project** — budget generously.
* [ ] Job claim loop, paced interaction wrappers, tab lifecycle.
* [ ] `chrome.downloads` completion tracking, 180s ceiling, `interrupted` handling.
* [ ] Failure reporting and 5-minute heartbeat.

### Phase 3: Client Interfaces (Day 2-3)

* [ ] **Option A (recommended baseline):** static web portal at `http://dedicated-mac.local:5000`. **Search box first, submit box second** — the point is to make checking the library the default reflex.
* [ ] **Option B:** Raycast script / Apple Shortcut for one-click clipboard submission.
* [ ] **Option C:** Slack listener on `#asset-requests`, replying in-thread with the library path — cache hits reply instantly, which is the visible payoff.

### Phase 4: Integration Testing (Day 3)

* [ ] **Cache test (primary):** submit a track, wait for `done`, resubmit → second returns `cached` in <1s, quota unchanged, `hit_count` incremented.
* [ ] **Stale-cache test:** delete a file from the library, resubmit → row evicted, job queued normally.
* [ ] **Reconciliation test:** drop a WAV into `LIBRARY_PATH` by hand, restart the service → it is indexed and served as a cache hit (FR-1.9).
* [ ] 5 simultaneous submissions from 5 machines → strict serialization, correct queue positions, ETA matching actual drain time.
* [ ] **Integrity test:** every delivered `.wav` opens in Premiere and Resolve; **no `.crdownload` ever appeared in `LIBRARY_PATH`** during the run.
* [ ] **Kill test:** force-quit Chrome mid-download → reaper requeues, no partial file in the library, no leaked quota.
* [ ] **Session-expiry test:** log the relay account out → next submission returns `503` naming the personal-seat fallback, no quota burned.
* [ ] **Selector-drift test:** break a selector → job fails cleanly, 3 failures pause the queue, alert fires.
* [ ] **Quota test:** drive the counter to 35 → `429` with correct `resets_at` and fallback text; verify the midnight reset.
* [ ] Measure end-to-end p95 at depth 3 against the Phase 1 sync baseline.

---

## 7. Operational Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| **Low cache hit rate — editors don't check the library first** | **Medium-High** | **High** | The single biggest risk to the project's value in 1.2. Search-first web UI (FR-4.4), instant Slack cache-hit replies, and a visible hit-rate number. If editors keep going straight to Artlist, the system reduces to a slower way to download and should be reconsidered. |
| **Artlist frontend redesign** | Medium | Medium | Centralized `SELECTORS` dictionary with ordered fallbacks; 3-failure auto-pause stops quota burn while it is fixed. |
| **Partial/corrupt files reaching the library** | Was high in v1.0 | High | Staging dir + atomic `os.rename` + size and RIFF-header checks (§3.5). Now eliminated rather than mitigated, thanks to the same-volume layout. |
| **Wasted quota on duplicates** | High | Medium | Track cache (FR-1.2) and in-flight dedup (FR-1.3). |
| **Relay account session expiry** | High | Low | Heartbeat + auto-pause + actionable `503` (§5.3). Impact is now **Low**, not High: editors fall back to their own seats. |
| **Relay account restricted by Artlist** | Low-Medium | **Low** | Contained by design (§2.1). Five editors keep working on their own seats; the org loses the library-building convenience, not its music. |
| **Hit the relay daily cap** | Medium | Low | Hard stop at 35, alert at 30, quota charged only on success. Personal-seat fallback named in the `429` body. |
| **Library owned by the relay account** (Option A) | Medium | Medium | Accepted deliberately (§3.5.1). Migrate to a Shared Drive before that account is ever deprovisioned. Revisit if the library exceeds the account's Drive storage. |
| **Editors skip the one-time shortcut setup** (Option A) | Medium | Medium | Do it with them during Phase 1, not by instruction afterwards. Verify by having each editor confirm the file from the Phase 1 sync test is visible locally. |
| **Mac sleep / app suspension** | Medium | Medium | Energy Saver "prevent sleeping when display is off"; `caffeinate -s` under launchd, or Amphetamine. Service and Chrome both under launchd with `KeepAlive`. |
| **Quota drained by an unauthorized submitter** | Low | Low | Bearer token + subnet allowlist + audit log (§5.1). |
| **Service restart loses queue/counter/index** | Was certain in v1.0 | High | SQLite persistence (FR-1.7) + startup reconciliation (FR-1.9). |
| **Detection despite pacing** | Low-Medium | Low | Cannot be reduced to zero (§3.6). Mitigated by low serialized volume, a real session, a sub-allowance cap, and one-account containment. |
| **ToS / licence conflict** | Unknown | High | §5.4 point (b). Answer before Phase 1. |
