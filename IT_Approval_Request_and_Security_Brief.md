# Internal Stock Asset Relay System: Security & Architecture Overview

## 1. Executive Summary & Business Pain Point

### The Problem:
Our creative production workflows (video editing, sound design, motion graphics, social media content) require daily access to licensed assets from our corporate stock subscriptions (**Artlist** for music/SFX/stems, and **Envato Elements** for video templates, motion graphics, stock footage, and sound design).

Currently, this creates two major challenges:
1. **Security Vulnerability (Credential Sharing):** Sharing master login credentials across multiple workstations creates a serious risk of password compromise, unauthorized account changes, and multi-device session invalidations.
2. **Productivity Bottleneck:** Editors frequently have to interrupt the account holder to manually download individual audio tracks, video templates, and stems, causing project turnaround delays and workflow friction.

### The Solution:
We have developed an **Internal Stock Asset Relay System**—a lightweight, locally hosted service running on a single dedicated machine that holds the authorized stock subscription sessions.

Team members submit asset URLs (e.g., `artlist.io/...` or `elements.envato.com/...`) to an internal local web dashboard. The relay automatically downloads the asset, indexes it into our local shared media library (`library/`), and serves it to team members without exposing credentials or requiring direct browser logins on client editing machines.

```
┌────────────────────────┐         ┌────────────────────────────────────────────────────────┐
│  Editor Workstations   │         │            Dedicated Relay Host (Local Workstation)     │
│                        │         │                                                        │
│  [Editor 1]  [Editor 2]│  HTTP   │  ┌──────────────────┐      ┌────────────────────────┐  │
│      │           │     │ ──────> │  │ Local FastAPI    │ ───> │ Native OS Agent        │  │
│      └─────┬─────┘     │  (LAN)  │  │ Queue & Auth     │      │ (Artlist & Envato)     │  │
│            │           │         │  └────────┬─────────┘      └───────────┬────────────┘  │
│            ▼           │         │           │                            │               │
│   Shared Media Library │ <───────────────────┴────────────────────────────┘               │
│   (Local Network Path) │         │       Indexed Library / Staging Sandbox                │
└────────────────────────┘         └────────────────────────────────────────────────────────┘
```

---

## 2. Technical & Security Architecture

The system was engineered with an **isolated, zero-trust security model**:

| Security Domain | Implementation | Security Benefit |
| :--- | :--- | :--- |
| **Network Boundary** | Runs on `127.0.0.1:5000` (Loopback / Local Subnet only) | Zero public internet exposure; inaccessible outside the corporate firewall. |
| **Credential Safety** | **No passwords or API secrets stored** | The tool does NOT capture, store, or transmit login credentials. An administrator logs into Artlist & Envato in Chrome once. |
| **Filesystem Sandboxing** | Strict Path Validation (`Path.relative_to`) | Downloads are written strictly to an isolated staging folder (`staging/`) and verified before moving to `library/`. Traversal attacks outside these directories return `403 Forbidden`. |
| **Domain Whitelisting** | Whitelisted to `artlist.io` and `elements.envato.com` | Strict URL validation prevents connecting to unauthorized or arbitrary web domains. |
| **Local Data Storage** | Embedded SQLite (`artlist_relay.db`) | No external cloud databases, telemetry, or remote telemetry logging. All records remain on local disk. |
| **Anti-Bot & Account Safety** | Native Windows OS Input (`isTrusted: true`) | Uses genuine OS-level hardware mouse/keyboard events. Does NOT use invasive CDP debuggers or modified browser binaries. |
| **Quota & Rate Limiting** | Configurable Daily Caps (`DAILY_SAFETY_LIMIT`) | Prevents abnormal bulk scraping, enforces human cooldown intervals, and protects corporate subscription terms. |

---

## 3. Supported Providers & Roadmap

| Provider | Supported Asset Types | Status |
| :--- | :--- | :--- |
| **Artlist** (`artlist.io`) | Lossless WAV Music, Multi-Track Stems, Sound Effects (SFX) | **Production-Ready (Active)** |
| **Envato Elements** (`elements.envato.com`) | Video Templates (Premiere, AE, DaVinci), Stock Video, SFX, Graphics | **Phase 2 (Architected & Ready)** |

### How the Automation Works (Step-by-Step):
1. **Submission:** An editor pastes an Artlist or Envato Elements URL into the internal dashboard.
2. **Duplicate Detection:** The relay checks the local database first. If the file already exists in our library, it delivers the local file instantly (**0 subscription quota spent**).
3. **Queue Processing:** Jobs are queued in SQLite (FIFO).
4. **Execution:** The Native OS Agent brings Chrome to focus, navigates to the whitelisted stock site, selects the required format / project license, and triggers the download using human-like mouse movement.
5. **Validation & Verification:** The relay tracks file growth in `staging/`, validates file integrity (RIFF/WAV headers or ZIP archive verification), and moves the verified file to `library/`.
6. **Session Cleanup:** The active tab is closed automatically (with safeguards preventing the dashboard tab from closing).

---

## 4. Compliance & Risk Assessment

| Risk Item | Likelihood | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Data Exfiltration** | Zero | None | The software is 100% open source within the company. Zero external outbound telemetry. |
| **Account Ban / Flagging** | Extremely Low | Low | Enforces daily download limits (e.g. 20/day) and randomized human cooldown intervals between downloads. |
| **Malicious File Ingestion** | Extremely Low | Low | Whitelisted strictly to `artlist.io` and `elements.envato.com`. Validates MIME types and file headers prior to library indexing. |
| **Unauthorized LAN Access** | Low | Low | All dashboard actions and REST endpoints are protected with Bearer Token authentication (`AUTH_TOKEN`). |

---

## 5. Scope of Code & Technology Stack

The entire solution is lightweight, auditable, and transparent:
* **Backend:** Python 3.10+ (FastAPI, SQLite, PyAutoGUI, pywinauto).
* **Frontend:** Vanilla HTML5, CSS3, and JavaScript (zero external CDN dependencies or npm bloat).
* **Code Size:** ~1,800 lines of fully commented, auditable Python & JS code.
* **Test Suite:** 15 automated unit & integration tests covering path isolation, circuit breakers, header validation, and queue reconciliation.

---

## 6. Action Requested from IT

We kindly request IT approval to:
1. Run this internal service on a designated, locked workstation within the internal network.
2. Allow internal editors on the local subnet to access the dashboard (`http://<host-ip>:5000/`) using their pre-shared authorization token.

---

### 📂 Code Review Availability:
The complete source repository is available for your review, including:
* All Python backend services and endpoints (`backend/`)
* Native OS automation engine (`backend/os_agent.py`)
* Full test suite and regression tests (`test_relay.py`)

*Please let us know if you have any questions or require a short live demonstration.*
