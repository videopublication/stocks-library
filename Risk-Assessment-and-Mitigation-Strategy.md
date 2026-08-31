# Risk Assessment & Mitigation Strategy Matrix
**Project:** Shared Artlist Asset Library & Automated Relay  
**Document Version:** 1.0.0  
**Target Systems:** macOS Dedicated Node, Chrome MV3 Extension, FastAPI Backend, Google Drive for Desktop  
**Date:** August 2026

---

## 1. Executive Summary

This document provides a comprehensive, structured risk assessment for the **Internal Music Asset Dispatcher & Local Downloader Relay**. It analyzes operational, architectural, legal, security, and infrastructure risks, categorizes their severity and likelihood, and establishes actionable mitigation protocols and contingency procedures.

---

## 2. Risk Classification & Heat Map

| Risk ID | Category | Risk Description | Severity | Likelihood | Residual Risk |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **RSK-01** | Legal / ToS | Account suspension/ban by Artlist for scripted interaction | **Critical** | Low-Med | Low |
| **RSK-02** | Runtime / MV3 | Extension service worker sleep breaks 5s polling loop | **High** | High | **Low** |
| **RSK-03** | Browser / DOM | Artlist frontend redesign / selector drift breaks download | **High** | Medium | **Low** |
| **RSK-04** | Sync / Storage | NLE (Premiere/Resolve) locks partial file during Drive sync | **High** | Medium | **Low** |
| **RSK-05** | Storage / OS | Local disk exhaustion from accumulated staging files | **Medium** | Medium | **Low** |
| **RSK-06** | Hardware / Infra| Dedicated Mac node sleep, reboot, or network drop (SPOF) | **High** | Medium | **Low** |
| **RSK-07** | Quota / UX | 35-track daily cap exhausted during peak delivery crunch | **Medium** | Medium | **Low** |
| **RSK-08** | Browser / Tab | Background tab (`active: false`) throttles DOM clicks | **Medium** | High | **Low** |
| **RSK-09** | Security / Auth | Shared Bearer token leak or unauthorized quota drain | **Medium** | Low | **Low** |
| **RSK-10** | Audio / Media | Corrupt audio headers or incorrect track variant chosen | **Medium** | Low-Med | **Low** |

---

## 3. Deep-Dive Risk Analysis & Mitigation

---

### RSK-01: Account Suspension or Flagging by Artlist
* **Category:** Legal / Platform Compliance / Operational
* **Impact:** **Critical** (If flagged, the automated account loses access; if the whole team subscription is impacted, production halts).
* **Failure Mechanism:**
  * Artlist analyzes behavioral anomalies, rapid URL access, headless browser footprints, or high download frequency in short bursts.
* **Mitigations:**
  1. **Blast-Radius Isolation:** The relay runs on a dedicated, isolated account/seat. The 5 editors retain their independent seats. If the relay account is flagged, all 5 editors continue working uninterrupted.
  2. **Non-CDP Extension Architecture:** No Selenium, Puppeteer, or remote debugging ports (`navigator.webdriver` remains `false`).
  3. **Paced Interaction & Cooldowns:** Enforce 4s–9s pre-click delays and mandatory 12s–25s inter-job cooldowns.
  4. **Hard Quota Ceiling:** Hard stop at 35 tracks/day (below the 40-track platform threshold).
* **Contingency Plan:** If the relay account is locked, the queue immediately pauses, returns `503` to editors with instructions to use their native personal seats, and alerts the team lead.

---

### RSK-02: Manifest V3 Service Worker Hibernation
* **Category:** Browser Runtime / Architecture
* **Impact:** **High** (The relay quietly stops processing new queue items after 30 seconds of inactivity).
* **Failure Mechanism:**
  * In Chrome Manifest V3, `background.js` service workers are terminated by the browser engine after ~30 seconds of idle time. A standard JavaScript `setInterval(pollQueue, 5000)` stops executing once the worker goes to sleep.
* **Mitigations:**
  1. **Option A (Primary): Pinned Dashboard Tab:** Chrome keeps a pinned tab open to `http://127.0.0.1:5000/dashboard` on the dedicated Mac. The tab runs a persistent EventSource / WebSocket connection and delegates download commands to the extension via `chrome.runtime.sendMessage`.
  2. **Option B: Chrome Offscreen Document:** Use `chrome.offscreen` API to keep an active DOM document alive for queue polling.
  3. **Option C: Native Messaging Host:** A lightweight Python script communicating via standard I/O directly with the extension.

---

### RSK-03: Frontend Redesign & Selector Drift
* **Category:** Browser / DOM Automation
* **Impact:** **High** (Downloads fail on page interaction).
* **Failure Mechanism:**
  * Artlist pushes a frontend update that changes React class names, DOM hierarchy, or introduces promotional popups/cookie banners.
* **Mitigations:**
  1. **Centralized Fallback Dictionary:** `SELECTORS` in `content.js` defines an ordered array of selector strategies for every step (e.g., `data-testid`, `aria-label`, resilient text-content matchers).
  2. **Circuit Breaker (Auto-Pause):** After 3 consecutive job failures, the FastAPI service automatically trips `queue_paused = true`, sends an alert to the team lead via Slack/Webhook, and prevents burning daily quota.
  3. **Modal Dismissal Layer:** Content script executes a pre-flight pass to dismiss known modals/banners before targeting download buttons.

---

### RSK-04: Drive Sync Race Condition & Broken NLE Media Links
* **Category:** File System & Cloud Sync
* **Impact:** **High** (Editor imports a track into Premiere Pro / DaVinci Resolve while Google Drive is still streaming/uploading, resulting in zero-byte files, locked file handles, or offline media errors).
* **Failure Mechanism:**
  * File is moved to the local Drive sync folder, but remote cloud sync takes 30–60 seconds. An editor attempts to open the file before the local client finishes syncing.
* **Mitigations:**
  1. **Atomic Local Rename on Same Volume:** Staging and Shared Library folders reside on the same APFS volume (`/Users/<User>/ArtlistRelay/staging` and `/Users/<User>/ArtlistRelay/library`), using atomic `os.rename` with zero intermediate write states.
  2. **Drive Mirror Mode over Virtual Stream:** Google Drive for Desktop configured in **"Mirror Files"** mode for the Artlist directory, ensuring local disk persistence and immediate availability.
  3. **Editor Notification with Sync Buffer:** Status endpoint / Webhook notification includes explicit status: `"status": "synced_to_drive"` with instructions to wait for local sync icon checkmark.

---

### RSK-05: Local Disk Exhaustion from Staging Leakage
* **Category:** Storage / OS Maintenance
* **Impact:** **Medium** (Mac SSD fills up over time, crashing Chrome or the FastAPI service).
* **Failure Mechanism:**
  * Crashed jobs, interrupted downloads, or orphaned `.crdownload` / `.wav` files accumulate in `staging/` without getting deleted.
* **Mitigations:**
  1. **Server Startup Reconciliation Sweep:** On startup, FastAPI scans `staging/` and purges any unreferenced files older than 1 hour.
  2. **Daily Garbage Collection Cron:** Nightly cleanup job (00:00) that unlinks any orphaned files not tied to an active in-flight job.
  3. **Disk Space Telemetry:** Add disk usage check to `GET /api/v1/status`; reject new jobs with `507 Insufficient Storage` if free disk space falls below 5 GB.

---

### RSK-06: Dedicated Node Downtime / Single Point of Failure (SPOF)
* **Category:** Infrastructure & Hardware
* **Impact:** **High** (If the Mac sleeps, updates, or loses network, the relay stops).
* **Failure Mechanism:**
  * macOS sleep mode, Wi-Fi disconnection, power outage, or automatic OS reboot.
* **Mitigations:**
  1. **Process Supervision via `launchd`:** Both the FastAPI service and Google Chrome are configured as `launchd` daemons with `<key>KeepAlive</key><true/>`.
  2. **Power & Sleep Assertion:** Run `caffeinate -d -i -m -u` as a persistent background daemon, and disable macOS automatic OS updates during work hours.
  3. **Wired Ethernet Connection:** Connect the dedicated Mac via Gigabit Ethernet rather than Wi-Fi.

---

### RSK-07: Daily Quota Depletion During Peak Deadlines
* **Category:** Operational & Capacity
* **Impact:** **Medium** (Team hits the 35-track cap before the workday ends).
* **Failure Mechanism:**
  * Heavy project delivery day where 5 editors request multiple tracks simultaneously.
* **Mitigations:**
  1. **Deduplication Cache (Zero-Quota Hits):** Requests for previously downloaded tracks return in $<1\text{s}$ with zero quota impact.
  2. **Tiered Alerting:** Automated Slack alerts at **25/35** (Warning) and **30/35** (Critical) to encourage team to check cache first.
  3. **Decentralized Fallback:** Because all 5 editors maintain individual seats (5 × 40 = 200 tracks), editors can immediately download urgent tracks directly on their own workstations if the relay cap is reached.

---

### RSK-08: Chrome Background Tab Throttling (`active: false`)
* **Category:** Browser Engine / Performance
* **Impact:** **Medium** (Content script timers or DOM clicks freeze or delay indefinitely in inactive tabs).
* **Failure Mechanism:**
  * Chromium heavily throttles `requestAnimationFrame`, `setTimeout`, and DOM render trees for inactive background tabs.
* **Mitigations:**
  1. **Foreground Tab Automation:** Because the Mac is a dedicated, unattended node, open the tab with **`active: true`**.
  2. **Tab Auto-Termination:** Keep the foreground tab open only for the 15–25 seconds required to trigger the download and confirm `chrome.downloads.onCreated`, then close it immediately with `chrome.tabs.remove(tabId)`.

---

### RSK-09: Bearer Token Leakage & Unauthorized Access
* **Category:** Security & Governance
* **Impact:** **Medium** (Unauthorized clients submit requests or tamper with queue).
* **Failure Mechanism:**
  * Shared token exposed or misused by unauthorized devices on the local network.
* **Mitigations:**
  1. **Dual-Layer Defense:** Require `Authorization: Bearer <TOKEN>` **AND** enforce subnet allowlisting (`192.168.0.0/16`, `10.0.0.0/8`, `127.0.0.1`).
  2. **Loopback-Only Worker Routes:** Worker execution endpoints (`/api/v1/worker/*`) strictly bound to `127.0.0.1` and rejected from all external IP addresses.
  3. **Immutable Audit Trail:** SQLite logs every request with `timestamp`, `requested_by`, `source_ip`, `track_id`, and `token_hash`.

---

### RSK-10: Audio Integrity & Multi-Variant Track Selection
* **Category:** Media Integrity / Creative Workflow
* **Impact:** **Medium** (Wrong track format downloaded, e.g. MP3 instead of WAV, or instrumental instead of vocal).
* **Failure Mechanism:**
  * Artlist track pages frequently offer multiple versions (Main, Instrumental, Stems, Short Versions, SFX). DOM clicker selects the default or wrong dropdown item.
* **Mitigations:**
  1. **Explicit Variant Selector Strategy:** `content.js` looks for explicit `WAV` / `Lossless` labels and defaults to the "Main Track" unless a specific variant is requested.
  2. **Binary Header Validation:** Staging move verifies the 12-byte RIFF/WAVE header (`RIFF....WAVE`) before moving the file to the library.
  3. **Minimum File Size Check:** Reject any audio file smaller than 5 MB (preventing truncated downloads or HTML error page saves).

---

## 4. Operational Runbook & Emergency Response Matrix

| Scenario | Symptom | Automated Response | Operator Action |
| :--- | :--- | :--- | :--- |
| **Session Expired** | Heartbeat fails for >15m | Queue pauses; returns `503` | Log in to Artlist on the dedicated Mac in Chrome. |
| **Selector Drift** | 3 consecutive job failures | Queue auto-pauses; Slack alert | Inspect Artlist DOM; update `SELECTORS` in `content.js`. |
| **Daily Cap Hit** | 35 downloads reached | Rejects with `429 Too Many Requests` | Editors switch to personal seats for remainder of day. |
| **Mac Node Offline** | API unreachable from workstations | Clients display offline error | Verify physical power, Ethernet, and `launchd` status. |
| **Drive Out of Sync** | File on Mac but not editor PC | N/A | Check Google Drive for Desktop app status / restart client. |

---

## 5. Conclusion & Recommendations

The architecture outlined in **PRD v1.2** is robust and strategically protected against single points of failure. By implementing:
1. **Isolated relay account** (protecting team seats),
2. **Foreground tab execution** (bypassing Chromium throttling),
3. **Atomic same-volume file moves** (eliminating Drive sync race conditions), and
4. **Automated circuit breakers** (pausing on session expiry or 3 consecutive errors),

the residual risk across all operational dimensions is reduced to **Low**.
