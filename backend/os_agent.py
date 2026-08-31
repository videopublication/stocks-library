"""
Native OS-Level Automation Agent for Artlist Relay (v3)
=======================================================
UIA-First approach: Controls Google Chrome via Windows UIAutomation (pywinauto).
Bypasses Vision/OpenCV fragility with document-scoped accessibility traversal,
strict rect bounds validation, phase heartbeats, and hardware mouse input.
"""

import os
import sys
import time
import random
import shutil
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict, Any, List

import pyautogui
import win32gui
import win32con
from pywinauto import Application
from pywinauto.findwindows import find_windows, ElementNotFoundError

# Add root directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import settings
from backend.service import (
    claim_next_job_for_worker,
    complete_worker_job,
    fail_worker_job,
    update_job_phase,
    is_working_hours,
    get_health,
    set_health,
    normalize_artlist_url,
)
from backend.database import get_db
from backend.vision import is_vision_enabled, locate_element_with_gemini

# PyAutoGUI safety settings
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.05


def is_extension_active() -> bool:
    """Check if the Chrome Extension sent a heartbeat recently (mutual exclusivity lock)."""
    try:
        with get_db(write=False) as conn:
            wtype = get_health(conn, "worker_type", "")
            last_hb_str = get_health(conn, "last_heartbeat", "")
            if wtype == "extension" and last_hb_str:
                last_hb = datetime.fromisoformat(last_hb_str)
                if datetime.now() - last_hb < timedelta(seconds=60):
                    return True
    except Exception as e:
        print(f"[OS Agent] Error checking heartbeat: {e}")
    return False


# ------------------------------------------------------------- Window & UIA Management

def find_chrome_executable() -> str:
    """Finds the absolute path to Chrome executable on Windows."""
    candidates = [
        shutil.which('chrome'),
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
        os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
        os.path.expandvars(r'%PROGRAMFILES%\Google\Chrome\Application\chrome.exe'),
    ]
    for p in candidates:
        if p and os.path.exists(p):
            return p
    return "chrome"


def open_url_in_chrome(url: str, timeout: float = 15.0):
    """Directly opens target URL in Chrome and reliably attaches to the window."""
    chrome_exe = find_chrome_executable()
    print(f"[OS Agent] Navigating to: {url} via {chrome_exe}")

    try:
        subprocess.Popen([chrome_exe, "--force-renderer-accessibility", url])
    except Exception as e:
        print(f"[OS Agent] Direct launch error: {e}, falling back to shell start...")
        os.system(f'start "" "{chrome_exe}" --force-renderer-accessibility "{url}"')

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            # 1. Check current foreground window first
            fg_hwnd = win32gui.GetForegroundWindow()
            if fg_hwnd:
                fg_title = win32gui.GetWindowText(fg_hwnd)
                fg_class = win32gui.GetClassName(fg_hwnd)
                if "chrome" in fg_class.lower() or "chrome" in fg_title.lower() or "artlist" in fg_title.lower():
                    try:
                        app = Application(backend="uia").connect(handle=fg_hwnd)
                        return app.window(handle=fg_hwnd)
                    except Exception:
                        pass

            # 2. Look for Artlist or Chrome title in UIA
            hwnds = find_windows(title_re="(?i).*Artlist.*|.*Chrome.*", backend="uia")
            if not hwnds:
                # 3. Look for Chrome class name
                hwnds = find_windows(class_name="Chrome_WidgetWin_1", backend="uia")

            if hwnds:
                for hwnd in hwnds:
                    try:
                        app = Application(backend="uia").connect(handle=hwnd)
                        return app.window(handle=hwnd)
                    except Exception:
                        continue
        except Exception:
            pass
        time.sleep(0.8)

    raise RuntimeError("Could not locate Google Chrome window within timeout.")


def focus_chrome_safely(chrome_win):
    """Asserts focus safely. Desktop must be unlocked."""
    try:
        hwnd = getattr(chrome_win, "handle", None)
        if hwnd:
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            win32gui.SetForegroundWindow(hwnd)
        chrome_win.set_focus()
        time.sleep(0.4)
    except Exception as e:
        print(f"[OS Agent] Focus assertion notice: {e}")


def close_chrome_tab_safely(chrome_win):
    """
    Safely closes ONLY the active stock asset tab.
    Strictly protects the Setu Dashboard tab (127.0.0.1:5000 / 'Setu' / 'Artlist Library') from being closed.
    """
    try:
        if not chrome_win:
            return
        
        # Check active window title
        win_title = chrome_win.window_text() if hasattr(chrome_win, "window_text") else ""
        if "setu" in win_title.lower() or "artlist library" in win_title.lower() or "127.0.0.1" in win_title or "localhost" in win_title:
            print("[OS Agent] Active tab is Setu Dashboard (127.0.0.1:5000). Protecting dashboard from Ctrl+W.")
            return

        try:
            doc = get_page_document(chrome_win)
            doc_name = doc.window_text() if hasattr(doc, "window_text") else ""
            if "setu" in doc_name.lower() or "artlist library" in doc_name.lower() or "127.0.0.1" in doc_name or "localhost" in doc_name:
                print("[OS Agent] Document is Setu Dashboard. Protecting dashboard from Ctrl+W.")
                return
        except Exception:
            pass

        focus_chrome_safely(chrome_win)
        hwnd = getattr(chrome_win, "handle", None)
        if hwnd and win32gui.GetForegroundWindow() == hwnd:
            # Re-check foreground window title before sending hotkey
            fg_title = win32gui.GetWindowText(hwnd)
            if "setu" in fg_title.lower() or "artlist library" in fg_title.lower() or "127.0.0.1" in fg_title or "localhost" in fg_title:
                print("[OS Agent] Foreground window is Setu Dashboard. Skipping Ctrl+W.")
                return

            pyautogui.hotkey('ctrl', 'w')
            time.sleep(0.3)
    except Exception as e:
        print(f"[OS Agent] Tab close notice: {e}")


def assert_auth_state(chrome_win) -> bool:
    """Checks UIA tree for signs of authentication (Avatar) or logged-out state ('Sign In')."""
    try:
        doc = get_page_document(chrome_win)
        sign_in_btn = doc.child_window(title_re="(?i)^(Sign in|Log in)$", control_type="Button")
        if sign_in_btn.exists(timeout=1.5):
            print("[OS Agent] Auth Assertion Failed: 'Sign In' button detected. User is logged out.")
            return False
        return True
    except Exception:
        return True


def extract_track_title(chrome_win) -> str:
    """Extracts track title from Chrome's window title (e.g., 'TrackName - Artist | Artlist...')."""
    try:
        title = chrome_win.window_text()
        if title and " - " in title:
            return title.split(" - ")[0].strip()
    except Exception:
        pass
    return "Unknown Track"


def get_page_document(chrome_win):
    """Descends into Chrome's Document control to scope searches strictly to web content."""
    try:
        doc = chrome_win.child_window(control_type="Document", found_index=0)
        if doc.exists(timeout=2.0):
            return doc
    except Exception:
        pass
    return chrome_win


def find_uia_element(chrome_win, title_re: str, control_types: Optional[List[str]] = None, timeout: float = 10.0, min_x: int = 180, min_y: int = 150, max_y_ratio: float = 0.85, max_width: int = 450, max_height: int = 150):
    """
    Finds a UIA element scoped to the page document, with fallback to window,
    with rect bounds validation, max dimensions check (to exclude large containers),
    and boundary exclusions (min_x, min_y) to avoid clicking navigation sidebar or top search/header bars.
    """
    if control_types is None:
        control_types = ["Button", "Hyperlink", "MenuItem", "Custom", "Image", "Group"]

    screen_w, screen_h = pyautogui.size()
    max_y = int(screen_h * max_y_ratio)
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        targets = [get_page_document(chrome_win)]
        if targets[0] != chrome_win:
            targets.append(chrome_win)

        for target in targets:
            # 1. First try matching by title regex alone (unrestricted control type)
            try:
                el = target.child_window(title_re=title_re, found_index=0)
                if el.exists(timeout=0.25):
                    r = el.rectangle()
                    if 0 < r.width() <= max_width and 0 < r.height() <= max_height:
                        mid = r.mid_point()
                        if min_x < mid.x < screen_w - 10 and min_y < mid.y < max_y:
                            try:
                                el.set_focus()
                            except Exception:
                                pass
                            return r
            except Exception:
                pass

            # 2. Try each specific control type
            for ctype in control_types:
                try:
                    el = target.child_window(title_re=title_re, control_type=ctype, found_index=0)
                    if el.exists(timeout=0.2):
                        r = el.rectangle()
                        if 0 < r.width() <= max_width and 0 < r.height() <= max_height:
                            mid = r.mid_point()
                            if min_x < mid.x < screen_w - 10 and min_y < mid.y < max_y:
                                try:
                                    el.set_focus()
                                except Exception:
                                    pass
                                return r
                except Exception:
                    pass
        time.sleep(0.35)
    return None


def locate_track_download_target(chrome_win) -> Tuple[int, int]:
    """
    Finds the exact (X, Y) coordinates of the circular Download button in the track Hero section / SFX row.
    Uses Gemini Vision if configured, with Play button anchor fallback.
    """
    # 0. Try Gemini Multimodal Vision if API Key is configured
    if is_vision_enabled():
        pt = locate_element_with_gemini("the circular download icon button next to the yellow Play button or track title")
        if pt:
            return pt

    # 1. Search for Play button anchor in the main content area (min_x=180, min_y=150)
    play_rect = find_uia_element(chrome_win, title_re=r"(?i)^(Play|Play\s*track|Play\s*song|Play\s*sfx|^Play.*)$", min_x=180, min_y=150, timeout=4.0)
    if play_rect:
        print(f"[OS Agent] Found 'Play' anchor button at {play_rect}")
        # On Artlist's Hero section, the circular Download button is 35px right of Play button edge
        target_x = play_rect.right + 35
        target_y = play_rect.mid_point().y
        return target_x, target_y

    # 2. Fallback: Search for direct download element (min_x=180, min_y=150 to skip sidebar & top nav)
    dl_rect = find_uia_element(chrome_win, title_re=r"(?i).*(direct\s*download|download\s*track|download\s*song|download\s*sfx).*", min_x=180, min_y=150, timeout=4.0)
    if dl_rect:
        return dl_rect.mid_point().x, dl_rect.mid_point().y

    # 3. Broader download element fallback (strictly min_x=180, min_y=150 and max_y < 75%)
    dl_rect = find_uia_element(chrome_win, title_re=r"(?i).*download.*", min_x=180, min_y=150, max_y_ratio=0.75, timeout=3.0)
    if dl_rect:
        return dl_rect.mid_point().x, dl_rect.mid_point().y

    raise RuntimeError("Could not locate track Download button on page.")


def locate_stems_trigger_target(chrome_win) -> Tuple[int, int]:
    """
    Finds the exact (X, Y) coordinates of the Stems/Versions trigger button (the 4th circular icon with music note).
    Uses Gemini Vision if configured, with Play button anchor fallback.
    """
    # 0. Try Gemini Multimodal Vision if API Key is configured
    if is_vision_enabled():
        pt = locate_element_with_gemini("the circular stems icon button with a music note in layers next to the yellow Play button")
        if pt:
            return pt

    # 1. Check Play anchor (4th circular icon with music note is ~220px right of Play button edge)
    play_rect = find_uia_element(chrome_win, title_re=r"(?i)^(Play|Play\s*track|Play\s*song|^Play.*)$", min_x=180, timeout=4.0)
    if play_rect:
        print(f"[OS Agent] Found 'Play' anchor button for Stems at {play_rect}")
        target_x = play_rect.right + 220
        target_y = play_rect.mid_point().y
        return target_x, target_y

    # 2. Fallback: Search for Stems element (min_x=180)
    stems_rect = find_uia_element(chrome_win, title_re=r"(?i).*(stems?|versions?).*", min_x=180, timeout=4.0)
    if stems_rect:
        return stems_rect.mid_point().x, stems_rect.mid_point().y

    raise ValueError("NO_STEMS")


# ------------------------------------------------------------- Human Hardware Mouse (Bézier Engine)

import math

def calculate_bezier_point(p0: Tuple[float, float], p1: Tuple[float, float], p2: Tuple[float, float], p3: Tuple[float, float], t: float) -> Tuple[float, float]:
    """Calculates a point along a cubic Bézier curve at parameter t in [0, 1]."""
    u = 1 - t
    tt = t * t
    uu = u * u
    uuu = uu * u
    ttt = tt * t

    x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0]
    y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1]
    return x, y


def human_move_bezier(target_x: int, target_y: int, duration_range: Tuple[float, float] = (0.16, 0.28)):
    """
    Simulates swift, natural human-like mouse movement using subtle Cubic Bézier curves
    with fast acceleration and crisp deceleration without sluggish artificial pauses.
    """
    start_x, start_y = pyautogui.position()
    
    # Natural click padding on target button
    final_x = target_x + random.randint(-2, 2)
    final_y = target_y + random.randint(-2, 2)
    
    dist = math.hypot(final_x - start_x, final_y - start_y)
    if dist < 10:
        pyautogui.moveTo(final_x, final_y)
        return

    # Natural subtle arc (6% - 14% deviation, not huge exaggerated loops)
    p0 = (float(start_x), float(start_y))
    p3 = (float(final_x), float(final_y))

    arc_direction = 1 if random.random() < 0.5 else -1
    arc_magnitude = random.uniform(0.06, 0.14) * dist

    dx = p3[0] - p0[0]
    dy = p3[1] - p0[1]
    perp_x = -dy / dist * arc_magnitude * arc_direction
    perp_y = dx / dist * arc_magnitude * arc_direction

    p1 = (p0[0] + dx * 0.35 + perp_x, p0[1] + dy * 0.35 + perp_y)
    p2 = (p0[0] + dx * 0.70 + perp_x * 0.5, p0[1] + dy * 0.70 + perp_y * 0.5)

    duration = random.uniform(*duration_range)
    # Tight step count for snappy 60fps-like flick
    num_steps = max(10, min(25, int(dist / 35)))
    step_sleep = duration / num_steps

    for i in range(num_steps + 1):
        linear_t = i / num_steps
        # Cosine ease-in-out velocity profile (accelerates then decelerates)
        eased_t = (1 - math.cos(linear_t * math.pi)) / 2
        
        bx, by = calculate_bezier_point(p0, p1, p2, p3, eased_t)
        pyautogui.moveTo(int(bx), int(by))
        time.sleep(step_sleep)


def human_move_and_click(x: int, y: int, duration_range: Tuple[float, float] = (0.16, 0.28)):
    """
    Fast, snappy human mouse movement with realistic crisp click timing.
    """
    human_move_bezier(x, y, duration_range)
    
    # Fast natural hover before clicking (30 - 60ms)
    time.sleep(random.uniform(0.03, 0.06))
    
    # Real mouse down / hold / mouse up
    pyautogui.mouseDown()
    time.sleep(random.uniform(0.04, 0.07))
    pyautogui.mouseUp()
    
    # Crisp post-click dwell
    time.sleep(random.uniform(0.05, 0.10))


# ------------------------------------------------------------- Download Completion & Diff Watcher

def snapshot_directory(directory: Path) -> Dict[str, int]:
    """Takes a snapshot of the directory, mapping filename to file size."""
    if not directory.exists():
        return {}
    return {p.name: p.stat().st_size for p in directory.glob("*") if p.is_file()}


def watch_download_with_diff(job: Dict[str, Any], staging_dir: Path, pre_snapshot: Dict[str, int], timeout: float = 120.0, stall_timeout: float = 20.0) -> Dict[str, Any]:
    """
    Watches staging using a pre-click snapshot diff and file-size growth tracking.
    Emits phase updates continuously to keep reaper from killing live in-flight jobs.
    """
    job_id = job["job_id"]
    print(f"[OS Agent] Watching {staging_dir} for download completion...")
    deadline = time.time() + timeout
    
    last_size = 0
    stall_start = time.time()

    while time.time() < deadline:
        # Check if job was cancelled by user via dashboard
        try:
            with get_db(write=False) as conn:
                row = conn.execute("SELECT status, error FROM jobs WHERE id = ?", (job_id,)).fetchone()
                if row and row["status"] == "failed" and "cancel" in str(row["error"]).lower():
                    print(f"[OS Agent] Job {job_id} was cancelled by user. Terminating download watch.")
                    return {}
        except Exception:
            pass

        current_snapshot = snapshot_directory(staging_dir)
        new_files = [f for f in current_snapshot.keys() if f not in pre_snapshot or current_snapshot[f] != pre_snapshot.get(f)]
        
        # Look for in-progress browser temporary files (.crdownload / .tmp)
        crdownloads = [f for f in new_files if f.lower().endswith((".crdownload", ".tmp"))]
        if crdownloads:
            crdownload_name = crdownloads[0]
            current_size = current_snapshot.get(crdownload_name, 0)
            
            # Emit active progress heartbeat
            update_job_phase(job_id, "downloading", f"Downloading {crdownload_name}...", current_size, 0)
            
            # Reset stall tracking only when size increases
            if current_size > last_size:
                last_size = current_size
                stall_start = time.time()
            elif time.time() - stall_start > stall_timeout:
                raise TimeoutError(f"Download hung (size stalled at {current_size} bytes for {stall_timeout}s): {crdownload_name}")
        
        # Look for the finalized audio/zip file
        finalized = [f for f in new_files if f.lower().endswith((".wav", ".zip", ".mp3"))]
        if finalized:
            detected_file = staging_dir / finalized[0]
            
            # Wait 1s for OS file flush to complete
            time.sleep(1.0)
            file_size = detected_file.stat().st_size
            if file_size >= settings.MIN_AUDIO_BYTES:
                print(f"[OS Agent] Download completed: {detected_file.name} ({file_size} bytes)")
                update_job_phase(job_id, "moving", "Moving verified file to library...", file_size, file_size)
                
                return complete_worker_job(
                    job_id=job_id,
                    temp_filename=str(detected_file),
                    reported_bytes=file_size,
                    track_title=job.get("extracted_title") or detected_file.stem
                )
                
        time.sleep(0.8)

    raise TimeoutError(f"Download did not complete within {timeout} seconds.")


# ------------------------------------------------------------- Workflow Execution

def locate_envato_download_target(chrome_win) -> Tuple[int, int]:
    """Finds the primary Download button on an Envato Elements page."""
    if is_vision_enabled():
        pt = locate_element_with_gemini("the primary green download button on the Envato Elements item page")
        if pt:
            return pt

    # Search for Envato Download button via UIA (min_x=180, min_y=150)
    dl_rect = find_uia_element(
        chrome_win,
        title_re=r"(?i)^(Download|Download\s*now|Add\s*to\s*project.*|Free\s*download)$",
        control_types=["Button", "Hyperlink", "Custom"],
        min_x=180,
        min_y=150,
        timeout=5.0
    )
    if dl_rect:
        return dl_rect.mid_point().x, dl_rect.mid_point().y

    # Fallback to broader download match
    dl_rect = find_uia_element(chrome_win, title_re=r"(?i).*download.*", min_x=180, min_y=150, max_y_ratio=0.75, timeout=4.0)
    if dl_rect:
        return dl_rect.mid_point().x, dl_rect.mid_point().y

    raise RuntimeError("Could not locate Envato Elements Download button on page.")


def check_cancellation(job_id: str):
    """Raises RuntimeError('Cancelled by user') if job was cancelled via dashboard."""
    try:
        with get_db(write=False) as conn:
            row = conn.execute("SELECT status, error FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if row and row["status"] == "failed" and "cancel" in str(row.get("error") or "").lower():
                raise RuntimeError("Cancelled by user")
    except RuntimeError:
        raise
    except Exception:
        pass


def execute_os_job(job: Dict[str, Any]):
    """Executes a single download job using UIAutomation and Hardware Mouse events."""
    job_id = job["job_id"]
    raw_url = job["url"]
    provider = job.get("provider") or ("envato" if "envato.com" in raw_url else "artlist")
    
    if provider == "artlist":
        target_url = normalize_artlist_url(raw_url)
    else:
        target_url = raw_url

    variant = (job.get("variant") or "main").lower()

    print(f"\n=======================================================")
    print(f"[OS Agent] Starting Job: {job_id} ({provider.upper()})")
    print(f" • Target URL : {target_url}")
    print(f" • Variant    : {variant}")
    print(f"=======================================================")

    check_cancellation(job_id)

    # 1. Open URL directly in Chrome
    update_job_phase(job_id, "opening_tab", f"Opening {target_url}...")
    chrome_win = open_url_in_chrome(target_url)
    job["_chrome_win"] = chrome_win
    focus_chrome_safely(chrome_win)

    # 2. Page Hydration
    update_job_phase(job_id, "page_loading", "Waiting for page hydration...")
    print("[OS Agent] Waiting for page hydration...")
    time.sleep(random.uniform(4.5, 6.0))
    focus_chrome_safely(chrome_win)
    check_cancellation(job_id)

    # 3. Auth Assertion (Artlist)
    if provider == "artlist" and not assert_auth_state(chrome_win):
        with get_db(write=True) as conn:
            set_health(conn, "session_authenticated", "false")
        raise PermissionError("Artlist Session Logged Out. Cannot proceed.")

    # 4. Extract Track Title from DOM via UIA
    update_job_phase(job_id, "reading_title", "Reading asset details...")
    title = extract_track_title(chrome_win)
    if title:
        job["extracted_title"] = title
    print(f"[OS Agent] Extracted Title: '{job.get('extracted_title', 'Unknown')}'")

    # Take staging snapshot baseline BEFORE triggering download
    pre_snapshot = snapshot_directory(settings.STAGING_PATH)
    check_cancellation(job_id)

    if provider == "envato":
        # ---------------- ENVATO ELEMENTS WORKFLOW ----------------
        update_job_phase(job_id, "locating_download", "Locating Envato Download button...")
        print("[OS Agent] Locating Envato Elements download button...")
        env_x, env_y = locate_envato_download_target(chrome_win)
        
        update_job_phase(job_id, "selecting_variant", "Triggering Envato download...")
        print(f"[OS Agent] Clicking Envato download at ({env_x}, {env_y})...")
        human_move_and_click(env_x, env_y)
        
        time.sleep(1.2)
        # Check if project modal / "Add & Download" popped up
        add_dl_rect = find_uia_element(
            chrome_win,
            title_re=r"(?i).*(Add\s*&\s*Download|Download\s*without\s*license|Create\s*new\s*project|Add\s*to\s*project).*",
            min_x=0,
            timeout=3.5
        )
        if add_dl_rect:
            print(f"[OS Agent] Confirming Envato project download at {add_dl_rect}...")
            human_move_and_click(add_dl_rect.mid_point().x, add_dl_rect.mid_point().y)

    elif variant == "stems":
        # ---------------- ARTLIST STEMS WORKFLOW ----------------
        update_job_phase(job_id, "locating_download", "Locating Stems button...")
        print("[OS Agent] Locating Stems trigger via Play anchor / Document UIA...")
        stems_x, stems_y = locate_stems_trigger_target(chrome_win)
        
        print(f"[OS Agent] Clicking Stems trigger at ({stems_x}, {stems_y})...")
        human_move_and_click(stems_x, stems_y)

        # 2. Ensure Stems tab in modal
        time.sleep(1.5)
        stems_tab_rect = find_uia_element(chrome_win, title_re=r"(?i)^Stems$", control_types=["TabItem", "Button", "Custom", "Text"], min_x=0, timeout=3.0)
        if stems_tab_rect:
            human_move_and_click(stems_tab_rect.mid_point().x, stems_tab_rect.mid_point().y)
            time.sleep(0.8)

        # 3. "Download All Stems" in modal
        print("[OS Agent] Locating 'Download All Stems' via UIA...")
        dl_all_rect = find_uia_element(chrome_win, title_re=r"(?i).*(Download\s*All\s*Stems|Download\s*All|Download\s*Stems|All\s*Stems).*", min_x=0, timeout=4.0)
        
        screen_w, screen_h = pyautogui.size()
        if dl_all_rect:
            dl_x, dl_y = dl_all_rect.mid_point().x, dl_all_rect.mid_point().y
        else:
            # Geometric fallback: 'Download All Stems' button sits at X: ~76%, Y: ~42% inside the modal
            dl_x = int(screen_w * 0.76)
            dl_y = int(screen_h * 0.42)
            print(f"[OS Agent] 'Download All Stems' UIA unresolved, executing geometric modal click at ({dl_x}, {dl_y})...")

        update_job_phase(job_id, "selecting_variant", "Triggering Stems download...")
        print(f"[OS Agent] Clicking Download All Stems at ({dl_x}, {dl_y})...")
        human_move_and_click(dl_x, dl_y)
        
        # 4. Handle Format Popover (WAV / ZIP)
        # Dropdown menu hangs directly below the Download All Stems button at dl_y + 42
        time.sleep(0.7)
        target_wav_x = dl_x - 25
        target_wav_y = dl_y + 42
        print(f"[OS Agent] Clicking 'WAV' stems dropdown option at ({target_wav_x}, {target_wav_y})...")
        human_move_and_click(target_wav_x, target_wav_y)

    else:
        # ---------------- MUSIC & SFX WORKFLOW ----------------
        update_job_phase(job_id, "locating_download", "Locating Download button...")
        print("[OS Agent] Locating direct Download button via Play anchor / Document UIA...")
        dl_x, dl_y = locate_track_download_target(chrome_win)
        
        update_job_phase(job_id, "selecting_format", "Triggering download...")
        print(f"[OS Agent] Clicking Download button at ({dl_x}, {dl_y})...")
        human_move_and_click(dl_x, dl_y)

        # Check if download already started (common for SFX / 1-click downloads)
        time.sleep(0.8)
        current_staging = snapshot_directory(settings.STAGING_PATH)
        new_in_staging = set(current_staging.keys()) - set(pre_snapshot.keys())
        if any(f.lower().endswith((".crdownload", ".tmp", ".wav", ".mp3", ".zip")) for f in new_in_staging):
            print("[OS Agent] Download initiated directly on first click (1-click download).")
        else:
            # Format popover (Lossless WAV) for music tracks with dropdown
            wav_opt = find_uia_element(chrome_win, title_re=r"(?i).*(Lossless\s*WAV|Lossless|WAV).*", control_types=["MenuItem", "Button", "Custom", "Text", "ListItem"], min_x=0, timeout=2.0)
            if wav_opt:
                print(f"[OS Agent] Clicking format option at {wav_opt}...")
                human_move_and_click(wav_opt.mid_point().x, wav_opt.mid_point().y)
            else:
                # The format dropdown sits directly below the circular download button
                fallback_y = dl_y + 48
                print(f"[OS Agent] Format dropdown fallback click at ({dl_x}, {fallback_y})...")
                human_move_and_click(dl_x, fallback_y)

    # 3. Watch for downloaded file with pre_snapshot baseline
    watch_download_with_diff(job, settings.STAGING_PATH, pre_snapshot=pre_snapshot)

    # 4. Close tab safely
    time.sleep(1.0)
    close_chrome_tab_safely(chrome_win)
    print(f"[OS Agent] Job {job_id} successfully completed!")


# ------------------------------------------------------------- Agent Daemon Loop

def run_os_agent_loop():
    """Continuous polling loop for the Native OS-Level Agent."""
    print("======================================================================")
    print(" 🤖 ARTLIST NATIVE OS-LEVEL AUTOMATION AGENT (v3 UIA-DOCUMENT)")
    print("======================================================================")
    print(" • Input Mode   : Real Windows Hardware Events (isTrusted: true)")
    print(" • Locator      : Scoped Document UIAutomation - Deterministic")
    print(" • Exclusivity  : Respects Extension Heartbeat locks")
    print("======================================================================")
    print(" [WARNING] Desktop must remain UNLOCKED, UNOBSTRUCTED, and NO SCREENSAVER.")
    print(" [INFO] Listening for queued download jobs...\n")

    while True:
        try:
            if not is_working_hours():
                time.sleep(30)
                continue
            
            if is_extension_active():
                print("[OS Agent] Chrome Extension is active. Pausing OS Agent to prevent dual-worker collision...", end="\r")
                time.sleep(10)
                continue

            # Emit OS agent heartbeat only if extension is inactive
            now_iso = datetime.now().isoformat()
            with get_db(write=True) as conn:
                set_health(conn, "last_heartbeat", now_iso)
                set_health(conn, "worker_type", "os_agent")

            job = claim_next_job_for_worker()
            if job:
                try:
                    execute_os_job(job)
                except PermissionError as pe:
                    print(f"[OS Agent] Authentication Error: {pe}")
                    fail_worker_job(job["job_id"], str(pe), retryable=False)
                    time.sleep(60)
                except RuntimeError as re:
                    if "cancel" in str(re).lower():
                        print(f"[OS Agent] Job {job['job_id']} was cancelled by user.")
                    else:
                        print(f"[OS Agent] Job execution failed: {re}")
                        fail_worker_job(job["job_id"], str(re))
                except Exception as err:
                    print(f"[OS Agent] Job execution failed: {err}")
                    fail_worker_job(job["job_id"], str(err))
                finally:
                    # Clean up Chrome tab if a window handle was captured
                    if job.get("_chrome_win"):
                        close_chrome_tab_safely(job["_chrome_win"])

                # Enforce randomized human cooldown interval (disabled if 0)
                max_cd = max(0, settings.COOLDOWN_MAX_SECONDS)
                min_cd = max(0, min(settings.COOLDOWN_MIN_SECONDS, max_cd))
                if max_cd > 0:
                    cooldown_sec = random.randint(min_cd, max_cd)
                    print(f"[OS Agent] Enforcing human cooldown for {cooldown_sec}s...")
                    time.sleep(cooldown_sec)
                else:
                    print("[OS Agent] Cooldown paused (instant processing).")

            time.sleep(2.0)

        except KeyboardInterrupt:
            print("\n[OS Agent] Stopping agent daemon.")
            break
        except Exception as e:
            print(f"[OS Agent] Loop error: {e}")
            time.sleep(5.0)


if __name__ == "__main__":
    run_os_agent_loop()
