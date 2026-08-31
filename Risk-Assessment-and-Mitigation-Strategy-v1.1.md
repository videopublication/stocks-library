# Risk Assessment & Mitigation Strategy Matrix

**Project:** Shared Artlist Asset Library & Automated Relay
**Document Version:** 1.1.0 (supersedes 1.0.0)
**Companion:** `PRD-Artlist-Relay-v1.3.md` — section references below point at that document.
**Target Systems:** Dedicated node (macOS **or** Windows 11), Chrome MV3 Extension, FastAPI + SQLite backend, Google Chat + Cloud Pub/Sub ingestion, Google Drive for Desktop
**Date:** August 2026

---

## 0. Changelog vs. 1.0.0

| Change | Reason |
| --- | --- |
| **RSK-02 mitigation replaced** with `chrome.alarms`. | The three options listed in 1.0 (pinned tab + SSE, offscreen document, native messaging) all work but are heavier than the platform's own answer. `chrome.alarms` wakes a terminated worker and costs three lines. Native messaging retained as the escalation path. |
| **RSK-04 retargeted to editor machines.** | 1.0's mitigations #1 and #2 both operated on the **relay node** and did nothing about the stated failure, which happens on the **editor's** machine. Atomic rename solves a different (already-covered) risk. |
| **RSK-08 mechanism corrected**, and Chrome launch flags added. | 1.0 blamed timer throttling. The real reason a background tab fails is SPA hydration — `IntersectionObserver` never fires, so the download control may not render. And `active: true` alone does not survive an occluded or locked-session window. |
| **RSK-10 size floor lowered** 5 MB → 1 MB, and the API gap named. | A 15-second short-version WAV is ~2.6 MB and would have been false-rejected. Also, 1.0 promised variant selection the API had no field to express. |
| **RSK-01 residual honesty restored.** | 1.0 cited `navigator.webdriver === false`, which is not the detection surface that matters, and claimed residual **Low**. Likelihood is not something pacing controls; **impact** is what containment reduces. |
| **Eight new risks added:** RSK-11 … RSK-18. | Cloud storage exhaustion, editor adoption, Chrome auto-update, SQLite locking, DB backup, filename portability, Windows-node specifics, and the new Google Chat dependency. |
| **Cross-document conflicts resolved** (§2.1). | Tab mode, delay values, and tab-close timing disagreed between the two documents. PRD v1.3 is now canonical for all timing values. |
| **§5 conclusion rewritten.** | "Residual risk reduced to Low across all dimensions" was overclaimed, and specifically wrong for RSK-01 and RSK-12. |

---

## 1. Executive Summary

Structured risk assessment for the **Shared Artlist Asset Library & Automated Relay**, covering operational, architectural, legal, security, media-integrity, and infrastructure risks, with severity, likelihood, mitigation protocols, and contingency procedures.

**Two risks dominate and neither is technical.** `RSK-12` (editors keep going straight to Artlist instead of checking the library) determines whether the project delivers value at all — a system with a low cache hit rate is a slower way to download. `RSK-11` (unbounded library growth against a finite Drive quota) is the one that goes unnoticed for months and then stops everything at once. Both are new in this revision; version 1.0 of this document contained neither.

---

## 2. Risk Classification & Heat Map

| Risk ID | Category | Risk Description | Severity | Likelihood | Residual |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **RSK-01** | Legal / ToS | Account suspension or flagging by Artlist for scripted interaction | **Critical** | Low-Med | **Medium** |
| **RSK-02** | Runtime / MV3 | Extension service worker hibernation breaks the polling loop | High | **Certain** | Low |
| **RSK-03** | Browser / DOM | Frontend redesign / selector drift breaks download | High | Medium | Low |
| **RSK-04** | Sync / NLE | Editor imports a file Drive has not finished delivering | High | Medium | Low |
| **RSK-05** | Storage / OS | Local disk exhaustion from staging leakage | Medium | Medium | Low |
| **RSK-06** | Hardware | Node sleep, reboot, or network drop (SPOF) | High | Medium | Low |
| **RSK-07** | Quota / UX | 35-track daily cap exhausted during a delivery crunch | Medium | Medium | Low |
| **RSK-08** | Browser / Tab | Background or occluded tab fails to render the download control | High | Medium | Low |
| **RSK-09** | Security | Bearer token leak or unauthorized quota drain | Medium | Low | Low |
| **RSK-10** | Media | Corrupt audio header or wrong track variant | Medium | Low-Med | Low |
| **RSK-11** | **Storage / Cloud** | **Drive quota exhaustion from unbounded library growth** | **High** | **High** | **Medium** |
| **RSK-12** | **Adoption** | **Low cache hit rate — editors bypass the library** | **High** | **Med-High** | **Medium** |
| **RSK-13** | Browser / Policy | Chrome auto-update disables the unpacked extension | High | Medium | Low |
| **RSK-14** | Data / Concurrency | SQLite `database is locked` under concurrent submissions | Medium | Med-High | Low |
| **RSK-15** | Data / Continuity | Loss of the SQLite DB destroys the library index and licence record | High | Low | Low |
| **RSK-16** | Portability | Filenames valid on the node are unusable on editors' machines | Medium | **High** | Low |
| **RSK-17** | Platform | Windows-node specifics: AV file locks, forced reboots, session lock, lid | Medium | Med-High | Low |
| **RSK-18** | Dependency | Google Chat / Pub/Sub ingestion unavailable, unapproved, or misconfigured | Medium | Medium | Low |

---

## 3. Deep-Dive Risk Analysis & Mitigation

---

### RSK-01: Account Suspension or Flagging by Artlist

* **Category:** Legal / Platform Compliance
* **Impact:** **Critical** in the abstract; **Low in practice** because of containment (below).
* **Failure mechanism:** Artlist detects scripted interaction — via `isTrusted === false` on synthetic clicks, download frequency patterns, or access-timing anomalies.
* **Mitigations:**
  1. **Blast-radius isolation.** The relay runs on one designated account. The 5 editors keep independent seats. If the relay account is flagged, all 5 continue working uninterrupted and fall back to the workflow they use today. **This is the only mitigation that meaningfully changes the outcome.**
  2. **No CDP / no automation framework.** No Selenium, Puppeteer, or remote debugging port. See the honesty note below on why this matters less than it appears to.
  3. **Paced interaction and cooldowns** per **PRD §3.9** — that document is canonical for all timing values.
  4. **Hard quota ceiling** at 35/day, below the 40-track platform threshold.
* **Contingency:** queue pauses, `503` to editors instructing them to use their personal seats, alert to the team lead in Chat.

> **Honesty note — corrects version 1.0 of this document.** 1.0 listed `navigator.webdriver === false` as a mitigation. That is true but is not the detection surface that matters. An MV3 content script **cannot dispatch a trusted input event**: `element.click()` and synthetic `MouseEvent`s carry `isTrusted === false` regardless of pacing, and the only MV3 route to trusted input is `chrome.debugger` (CDP), which this design rejects. Most sites do not gate downloads on `isTrusted`, so this is very likely to work — but plan it as "very likely to work," not "undetectable." See PRD §3.9.1.
>
> **Residual is Medium, not Low.** Pacing does not reduce the *likelihood* of a ToS-based action; it is not a control over someone else's policy. What containment reduces is the *impact*, and it reduces it a great deal. Claiming Low residual here — as 1.0 did — is the same overclaim that PRD v1.0 made and v1.1 removed.

---

### RSK-02: Manifest V3 Service Worker Hibernation

* **Category:** Browser Runtime / Architecture
* **Impact:** **High** — the relay silently stops processing shortly after the queue empties.
* **Likelihood:** **Certain**, not merely High. This is not a possibility; it is how MV3 works.
* **Failure mechanism:** Chrome terminates extension service workers after roughly **30 seconds of inactivity**. A `setInterval(pollQueue, 5000)` in `background.js` dies with the worker and never resumes. PRD v1.2 specified exactly this and was broken as written.
* **Mitigation (primary — replaces all three options in version 1.0 of this document):**
  1. **`chrome.alarms` as the wake source.** `chrome.alarms.create('poll', { periodInMinutes: 0.5 })` — 30 seconds is the platform minimum. Alarms wake a terminated worker. Requires the `"alarms"` manifest permission.
  2. **No keepalive needed while working.** Once a job is claimed the worker is continuously calling `chrome.tabs` / `chrome.downloads` and receiving their events, and every extension API call or event resets the idle timer. It stays alive for the whole job and drains the rest of the queue without waiting on alarms.
  3. **Net cost:** ≤30s added latency on the **first** job after an idle period; zero for every job behind it. Jobs already take 25–75s, so this is not material.
* **Escalation path (not initially required):** a **native messaging host** keeps the worker alive indefinitely via an open port and removes the loopback HTTP hop entirely. It also splits the service into two processes, since Chrome spawns the host — not justified by a 30s worst case, but the right answer if cold-start latency ever becomes a real complaint.
* **Rejected:** pinned dashboard tab + SSE (an entire subsystem for a problem `chrome.alarms` solves in three lines); offscreen documents (fragile, and discouraged by the Chrome team as a keepalive mechanism).
* **Verification:** PRD Phase 4 "MV3 idle test" — empty queue for 10 minutes, then submit; job must start within 30s.

---

### RSK-03: Frontend Redesign & Selector Drift

* **Category:** Browser / DOM Automation
* **Impact:** **High** — downloads fail at page interaction.
* **Failure mechanism:** Artlist ships a frontend update changing class names or DOM hierarchy, or introduces a new promotional modal or cookie banner.
* **Mitigations:**
  1. **Centralized fallback dictionary.** `SELECTORS` in `content.js` holds an ordered array of strategies per step — `data-testid` first, then `aria-label`, then resilient text-content matchers. Recovery is a single-file edit.
  2. **Circuit breaker.** After 3 consecutive job failures the service sets `queue_paused = true`, alerts the team lead in Chat, and stops burning daily quota against a broken selector.
  3. **Modal dismissal layer.** A pre-flight pass dismisses known banners before targeting download controls (PRD FR-2.3).
  4. **Fail loud, never silent.** A selector timeout produces a structured error and an in-thread Chat reply to the requesting editor, not a job that quietly disappears.
* **Note:** this is the highest-unknown task in the build (PRD Phase 2) — the selector work is discovery, not implementation, and should be budgeted accordingly.

---

### RSK-04: Editor Imports a File Drive Has Not Finished Delivering

*Retitled and retargeted. Version 1.0 called this a "Drive Sync Race Condition" and mitigated it on the wrong machine.*

* **Category:** File System & Cloud Sync
* **Impact:** **High** — offline media in Premiere/Resolve, zero-byte reads, broken project links.
* **Failure mechanism:** the file appears in the editor's Drive folder as a **placeholder** before its bytes have been fetched. The editor imports it into the NLE and gets offline media. This happens **on the editor's machine** and is entirely unaffected by anything the relay node does.
* **Mitigations — all on editors' machines, none of them code:**
  1. **Mark the library folder "Available offline"** in Drive for Desktop on every editor machine. In Stream mode the file is a stub until opened, and an NLE handed a stub reports offline media. **This is the single most important item in this entry.**
  2. **Copy out before importing.** Editors copy tracks from the library folder into project media and link the NLE there — never point an NLE directly at a cloud-synced path. Standard NLE practice, and the actual fix.
  3. **Mirror mode on editors' machines**, not only on the node.
  4. **Verify during Phase 1 rollout, per editor** — sit with each one and confirm the Phase 1 test file is genuinely local. Do not delegate this to a written instruction; it is the step that gets skipped.
* **Explicitly not a mitigation for this risk:** the atomic `os.replace` handoff (PRD §3.6). That protects the library **on the node** against partial files, which is a different risk and already covered. Version 1.0 of this document listed it here, which made the entry look mitigated when the actual failure was untouched.
* **Residual Low only once (1) and (2) are confirmed per editor.** Until then, Medium.

---

### RSK-05: Local Disk Exhaustion from Staging Leakage

* **Category:** Storage / OS Maintenance
* **Impact:** **Medium** — the node's disk fills, crashing Chrome or the service.
* **Failure mechanism:** crashed jobs, interrupted downloads, and orphaned `.crdownload` / `.wav` files accumulate in `STAGING_PATH`.
* **Mitigations:**
  1. **Startup reconciliation sweep** purges unreferenced staging files older than 1 hour (PRD FR-5.5).
  2. **Nightly garbage collection** unlinks orphans not tied to an in-flight job.
  3. **Disk telemetry** on `GET /api/v1/status`; reject new jobs with `507 Insufficient Storage` below a 5 GB floor.
* **Note:** this covers the *local* disk. The *cloud* side is unbounded and is `RSK-11` — a far larger exposure that version 1.0 of this document did not cover at all.

---

### RSK-06: Node Downtime / Single Point of Failure

* **Category:** Infrastructure & Hardware
* **Impact:** **High** for the relay; **Low for the team**, because all 5 editors retain working seats and the pre-project workflow.
* **Failure mechanism:** sleep, Wi-Fi drop, power loss, forced OS reboot, or someone picking the laptop up and walking off with it.
* **Mitigations:**
  1. **Process supervision.** macOS: `launchd` with `KeepAlive`. Windows: **Task Scheduler "At log on" with restart-on-failure — not a Windows Service.** Session 0 isolation prevents a service from running Chrome with a rendering window (PRD §3.7).
  2. **Auto-login** so an interactive session exists after an unattended reboot.
  3. **Power assertions.** macOS: `caffeinate -dimsu`. Windows: `powercfg /change standby-timeout-ac 0`, `monitor-timeout-ac 0`, `powercfg /hibernate off`, and lid-close set to "Do nothing."
  4. **Wired Ethernet** over Wi-Fi; mains power, not battery.
  5. **Deferred OS updates** outside work hours; Windows **Active Hours** configured (see `RSK-17`).
* **Contingency:** clients show an offline error; editors use their own seats. The relay is a convenience layer, never a dependency — this is a deliberate design property, not an accident.

---

### RSK-07: Daily Quota Depletion During a Delivery Crunch

* **Category:** Operational & Capacity
* **Impact:** **Medium**, and falling as the library grows.
* **Failure mechanism:** a heavy delivery day where several editors request new music simultaneously.
* **Mitigations:**
  1. **Deduplication cache.** Requests for tracks already in the library return in <3s with zero quota impact. **The library is the capacity strategy** — a mature library makes the 35/day cap nearly irrelevant.
  2. **Decentralized fallback.** All 5 editors hold individual seats (5 × 40 = 200 tracks/day). On a `429` they download directly on their own workstation. The `429` body says so explicitly, and tells them the file will be auto-indexed if they drop it in the library folder (PRD FR-1.9).
  3. **Tiered alerting** at 25 (warning) and 30 (critical) to the Chat space — **to the space, not only the team lead**, so editors can self-regulate. An alert that only the lead sees does not change editor behaviour, which was the flaw in version 1.0's mitigation.
* **Residual Low.** With individual seats intact, hitting the relay cap is an inconvenience, not a work stoppage.

---

### RSK-08: Background or Occluded Tab Fails to Render the Download Control

*Mechanism corrected. Version 1.0 attributed this to timer throttling; that is the weaker of the two causes.*

* **Category:** Browser Engine
* **Impact:** **High** — the click target may not exist at all, so the job fails at selector timeout.
* **Failure mechanism — the real one:** in a hidden tab, `IntersectionObserver` does not fire, lazy-loaded components and virtualized lists do not populate, and an SPA may never render the download control. The script then times out looking for an element that was never created.
* **Failure mechanism — the weaker one:** Chromium clamps background `setTimeout` to roughly 1/sec (intensive throttling at 1/min only after ~5 minutes hidden). Every delay in PRD §3.9 is ≥800ms and job tabs live 15–40s, so throttling barely bites. Worth knowing, but not the reason to change the design.
* **Mitigations:**
  1. **`active: true` for job tabs.** The node is dedicated and unattended, so a foreground tab costs nothing. **This inverts PRD v1.2's FR-2.1** and is now PRD v1.3 FR-2.1.
  2. **Chrome launch flags — the actual robust fix:**
     ```
     --disable-background-timer-throttling
     --disable-backgrounding-occluded-windows
     --disable-renderer-backgrounding
     ```
     `active: true` **alone is not sufficient.** A minimized, occluded, or locked-session Chrome window is treated as hidden no matter which tab is selected — so on a lid-closed node or after a screen lock the relay would break silently. These flags remove the visibility question entirely.
  3. **Close the tab at `onCreated`**, not at completion — frees the tab in 15–25s while the service worker tracks `chrome.downloads.onChanged` to `complete`. Downloads are browser-level, so closing the tab does not affect them.
* **Verification:** PRD Phase 4 "lock-screen test" — lock the node, submit a job, confirm it completes.

---

### RSK-09: Bearer Token Leakage & Unauthorized Access

* **Category:** Security & Governance
* **Impact:** **Medium** — unauthorized submissions or quota drain.
* **Failure mechanism:** the shared portal token is exposed, or reaches a device that should not have it.
* **Mitigations:**
  1. **The Chat path removes the token entirely.** Identity comes from Google as a verified `message.sender.email`; there is no shared secret on the primary submission path. This also fixes a quieter problem: PRD v1.2's `requested_by` was client-supplied free text, so the "central licence record" recorded whatever the caller typed. It is now server-derived and trustworthy.
  2. **Dual-layer defense on the portal path:** `Authorization: Bearer <TOKEN>` **and** subnet allowlisting (`192.168.0.0/16`, `10.0.0.0/8`, `127.0.0.1`).
  3. **Loopback-only worker routes** — `/api/v1/worker/*` bound to `127.0.0.1`, rejected from every other source.
  4. **Audit trail** in SQLite: `timestamp`, verified `requested_by`, `source_ip`, `track_id`, `variant`, `token_hash`, outcome.
  5. **Documented rotation procedure** (new): change the env var → restart the service → redistribute out of band. Version 1.0 named token leakage as a risk without saying what to do about it; "rotate the token" with no procedure is not a control.
* **Highest-value secret on the node is no longer the bearer token** — it is the **Pub/Sub / Chat service-account key**. Scope it to `pubsub.subscriber` on the one subscription plus `chat.bot`, restrict file permissions, and never broaden it for convenience.

---

### RSK-10: Audio Integrity & Multi-Variant Track Selection

* **Category:** Media Integrity / Creative Workflow
* **Impact:** **Medium** — wrong variant delivered (instrumental instead of vocal, short instead of full), or a truncated/HTML file saved as `.wav`.
* **Failure mechanism:** Artlist track pages offer multiple versions — Main, Instrumental, Stems, Short. A DOM clicker takes the default or the wrong dropdown item.
* **Mitigations:**
  1. **Explicit variant strategy.** `content.js` targets explicit `WAV` / `Lossless` labels and defaults to Main Track. **MUST fail rather than silently deliver a different variant than requested** (PRD FR-2.9) — a wrong file that looks right is worse than a clean failure.
  2. **`variant` is now a first-class field** on the job, and `tracks` is keyed on `(track_id, variant)` so the instrumental of a track you already hold is correctly a new download, not a cache hit. **Version 1.0 of this document promised variant selection that the API had no field to express** — that gap is closed in PRD v1.3.
  3. **Binary header validation** — 12-byte RIFF/WAVE check before the file enters the library.
  4. **Minimum size 1 MB, not 5 MB.** A 15-second short-version sting at 44.1kHz/16-bit stereo is roughly 2.6 MB and version 1.0's 5 MB floor would have false-rejected it. The RIFF check already catches HTML error pages saved as `.wav`, which is what the floor was actually for; 1 MB is enough.

---

### RSK-11: Cloud Storage Exhaustion from Unbounded Library Growth

*New in 1.1. Absent from version 1.0, and the largest unmanaged exposure in the design.*

* **Category:** Storage / Cloud Capacity
* **Impact:** **High** — new downloads fail, Drive sync stalls for all five editors, and the failure arrives with no warning.
* **Likelihood:** **High.** This is not a possibility, it is arithmetic on a long enough timeline.
* **Failure mechanism:** WAVs average ~60 MB. Even 10 tracks/day is ~18 GB/month, growing **forever** with no eviction. At the 35/day ceiling it is ~63 GB/month. Under sync Option A (mirrored folder) that lands on the **relay account's personal Drive quota** — commonly 15 GB on a bare account, 30 GB–2 TB on Workspace tiers. A 15 GB account fills in under a month at modest usage. Version 1.0 guarded a 5 GB *local* disk floor while the *cloud* side went entirely unwatched.
* **Mitigations:**
  1. **Pre-flight quota check** (PRD FR-5.1). Local free disk **and** remaining Drive quota checked before accepting a job; below threshold → `507 Insufficient Storage` with an actionable message.
  2. **Telemetry** — library size and Drive headroom recorded in `health`, exposed on `/api/v1/status`, reported weekly.
  3. **Tiered thresholds** — alert the team lead at **80%** of quota, pause new downloads at **95%**.
  4. **Pruning support, not pruning.** Report the largest tracks and those with `hit_count = 0` older than 6 months. **Automatic deletion is explicitly out of scope** — these are licensed assets and a project may reference one years later. A human decides.
  5. **Runway decision in Phase 0** (PRD FR-5.6). Confirm the relay account's actual quota and compute months of runway at the expected rate. **If under 12 months, choose sync Option B (Shared Drive)** — pooled org storage instead of one user's allocation. This is a cheap decision now and an expensive migration later.
* **Residual Medium**, not Low. The guards prevent a silent failure and buy warning time; they do not create storage. The real mitigation is the Phase 0 sizing decision.

---

### RSK-12: Low Cache Hit Rate — Editors Bypass the Library

*New in 1.1. The top risk to the project's value, and absent from version 1.0.*

* **Category:** Adoption / Behavioural
* **Impact:** **High** — not an outage, a **pointlessness** failure. If editors keep going straight to Artlist on their own seats, the relay is a slower way to download and the library is a folder nobody reads. Every technical risk in this document could be fully mitigated and the project would still have failed.
* **Likelihood:** **Medium-High.** The existing habit — search Artlist, click download — is fast, familiar, and requires nothing of anyone. Checking a library first is a new step, and new steps lose to old habits by default.
* **Mitigations:**
  1. **Search-first web portal** (PRD FR-4.5). The library search box is the primary element; submission is secondary. The UI should make "check first" the path of least resistance.
  2. **`/find` in Google Chat.** Searching from the space they are already in, without switching context, is the only version of "check first" that competes with the existing habit on convenience.
  3. **Visible instant payoff.** A cache hit replies in-thread in under 3 seconds with a ready path. That felt speed difference — instant versus a two-minute download — is the behavioural lever.
  4. **Cache hit rate as the headline KPI** (PRD §2.2), reported to the team, not buried in a status endpoint.
  5. **Auto-indexing of manual drops** (PRD FR-1.9). An editor who downloads on their own seat and drops the file in the library folder still grows the shared library. The system should absorb the old habit rather than fight it.
* **Contingency:** if the hit rate is still below ~15% at month 3, the premise in PRD §1.2 is wrong. Reconsider the project rather than adding features to it — the honest outcome may be that a shared folder with a naming convention was sufficient.
* **Residual Medium.** This one is not closed by engineering.

---

### RSK-13: Chrome Auto-Update Disables the Unpacked Extension

*New in 1.1.*

* **Category:** Browser / Policy
* **Impact:** **High** — the relay stops silently, mid-day, with no error anywhere except jobs sitting in `queued`.
* **Failure mechanism:** unpacked (developer-mode) extensions are disabled across Chrome updates and behind "Disable developer mode extensions" prompts. An unattended node cannot dismiss the prompt, and nobody is watching the screen.
* **Mitigations:**
  1. **Pack as `.crx` and force-install by policy** (PRD §3.5) — `ExtensionInstallForcelist` / `ExtensionSettings` via a macOS configuration profile or Windows Group Policy / `HKLM\Software\Policies\Google\Chrome\`. A force-installed extension survives updates and cannot be disabled by a prompt.
  2. **Verify explicitly** — PRD Phase 4 "Chrome update test": force an update, confirm the extension survives and the relay resumes.
  3. **Detect it if it happens.** Heartbeat loss is already an alerting condition (`RSK-06` / PRD §5.3); a dead extension stops heartbeating, so the queue pauses and the lead is alerted within 15 minutes rather than at end of day.

---

### RSK-14: SQLite `database is locked` Under Concurrent Submissions

*New in 1.1.*

* **Category:** Data / Concurrency
* **Impact:** **Medium** — submissions fail with a 500 under exactly the conditions the system is meant to handle.
* **Failure mechanism:** async FastAPI with default SQLite journal mode serializes poorly; concurrent writes from the HTTP path, the Pub/Sub subscriber, the worker callbacks, and the reaper produce `database is locked`. It will surface first during the Phase 4 five-simultaneous-submissions test — or in production if that test is skipped.
* **Mitigations:**
  1. **WAL mode** — `PRAGMA journal_mode = WAL`, allowing concurrent readers alongside one writer.
  2. **`PRAGMA busy_timeout = 5000`** so brief contention waits instead of failing.
  3. **Single serialized writer path** — all writes through one lock-guarded connection; readers unrestricted.
  4. **Verified by** the Phase 4 concurrency test, which now explicitly asserts no lock errors rather than only checking queue ordering.

---

### RSK-15: Loss of the SQLite Database

*New in 1.1.*

* **Category:** Data / Business Continuity
* **Impact:** **High** — the `tracks` table **is** the library index, the dedup cache, and the licence record. Losing it means the audio files survive but every cache hit becomes a re-download, and the record of what was licensed by whom is gone.
* **Failure mechanism:** disk failure, an unrecoverable corruption, or the node being wiped/reimaged with no backup. Version 1.0 of this document had no backup provision anywhere.
* **Mitigations:**
  1. **Nightly `VACUUM INTO`** a timestamped file **inside `LIBRARY_PATH`**, so the backup syncs to Drive alongside the audio with no extra infrastructure. Retain 14 days.
  2. **Reconstruction path.** FR-1.9's startup reconciliation can rebuild `tracks` from the files on disk — filename, size, and path recover, so the *cache* is restorable. What is not recoverable is attribution and history (`requested_by`, `downloaded_at`, `hit_count`), which is exactly what the licence record is for. Backups are the only protection for that half.
  3. **Restore drill** during Phase 4 — restore from a backup into a scratch copy and confirm it loads. An untested backup is a hope.

---

### RSK-16: Filename Portability Across Editor Platforms

*New in 1.1.*

* **Category:** Portability / Cross-platform
* **Impact:** **Medium** — files sync correctly and are then unopenable, or silently renamed, on some editors' machines.
* **Likelihood:** **High.** Artlist track titles routinely contain `:`, `?`, and quotes. This is not an edge case.
* **Failure mechanism:** Windows forbids `< > : " / \ | ? *`, reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`), and trailing dots or spaces, and caps paths at 260 characters unless long paths are enabled. macOS is permissive and will happily create `Whats Next? - Artlist.wav`, which then fails for every Windows editor. Unicode normalization differs between platforms too (NFD on macOS, NFC on Windows), which breaks exact-match lookups.
* **Mitigations:**
  1. **Mandatory sanitization** (PRD FR-3.6) applied on **every** platform, not only when the node is Windows — because editors are mixed even if the node is not.
  2. **Normalize to NFC**, strip forbidden characters and trailing dots/spaces, guard reserved names, cap the basename so the full path stays under 260 characters.
  3. **Sanitize before the `tracks` row is written**, so the recorded `library_path` is what is actually on disk.
  4. **Phase 1 cross-platform filename test** — create `Test: Whats Next?.wav` on the node and confirm behaviour on a Windows editor machine before any of the code depends on the answer.

---

### RSK-17: Windows Node — Platform-Specific Failure Modes

*New in 1.1, and applicable only if the Windows laptop is chosen as the node.*

* **Category:** Platform / Infrastructure
* **Impact:** **Medium** — intermittent job failures and unattended downtime.
* **Failure mechanisms and mitigations:**

| Mechanism | Mitigation |
| --- | --- |
| **Antivirus holds the file handle.** Defender scans a freshly written WAV and briefly locks it; `os.replace` raises `PermissionError`. | Retry with backoff — 5 attempts over ~10s (PRD FR-3.7). Optionally exclude `STAGING_PATH` from real-time scanning. Verified by the Phase 4 AV-lock test. |
| **`os.rename` semantics differ.** On Windows it raises `FileExistsError` when the destination exists; on POSIX it silently replaces. | Use **`os.replace`** — atomic on NTFS and APFS alike (PRD §3.6 step 5). This was a real latent bug in PRD v1.2. |
| **Windows Service cannot run Chrome with a window.** Session 0 isolation. | Task Scheduler "At log on" with restart-on-failure, plus auto-login — **not** a Windows Service (PRD §3.7). |
| **Forced Update reboots** mid-day. | Configure **Active Hours**, defer feature updates. Supervision must bring the service and Chrome back automatically after any reboot. |
| **Session lock occludes windows.** | The three Chrome throttling flags from `RSK-08` — which is why they are not optional on a Windows node. |
| **Laptop lid closes / runs on battery.** | "When I close the lid: Do nothing," mains power, `powercfg` timeouts zeroed, hibernate off. |
| **Path length 260 chars.** | Enable long paths, and cap basenames anyway (`RSK-16`). |

* **Overall:** a Windows laptop is a perfectly viable node. It is slightly worse than a desktop for the mundane reasons — battery, thermals, portability making it easy to walk off with — not for technical ones. Pick whichever machine can stay powered, awake, wired, and logged in.

---

### RSK-18: Google Chat / Pub/Sub Ingestion Unavailable

*New in 1.1, covering the new primary ingestion path.*

* **Category:** External Dependency
* **Impact:** **Medium** — the primary submission path is unavailable; the portal still works.
* **Failure mechanisms:**
  * **Workspace admin does not approve the app**, or approval takes weeks.
  * **Pub/Sub misconfiguration** — most commonly, forgetting to grant `chat-api-push@system.gserviceaccount.com` the Publisher role on the topic, which produces a Chat app that appears configured and silently receives nothing.
  * **Service-account key expiry or revocation.**
  * **Pub/Sub or Chat API outage.**
* **Mitigations:**
  1. **The web portal is fully functional standalone** and requires no Google configuration. Chat is an additive front end. **The design must not become unshippable if admin approval stalls** — PRD Phase 3 ships the portal regardless.
  2. **Start approval in Phase 0, not Phase 3** (PRD §6). It is the only item in the plan with an external lead time, and it is the one most likely to slip.
  3. **Subscriber health monitoring** — if no Pub/Sub message is received for 24 hours *and* the portal is receiving traffic, alert; a silently dead subscriber otherwise looks identical to a quiet day.
  4. **Explicit setup checklist** in PRD §3.8, with the Publisher-role grant called out as the step most commonly missed.
  5. **Message acknowledgement discipline** — ack only after the job is durably persisted, so a crash between pull and write redelivers rather than drops.

---

## 4. Cross-Document Conflict Resolution

Version 1.0 of this document disagreed with PRD v1.2 in four places. Resolved as follows; **PRD v1.3 §3.9 is canonical for all timing values.**

| Item | Risk doc 1.0 | PRD v1.2 | **Resolution (PRD v1.3)** |
| :--- | :--- | :--- | :--- |
| Tab mode | `active: true` | `active: false` | **`active: true`** — RSK-08 wins, but for the SPA-hydration reason, not throttling. Plus the three Chrome flags, which are the actual fix. |
| Pre-click delay | 4–9s | 3.5–6.5s | **3.5–6.5s** |
| Inter-job cooldown | 12–25s | 8–15s | **8–15s** |
| Tab close trigger | on `onCreated` | on `onChanged`→`complete` | **Close at `onCreated`; track completion in the service worker.** Never a real conflict — downloads are browser-level, so closing early is safe and frees the tab sooner. PRD v1.3 §3.9 now says so explicitly. |

---

## 5. Operational Runbook & Emergency Response Matrix

| Scenario | Symptom | Automated Response | Operator Action |
| :--- | :--- | :--- | :--- |
| **Session expired** | Heartbeat fails >15m | Queue pauses; `503` | Log in to Artlist in Chrome on the node. |
| **Selector drift** | 3 consecutive failures | Circuit breaker; Chat alert | Inspect the Artlist DOM; update `SELECTORS` in `content.js`. |
| **Extension disabled by update** | Heartbeat stops after a Chrome update | Queue pauses; Chat alert | Confirm the force-install policy is applied; reapply and restart Chrome. |
| **Daily cap hit** | 35 downloads reached | `429` with fallback text | Editors use personal seats; drop files in the library folder for auto-indexing. |
| **Drive quota ≥80%** | Telemetry threshold | Chat alert to lead | Review the largest / zero-hit tracks; prune manually or migrate to a Shared Drive. |
| **Drive quota ≥95%** | Telemetry threshold | New downloads pause; `507` | Prune or expand storage. Do **not** auto-delete licensed assets. |
| **Local disk <5GB** | Telemetry threshold | `507` | Run staging GC; check for orphaned `.crdownload` files. |
| **Node offline** | API unreachable, no heartbeat | Clients show offline | Check power, Ethernet, auto-login, and supervision (`launchd` / Task Scheduler). |
| **Chat submissions stop, portal works** | No Pub/Sub messages >24h | Subscriber-health alert | Check the subscription, the SA key, and the `chat-api-push` Publisher grant. |
| **`database is locked` in logs** | 500s on submit | — | Confirm WAL mode and `busy_timeout`; check for a second writer connection. |
| **Editor reports offline media** | NLE cannot read a library file | — | Confirm "Available offline" on that editor's Drive folder; have them copy out before importing. |
| **DB corruption** | Service fails to start | — | Restore the latest nightly backup from `LIBRARY_PATH`; run FR-1.9 reconciliation to rebuild the cache. |

---

## 6. Conclusion & Recommendations

The architecture in **PRD v1.3** is sound and its failure modes are, with two exceptions, contained. The design decisions that do the most work:

1. **Isolated relay account** — bounds the impact of `RSK-01` to one account while five editors keep working.
2. **`chrome.alarms` keepalive** — closes `RSK-02`, which would otherwise have silently broken the relay as v1.2 specified it.
3. **Staging + atomic `os.replace`** — eliminates partial files in the library rather than mitigating them.
4. **Circuit breakers and telemetry** — turn silent failures into alerts with a named operator action.
5. **Personal seats retained throughout** — every contingency in this document ends with "editors use their own seats," which is why so many impacts land at Low.

**Two risks do not reduce to Low, and saying otherwise would be the same overclaim this document made in version 1.0:**

* **`RSK-12` (adoption)** is the top risk to the project's value and is not an engineering problem. If editors do not check the library first, everything else here is well-built infrastructure for a thing nobody uses. Measure the cache hit rate from week one and be willing to conclude the premise was wrong.
* **`RSK-11` (storage)** is arithmetic. The guards buy warning time; they do not create capacity. The real decision is the Phase 0 runway check — and if the runway is under 12 months, choose the Shared Drive now rather than migrating later.

**`RSK-01` residual is Medium, not Low.** Pacing is not a control over someone else's terms of service. What the design genuinely achieves is that the *consequence* of being wrong about it is small.

**Recommended sequencing:** start the Google Chat app approval on day one (`RSK-18`, the only external lead time), settle the storage runway before writing code (`RSK-11`), and treat the `SELECTORS` work as discovery rather than implementation (`RSK-03`).
