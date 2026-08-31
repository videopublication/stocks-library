# Implementation Plan - Native OS-Level Automation Agent

Build a native Python desktop agent that operates at the operating-system level to control Chrome directly. This eliminates all JavaScript sandbox constraints, emits genuine hardware-level mouse/keyboard events (`isTrusted: true`), avoids CDP/webdriver bot signatures, and autonomously drives Music, SFX, and Multi-track Stems downloads.

---

## Architecture Overview

```
 ┌────────────────────────────────────────────────────────┐
 │            FastAPI Relay Server (Port 5000)            │
 │            • SQLite Queue (WAL Mode)                   │
 │            • Deduplication & Cache-First Engine        │
 └──────────────────────────┬─────────────────────────────┘
                            │ HTTP Polling (or direct Python import)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │            Native OS-Level Agent (os_agent.py)         │
 │                                                        │
 │ 1. Queue Listener (Polls pending Music / SFX / Stems)  │
 │ 2. Chrome Window Manager (Focuses & positions window)   │
 │ 3. Vision Engine (OpenCV template matching for buttons)│
 │ 4. Hardware Input Dispatcher (Win32 / PyAutoGUI clicks)│
 │ 5. File Ingestion Watcher (Validates & moves to lib)   │
 └──────────────────────────┬─────────────────────────────┘
                            │ Real OS Hardware Input (isTrusted: true)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │          Standard Google Chrome (Desktop User)         │
 │          • Real user profile & active Artlist session  │
 │          • Zero CDP / Zero webdriver / Zero bot flags  │
 └────────────────────────────────────────────────────────┘
```

---

## User Review Required

> [!IMPORTANT]
> **Dedicated Screen / Monitor Requirement:**
> Because the OS agent physically moves your operating system's hardware mouse pointer and sends keystrokes, the machine's screen should not be actively used by another person while a 15-second download sequence is executing.

---

## Proposed Changes

### Component 1: Python OS Agent Core & Templates

#### [NEW] [`backend/os_agent.py`](file:///d:/Code/Artlist/backend/os_agent.py)
* **Job Poller:** Queries `/api/v1/worker/next` or directly calls `service.claim_next_job_for_worker()`.
* **Browser Automation:** Launches/navigates Google Chrome to the canonical Artlist URL (`https://artlist.io/...`).
* **Visual Locator Engine:** Uses OpenCV template matching (`cv2.matchTemplate`) with scale & grayscale resilience to find:
  * Hero Download Button (Direct Music / SFX)
  * Stems Icon Button (Hero action row & persistent player bar)
  * "Download All Stems" button inside modal
  * "WAV" / Format picker popovers
* **Hardware Input Dispatcher:**
  * Moves the physical OS mouse via smooth Bézier curve interpolation (`pyautogui.moveTo` with quadratic ease-in-out).
  * Executes hardware-level clicks (`pyautogui.click()` / `win32api.mouse_event`).
  * Closes tab via `Ctrl + W` once download begins.
* **File Delivery Watcher:** Observes the download destination, waits for `.crdownload` completion, verifies RIFF/WAVE or PKZip headers, and registers completion with the database.
* **Cooldown Manager:** Enforces 45s–90s randomized intervals between jobs.

#### [NEW] [`templates/`](file:///d:/Code/Artlist/templates/)
Directory holding visual reference templates for template matching:
* `stems_icon_hero.png` (Hero action bar Stems button)
* `stems_icon_player.png` (Bottom player Stems icon)
* `download_all_stems.png` ("Download All Stems" modal pill button)
* `download_button.png` (Standard track direct download icon)
* `wav_option.png` (Lossless WAV dropdown option)

---

### Component 2: CLI Runner & Dependencies

#### [MODIFY] [`run_relay.py`](file:///d:/Code/Artlist/run_relay.py)
* Add `--mode=agent` or `--os-agent` flag so the user can run either:
  1. `python run_relay.py` (Server mode - for Extension worker or web portal)
  2. `python run_relay.py --os-agent` (Full Standalone - Server + Native OS Agent running concurrently)

#### [MODIFY] [`README.md`](file:///d:/Code/Artlist/README.md)
* Document requirements: `pip install pyautogui opencv-python pillow pywinauto`
* Provide quickstart instructions for launching the OS agent.

---

## Verification Plan

### Automated Tests
* Run unit test suite to ensure backend service compatibility:
  ```powershell
  python test_relay.py
  ```

### Manual Verification
1. **Template Matching Test:** Run a visual calibration test script (`test_vision.py`) to verify on-screen button detection across 1080p/1440p resolutions.
2. **Music Download Test:** Submit a standard song URL (`royalty-free-music/song/...`) and verify the OS cursor physically moves to the download button, clicks it, and delivers the WAV to `library/`.
3. **SFX Download Test:** Submit a Sound Effect link (`sfx/track/...`) and verify the OS agent downloads the audio cleanly.
4. **Stems Download Test:** Submit a Stems link with `variant="stems"`, verify the OS agent clicks the Stems icon, waits for the modal, clicks "Download All Stems", and delivers the `.zip` to `library/`.
