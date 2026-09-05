"""
Native OS-Level Automation Agent for Artlist Relay (v3)
=======================================================
UIA-First approach: Controls Google Chrome via Windows UIAutomation (pywinauto).
Bypasses Vision/OpenCV fragility with document-scoped accessibility traversal,
strict rect bounds validation, phase heartbeats, and hardware mouse input.
"""

import os
import re
import sys
import time
import random
import shutil
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict, Any, List

# Ensure Windows Per-Monitor DPI Awareness so laptop display scaling (125%/150%) does not distort click coordinates
if sys.platform == "win32":
    import ctypes
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass

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

def ensure_default_desktop():
    """Ensure current thread is attached to the interactive 'Default' desktop on Windows."""
    if sys.platform == "win32":
        import ctypes
        try:
            user32 = ctypes.windll.user32
            DESKTOP_ALL_ACCESS = 0x01FF
            hdesk = user32.OpenDesktopW("Default", 0, False, DESKTOP_ALL_ACCESS)
            if hdesk:
                user32.SetThreadDesktop(hdesk)
        except Exception as e:
            pass


def is_real_chrome_window(hwnd: int) -> bool:
    """Verifies that the HWND belongs to a real Google Chrome (chrome.exe) process and not an Electron app."""
    if not hwnd or not win32gui.IsWindow(hwnd):
        return False
    try:
        import win32process, win32api, win32con
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        hproc = win32api.OpenProcess(win32con.PROCESS_QUERY_INFORMATION | win32con.PROCESS_VM_READ, False, pid)
        exe_path = win32process.GetModuleFileNameEx(hproc, 0).lower()
        win32api.CloseHandle(hproc)
        return "chrome.exe" in exe_path and not any(k in exe_path for k in ("antigravity", "code.exe", "electron", "slack", "discord", "cursor"))
    except Exception:
        title = win32gui.GetWindowText(hwnd).lower()
        return "google chrome" in title and not any(k in title for k in ("antigravity", "visual studio", "cursor"))


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


def force_bring_to_foreground(hwnd: int) -> bool:
    """
    Guarantees bringing the Chrome window to the absolute foreground,
    even when another application (Premiere Pro, DaVinci Resolve, Explorer, etc.)
    is currently active and focused on screen.
    Bypasses Windows LockSetForegroundWindow restrictions.
    """
    if not hwnd or not win32gui.IsWindow(hwnd):
        return False

    ensure_default_desktop()

    try:
        # 1. Un-minimize if window is minimized (iconic)
        if win32gui.IsIconic(hwnd):
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            time.sleep(0.15)

        # 2. Try standard BringWindowToTop and SetForegroundWindow
        win32gui.BringWindowToTop(hwnd)
        try:
            win32gui.SetForegroundWindow(hwnd)
        except Exception:
            pass

        time.sleep(0.1)
        if win32gui.GetForegroundWindow() == hwnd:
            win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
            return True

        # 3. Windows Foreground Lockout Bypass:
        # If another application currently holds foreground focus, Windows prevents background
        # apps from stealing focus unless thread input queues are attached or an Alt-key event occurs.
        foreground_hwnd = win32gui.GetForegroundWindow()
        if foreground_hwnd and foreground_hwnd != hwnd:
            import win32process, win32api, ctypes
            cur_thread = win32api.GetCurrentThreadId()
            fg_thread, _ = win32process.GetWindowThreadProcessId(foreground_hwnd)
            target_thread, _ = win32process.GetWindowThreadProcessId(hwnd)

            # Synthesize a momentary Alt keypress (Windows allows focus change immediately after Alt)
            ctypes.windll.user32.keybd_event(0x12, 0, 0, 0) # Alt down
            ctypes.windll.user32.keybd_event(0x12, 0, 2, 0) # Alt up

            if cur_thread != fg_thread:
                try:
                    win32process.AttachThreadInput(cur_thread, fg_thread, True)
                except Exception:
                    pass
            if target_thread != fg_thread:
                try:
                    win32process.AttachThreadInput(target_thread, fg_thread, True)
                except Exception:
                    pass

            try:
                win32gui.BringWindowToTop(hwnd)
                win32gui.SetForegroundWindow(hwnd)
            except Exception:
                pass
            finally:
                if cur_thread != fg_thread:
                    try:
                        win32process.AttachThreadInput(cur_thread, fg_thread, False)
                    except Exception:
                        pass
                if target_thread != fg_thread:
                    try:
                        win32process.AttachThreadInput(target_thread, fg_thread, False)
                    except Exception:
                        pass

        win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
        time.sleep(0.2)
        return win32gui.GetForegroundWindow() == hwnd
    except Exception as e:
        print(f"[OS Agent] Window foreground activation notice: {e}")
        return False


def focus_chrome_safely(chrome_win):
    """Asserts focus safely and ensures Chrome is brought to the absolute foreground and maximized."""
    ensure_default_desktop()
    try:
        hwnd = getattr(chrome_win, "handle", None)
        if hwnd:
            force_bring_to_foreground(hwnd)
        try:
            chrome_win.set_focus()
        except Exception:
            pass
        time.sleep(0.3)
    except Exception as e:
        print(f"[OS Agent] Focus assertion notice: {e}")


def open_url_in_chrome(url: str, timeout: float = 15.0):
    """
    Reliably opens target URL in Chrome, bringing Chrome to the foreground over any open application,
    or launching Chrome if it is not currently running.
    """
    ensure_default_desktop()
    chrome_exe = find_chrome_executable()
    print(f"[OS Agent] Navigating to: {url}")

    import pyperclip
    from pywinauto.findwindows import find_windows

    # 1. Check if real Chrome is already running
    hwnds = find_windows(class_name="Chrome_WidgetWin_1", backend="uia")
    chrome_hwnds = [h for h in hwnds if is_real_chrome_window(h)]
    if not chrome_hwnds:
        hwnds_title = find_windows(title_re="(?i).*Google Chrome.*", backend="uia")
        chrome_hwnds = [h for h in hwnds_title if is_real_chrome_window(h)]

    if chrome_hwnds:
        # Chrome is already running: bring it to top, focus it, and open tab directly
        hwnd = chrome_hwnds[0]
        app = Application(backend="uia").connect(handle=hwnd)
        win = app.window(handle=hwnd)
        focus_chrome_safely(win)
        time.sleep(0.3)

        # Confirm Chrome has actual foreground focus before typing
        if win32gui.GetForegroundWindow() != hwnd:
            force_bring_to_foreground(hwnd)
            time.sleep(0.3)

        pyperclip.copy(url)
        pyautogui.hotkey('ctrl', 't')
        time.sleep(0.4)
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(0.2)
        pyautogui.press('enter')
        time.sleep(0.8)
        return win
    else:
        # Chrome is not running: launch Chrome with target URL directly
        print(f"[OS Agent] Chrome is not running. Launching Chrome with: {url}")
        try:
            subprocess.Popen([chrome_exe, "--force-renderer-accessibility", "--start-maximized", url])
        except Exception as e:
            os.system(f'start "" "{chrome_exe}" --force-renderer-accessibility --start-maximized "{url}"')

        deadline = time.time() + timeout
        while time.time() < deadline:
            ensure_default_desktop()
            try:
                hwnds = find_windows(class_name="Chrome_WidgetWin_1", backend="uia")
                chrome_hwnds = [h for h in hwnds if is_real_chrome_window(h)]
                if chrome_hwnds:
                    hwnd = chrome_hwnds[0]
                    app = Application(backend="uia").connect(handle=hwnd)
                    win = app.window(handle=hwnd)
                    focus_chrome_safely(win)
                    return win
            except Exception:
                pass
            time.sleep(0.5)

    raise RuntimeError("Could not locate Google Chrome window within timeout.")


def close_chrome_tab_safely(chrome_win):
    """
    Safely closes ONLY the active stock asset tab.
    Strictly protects the Setu Dashboard tab (127.0.0.1:5000 / 'Setu' / 'Artlist Library') from being closed.
    """
    def is_dashboard_title(t: str) -> bool:
        tl = (t or "").lower()
        return any(k in tl for k in ("stocks library", "stock library", "media library", "setu", "artlist library", "127.0.0.1", "localhost", "5000"))

    try:
        if not chrome_win:
            return
        
        # Check active window title
        win_title = chrome_win.window_text() if hasattr(chrome_win, "window_text") else ""
        if is_dashboard_title(win_title):
            print("[OS Agent] Active tab is Stocks Library Dashboard (127.0.0.1:5000). Protecting dashboard from Ctrl+W.")
            return

        try:
            doc = get_page_document(chrome_win)
            doc_name = doc.window_text() if hasattr(doc, "window_text") else ""
            if is_dashboard_title(doc_name):
                print("[OS Agent] Document is Stocks Library Dashboard. Protecting dashboard from Ctrl+W.")
                return
        except Exception:
            pass

        focus_chrome_safely(chrome_win)
        hwnd = getattr(chrome_win, "handle", None)
        if hwnd and win32gui.GetForegroundWindow() == hwnd:
            # Re-check foreground window title before sending hotkey
            fg_title = win32gui.GetWindowText(hwnd)
            if is_dashboard_title(fg_title):
                print("[OS Agent] Foreground window is Stocks Library Dashboard. Skipping Ctrl+W.")
                return

            pyautogui.hotkey('ctrl', 'w')
            time.sleep(0.3)
    except Exception as e:
        print(f"[OS Agent] Tab close notice: {e}")


def assert_auth_state(chrome_win) -> bool:
    """Checks UIA tree for blocking logged-out modals."""
    try:
        doc = get_page_document(chrome_win)
        # Check if an explicit blocking login modal or overlay is active
        login_modal = doc.child_window(title_re="(?i).*(Sign in to download|Subscribe to get this item|Log in to download).*", found_index=0)
        if login_modal.exists(timeout=0.6):
            print("[OS Agent] Auth Assertion Failed: Login prompt detected. User is not subscribed or logged out.")
            return False
        return True
    except Exception:
        return True


def parse_title_from_url(url: str) -> Optional[str]:
    """Derives a clean human-readable asset title from its URL slug."""
    if not url:
        return None
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        parts = [p for p in path.split("/") if p]
        if not parts:
            return None
        slug = parts[-1]

        # Remove trailing alphanumeric item ID e.g. -BK5FUP8, -WGFQYS7, or numeric ID
        slug = re.sub(r"-[A-Za-z0-9]{5,12}$", "", slug)
        slug = re.sub(r"/\d+$", "", slug)

        words = slug.replace("-", " ").replace("_", " ").split()
        if not words:
            return None

        acronyms = {"lut", "luts", "sfx", "vfx", "fx", "4k", "8k", "hd", "ui", "3d", "pr", "ae", "pro", "premiere", "resolve"}
        title_words = []
        for w in words:
            wl = w.lower()
            if wl in ("for", "and", "with", "the", "in", "on", "a", "an", "of"):
                title_words.append(wl)
            elif wl in acronyms:
                title_words.append(w.upper() if len(w) <= 4 else w.capitalize())
            else:
                title_words.append(w.capitalize())

        if title_words:
            title_words[0] = title_words[0].capitalize()
            return " ".join(title_words)
    except Exception:
        pass
    return None


def extract_track_title(chrome_win) -> Optional[str]:
    """Extracts track/asset title from Chrome's window title."""
    try:
        title = chrome_win.window_text()
        if not title:
            return None
        t = title.replace(" - Google Chrome", "").strip()

        # Discard generic titles when page hasn't loaded yet
        generic_patterns = [
            r"^elements\s*$",
            r"^envato elements.*$",
            r"^artlist.*$",
            r"^google chrome$",
            r"^loading.*$",
            r"^new tab$"
        ]
        for p in generic_patterns:
            if re.match(p, t, re.IGNORECASE):
                return None

        # Split on platform delimiters
        for delim in (" | Envato Elements", " - Envato Elements", " | Elements", " - Elements", " | Artlist", " - Artlist", " | ", " - "):
            if delim.lower() in t.lower():
                parts = re.split(re.escape(delim), t, flags=re.IGNORECASE)
                if parts and parts[0].strip():
                    t = parts[0].strip()
                    break

        # Remove "by Author" suffix if present (e.g. "Item Title by Author")
        t = re.sub(r"\s+by\s+[^\-\|]+$", "", t, flags=re.IGNORECASE).strip()
        # Remove trailing comma clauses (e.g. "Item Title, a Template...")
        t = re.sub(r",\s*(a|an)\s+.*$", "", t, flags=re.IGNORECASE).strip()

        if t and len(t) > 1 and not re.match(r"^(envato|artlist|elements|unknown track)$", t, re.IGNORECASE):
            return t
    except Exception:
        pass
    return None


def get_page_document(chrome_win):
    """Descends into Chrome's Document control to scope searches strictly to web content."""
    try:
        doc = chrome_win.child_window(control_type="Document", found_index=0)
        if doc.exists(timeout=2.0):
            return doc
    except Exception:
        pass
    return chrome_win


def dismiss_cookie_banners_if_present(chrome_win):
    """Dismisses common cookie/consent modals on Artlist or Envato if present."""
    try:
        btn = find_uia_element(
            chrome_win,
            title_re=r"(?i)^(Accept\s*all(\s*cookies)?|Accept\s*cookies|Got\s*it|Agree|I\s*Agree|Allow\s*all|Accept)$",
            control_types=["Button", "Custom", "Hyperlink"],
            min_x=0,
            min_y=0,
            timeout=1.5
        )
        if btn:
            print(f"[OS Agent] Dismissing cookie banner at {btn}...")
            human_move_and_click(btn.mid_point().x, btn.mid_point().y)
            time.sleep(0.5)
    except Exception:
        pass


def find_uia_element(chrome_win, title_re: str, control_types: Optional[List[str]] = None, timeout: float = 6.0, min_x: int = 50, min_y: int = 80, max_y_ratio: float = 0.88, max_width: int = 500, max_height: int = 180):
    """
    Finds a UIA element scoped to the page document, with fallback to window,
    using high-speed direct queries (strictly avoiding slow recursive tree descents).
    """
    if control_types is None:
        control_types = ["Button", "Hyperlink", "MenuItem", "Custom", "Image", "Text", "Group"]

    screen_w, screen_h = pyautogui.size()
    max_y = int(screen_h * max_y_ratio)
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        targets = [get_page_document(chrome_win)]
        if targets[0] != chrome_win:
            targets.append(chrome_win)

        for target in targets:
            # 1. Fast match by title regex alone
            try:
                el = target.child_window(title_re=title_re, found_index=0)
                if el.exists(timeout=0.15):
                    r = el.rectangle()
                    if 0 < r.width() <= max_width and 0 < r.height() <= max_height:
                        mid = r.mid_point()
                        if min_x <= mid.x < screen_w - 10 and min_y <= mid.y < max_y:
                            return r
            except Exception:
                pass

            # 2. Fast match across specific control types
            for ctype in control_types:
                try:
                    el = target.child_window(title_re=title_re, control_type=ctype, found_index=0)
                    if el.exists(timeout=0.10):
                        r = el.rectangle()
                        if 0 < r.width() <= max_width and 0 < r.height() <= max_height:
                            mid = r.mid_point()
                            if min_x <= mid.x < screen_w - 10 and min_y <= mid.y < max_y:
                                return r
                except Exception:
                    pass

        time.sleep(0.15)
    return None


def locate_track_download_target(chrome_win) -> Tuple[int, int]:
    """
    Finds the exact (X, Y) coordinates of the Download button in the track Hero section / SFX row.
    Uses Gemini Vision if configured, with UIA element fallback.
    """
    # 0. Try Gemini Multimodal Vision if API Key is configured
    if is_vision_enabled():
        pt = locate_element_with_gemini("the circular download icon button next to the yellow Play button or track title")
        if pt:
            return pt

    # 1. Direct download button search via title / aria-label
    dl_rect = find_uia_element(
        chrome_win,
        title_re=r"(?i).*(direct\s*download|download\s*track|download\s*song|download\s*sfx|download\s*wav|download\s*mp3).*",
        min_x=100,
        min_y=120,
        timeout=3.0
    )
    if dl_rect:
        return dl_rect.mid_point().x, dl_rect.mid_point().y

    # 2. Search for circular download button with exact or prefix 'Download'
    dl_rect = find_uia_element(
        chrome_win,
        title_re=r"(?i)^download$",
        control_types=["Button", "Hyperlink", "Custom", "Image"],
        min_x=100,
        min_y=120,
        timeout=2.0
    )
    if dl_rect:
        return dl_rect.mid_point().x, dl_rect.mid_point().y

    # 3. Search for Play button anchor in the main content area
    play_rect = find_uia_element(chrome_win, title_re=r"(?i)^(Play|Play\s*track|Play\s*song|Play\s*sfx|^Play.*)$", min_x=100, min_y=120, timeout=2.0)
    if play_rect:
        print(f"[OS Agent] Found 'Play' anchor button at {play_rect}")
        target_x = play_rect.right + int(play_rect.width() * 0.75)
        target_y = play_rect.mid_point().y
        return target_x, target_y

    # 4. Broader download element fallback
    dl_rect = find_uia_element(chrome_win, title_re=r"(?i).*download.*", min_x=100, min_y=120, max_y_ratio=0.85, timeout=2.0)
    if dl_rect:
        return dl_rect.mid_point().x, dl_rect.mid_point().y

    raise RuntimeError("Could not locate track Download button on page.")


def locate_envato_download_target(chrome_win) -> Tuple[int, int]:
    """
    Finds the exact (X, Y) coordinates of the Download button on Envato Elements.
    Uses fast direct UIA matching with instant geometric fallback for the right hero card.
    """
    if is_vision_enabled():
        pt = locate_element_with_gemini("the main Download or Add & Download button for this Envato item")
        if pt:
            return pt

    # 1. Search for primary Download button in Envato (fast direct match)
    dl_rect = find_uia_element(
        chrome_win,
        title_re=r"(?i)^(Download|Download\s*now|Add\s*&\s*Download|Download\s*without\s*license|Free\s*Download|Download\s*Item|\s*Download\s*)$",
        control_types=["Button", "Hyperlink", "Custom", "Text"],
        min_x=50,
        min_y=80,
        timeout=2.5
    )
    if dl_rect:
        print(f"[OS Agent] Found Envato primary download button at {dl_rect}")
        return dl_rect.mid_point().x, dl_rect.mid_point().y

    # 2. Broader download match
    dl_rect = find_uia_element(
        chrome_win,
        title_re=r"(?i).*(download|add\s*&\s*download).*",
        control_types=["Button", "Hyperlink", "Custom", "Text"],
        min_x=50,
        min_y=80,
        max_y_ratio=0.85,
        timeout=1.5
    )
    if dl_rect:
        print(f"[OS Agent] Found Envato download element via broad match at {dl_rect}")
        return dl_rect.mid_point().x, dl_rect.mid_point().y

    # 3. Deterministic Geometric Fallback on Desktop:
    # On Envato Elements item pages, the primary green action button is anchored on the right hero column.
    screen_w, screen_h = pyautogui.size()
    fallback_x = int(screen_w * 0.84)
    fallback_y = int(screen_h * 0.33)
    print(f"[OS Agent] Envato UIA search timed out; executing instantaneous action card fallback at ({fallback_x}, {fallback_y})...")
    return fallback_x, fallback_y


def locate_stems_trigger_target(chrome_win) -> Tuple[int, int]:
    """
    Finds the exact (X, Y) coordinates of the Stems/Versions trigger button.
    Uses Gemini Vision if configured, with element search and Play anchor fallback.
    """
    # 0. Try Gemini Multimodal Vision if API Key is configured
    if is_vision_enabled():
        pt = locate_element_with_gemini("the circular stems icon button with a music note in layers next to the yellow Play button")
        if pt:
            return pt

    # 1. Search for explicit Stems / Song Versions button in UIA
    stems_rect = find_uia_element(
        chrome_win,
        title_re=r"(?i)^(stems?|song\s*versions?|versions?|view\s*stems|stems\s*&\s*versions?)$",
        control_types=["Button", "Hyperlink", "MenuItem", "Custom", "Image"],
        min_x=100,
        timeout=3.0
    )
    if stems_rect:
        print(f"[OS Agent] Found exact Stems trigger button via UIA: {stems_rect}")
        return stems_rect.mid_point().x, stems_rect.mid_point().y

    # 2. Check broader Stems / Versions word match
    stems_rect = find_uia_element(
        chrome_win,
        title_re=r"(?i).*\b(stems?|song\s*versions?)\b.*",
        control_types=["Button", "Hyperlink", "MenuItem", "Custom", "Image"],
        min_x=100,
        timeout=2.5
    )
    if stems_rect:
        print(f"[OS Agent] Found Stems button via text pattern: {stems_rect}")
        return stems_rect.mid_point().x, stems_rect.mid_point().y

    # 3. Locate Play button anchor on track hero section
    play_rect = find_uia_element(chrome_win, title_re=r"(?i)^(Play|Play\s*track|Play\s*song|^Play.*)$", min_x=100, timeout=4.0)
    if play_rect:
        print(f"[OS Agent] Found 'Play' anchor button for Stems at {play_rect}")
        # The Stems button on Artlist is the 2nd icon button to the right of Play:
        # [Play] -> [Download] (+48px) -> [Stems] (+96px)
        target_x = play_rect.right + int(play_rect.width() * 1.85)
        target_y = play_rect.mid_point().y
        return target_x, target_y

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
                
                derived_title = job.get("extracted_title") or parse_title_from_url(job.get("url")) or detected_file.stem
                return complete_worker_job(
                    job_id=job_id,
                    temp_filename=str(detected_file),
                    reported_bytes=file_size,
                    track_title=derived_title
                )
                
        time.sleep(0.8)

    raise TimeoutError(f"Download did not complete within {timeout} seconds.")


# ------------------------------------------------------------- Workflow Execution

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

    # 0. Remember currently focused application so we can restore it when finished
    if sys.platform == "win32":
        try:
            fg_win = win32gui.GetForegroundWindow()
            if fg_win and win32gui.IsWindow(fg_win):
                job["_prior_hwnd"] = fg_win
        except Exception:
            pass

    # 1. Open URL directly in Chrome
    update_job_phase(job_id, "opening_tab", f"Opening {target_url}...")
    chrome_win = open_url_in_chrome(target_url)
    job["_chrome_win"] = chrome_win
    focus_chrome_safely(chrome_win)

    # 2. Page Hydration (Fast adaptive check)
    update_job_phase(job_id, "page_loading", "Waiting for page hydration...")
    print("[OS Agent] Waiting for page hydration...")
    if provider == "envato":
        time.sleep(1.8)
    else:
        time.sleep(random.uniform(3.0, 4.0))
    focus_chrome_safely(chrome_win)
    dismiss_cookie_banners_if_present(chrome_win)
    check_cancellation(job_id)

    # 3. Auth Assertion (Artlist)
    if provider == "artlist" and not assert_auth_state(chrome_win):
        with get_db(write=True) as conn:
            set_health(conn, "session_authenticated", "false")
        raise PermissionError("Artlist Session Logged Out. Cannot proceed.")

    # 4. Extract Track Title from DOM via UIA or URL slug fallback
    update_job_phase(job_id, "reading_title", "Reading asset details...")
    title = extract_track_title(chrome_win) or parse_title_from_url(target_url)
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
        
        time.sleep(0.5)
        # Check if project modal / "Add & Download" popped up
        add_dl_rect = find_uia_element(
            chrome_win,
            title_re=r"(?i).*(Add\s*&\s*Download|Download\s*without\s*license|Create\s*new\s*project|Add\s*to\s*project).*",
            min_x=0,
            timeout=2.0
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
        time.sleep(1.8)
        stems_tab_rect = find_uia_element(
            chrome_win,
            title_re=r"(?i)^(Stems|Stems\s*&\s*Versions)$",
            control_types=["TabItem", "Button", "Custom", "Text", "Hyperlink"],
            min_x=0,
            timeout=3.0
        )
        if stems_tab_rect:
            print(f"[OS Agent] Clicking Stems tab at {stems_tab_rect}...")
            human_move_and_click(stems_tab_rect.mid_point().x, stems_tab_rect.mid_point().y)
            time.sleep(1.0)

        # 3. "Download All Stems" in modal
        print("[OS Agent] Locating 'Download All Stems' via UIA...")
        dl_all_rect = find_uia_element(
            chrome_win,
            title_re=r"(?i).*(Download\s*All\s*Stems|Download\s*All|Download\s*Stems|Download\s*Zip|All\s*Stems).*",
            control_types=["Button", "Hyperlink", "MenuItem", "Custom", "Text"],
            min_x=0,
            timeout=4.0
        )
        
        screen_w, screen_h = pyautogui.size()
        if dl_all_rect:
            dl_x, dl_y = dl_all_rect.mid_point().x, dl_all_rect.mid_point().y
            print(f"[OS Agent] Found 'Download All Stems' button at {dl_all_rect} -> ({dl_x}, {dl_y})")
        else:
            # Check modal header area (in Artlist modal, Download All Stems is at the top right of modal)
            dl_all_rect = find_uia_element(
                chrome_win,
                title_re=r"(?i).*download.*",
                min_x=int(screen_w * 0.45),
                min_y=int(screen_h * 0.15),
                max_y_ratio=0.55,
                timeout=3.0
            )
            if dl_all_rect:
                dl_x, dl_y = dl_all_rect.mid_point().x, dl_all_rect.mid_point().y
                print(f"[OS Agent] Found modal download control at {dl_all_rect}")
            else:
                # Modal top-right button location: X: ~68%, Y: ~32%
                dl_x = int(screen_w * 0.68)
                dl_y = int(screen_h * 0.32)
                print(f"[OS Agent] 'Download All Stems' UIA unresolved, executing modal top-right click at ({dl_x}, {dl_y})...")

        update_job_phase(job_id, "selecting_variant", "Triggering Stems download...")
        print(f"[OS Agent] Clicking Download All Stems at ({dl_x}, {dl_y})...")
        human_move_and_click(dl_x, dl_y)
        
        # 4. Check if download already started (1-click stems) or if format popover opened
        time.sleep(1.0)
        current_staging = snapshot_directory(settings.STAGING_PATH)
        new_in_staging = set(current_staging.keys()) - set(pre_snapshot.keys())
        if any(f.lower().endswith((".crdownload", ".tmp", ".zip")) for f in new_in_staging):
            print("[OS Agent] Stems download initiated directly on first click.")
        else:
            # Check if format dropdown appeared (e.g. 'WAV', 'Download WAV')
            wav_rect = find_uia_element(
                chrome_win,
                title_re=r"(?i)^(\s*wav\s*|download\s*wav|lossless\s*wav|\.zip)$",
                control_types=["Button", "MenuItem", "Custom", "Text"],
                min_x=0,
                timeout=2.0
            )
            if wav_rect:
                print(f"[OS Agent] Clicking 'WAV' stems dropdown at {wav_rect}...")
                human_move_and_click(wav_rect.mid_point().x, wav_rect.mid_point().y)
            else:
                # If dropdown is directly below
                target_wav_x = dl_x
                target_wav_y = dl_y + 38
                print(f"[OS Agent] Clicking dropdown menu below button at ({target_wav_x}, {target_wav_y})...")
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
            # Format popover / button expansion (e.g. "download wav", "WAV", "Lossless WAV")
            # Strictly use word boundary and only match buttons / menu items, excluding breadcrumbs/titles with 'waves'
            wav_opt = find_uia_element(
                chrome_win,
                title_re=r"(?i)^(\s*download\s*wav\s*|\s*wav\s*|lossless\s*wav)$",
                control_types=["Button", "MenuItem", "Custom"],
                min_x=100,
                min_y=120,
                timeout=2.5
            )
            if not wav_opt:
                # Fallback to bounded word match
                wav_opt = find_uia_element(
                    chrome_win,
                    title_re=r"(?i).*\b(download\s*wav|lossless\s*wav)\b.*",
                    control_types=["Button", "MenuItem", "Custom"],
                    min_x=100,
                    min_y=120,
                    timeout=1.5
                )

            if wav_opt:
                print(f"[OS Agent] Clicking format option at {wav_opt}...")
                human_move_and_click(wav_opt.mid_point().x, wav_opt.mid_point().y)
            else:
                # Geometric fallback: on Artlist, the expanded WAV button sits directly to the right (+140px) or below (+48px)
                wav_x = dl_x + 140
                wav_y = dl_y
                print(f"[OS Agent] Format button UIA unresolved, executing fallback click at ({wav_x}, {wav_y})...")
                human_move_and_click(wav_x, wav_y)

    # 3. Watch for downloaded file with pre_snapshot baseline
    watch_download_with_diff(job, settings.STAGING_PATH, pre_snapshot=pre_snapshot)

    # 4. Close tab safely
    time.sleep(1.0)
    close_chrome_tab_safely(chrome_win)
    print(f"[OS Agent] Job {job_id} successfully completed!")


# ------------------------------------------------------------- Agent Daemon Loop

def enable_stay_awake() -> bool:
    """Informs Windows OS to prevent screen sleep, display timeout, and system idle lock."""
    if sys.platform == "win32":
        try:
            # ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x01) | ES_DISPLAY_REQUIRED (0x02) | ES_AWAYMODE_REQUIRED (0x40)
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001 | 0x00000002 | 0x00000040)
            return True
        except Exception:
            pass
    return False


def pulse_idle_keepalive():
    """Resets the Windows idle timer to keep corporate/domain laptops from auto-locking."""
    if sys.platform == "win32":
        try:
            # Re-assert execution state
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001 | 0x00000002 | 0x00000040)
            # Send harmless zero-delta mouse event (resets OS idle timer without moving cursor)
            ctypes.windll.user32.mouse_event(0x0001, 0, 0, 0, 0)
        except Exception:
            pass


def run_os_agent_loop():
    """Continuous polling loop for the Native OS-Level Agent."""
    ensure_default_desktop()
    enable_stay_awake()
    print("======================================================================")
    print(" 🤖 ARTLIST NATIVE OS-LEVEL AUTOMATION AGENT (v3 UIA-DOCUMENT)")
    print("======================================================================")
    print(" • Input Mode   : Real Windows Hardware Events (isTrusted: true)")
    print(" • Locator      : Scoped Document UIAutomation - Deterministic")
    print(" • Keep-Awake   : Windows Stay-Awake & Anti-Lock Active")
    print(" • Exclusivity  : Respects Extension Heartbeat locks")
    print("======================================================================")
    print(" [INFO] Listening for queued download jobs...\n")

    last_keepalive = time.time()

    while True:
        try:
            # Pulse Windows idle keepalive every 45 seconds
            if time.time() - last_keepalive > 45.0:
                pulse_idle_keepalive()
                last_keepalive = time.time()

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
                set_health(conn, "session_authenticated", "true")

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
                    # Smoothly restore focus to the previously active application (Premiere Pro, DaVinci, etc.)
                    if job.get("_prior_hwnd") and sys.platform == "win32":
                        try:
                            prior_h = job["_prior_hwnd"]
                            ch_h = getattr(job.get("_chrome_win"), "handle", None)
                            if win32gui.IsWindow(prior_h) and prior_h != ch_h:
                                print(f"[OS Agent] Returning focus to previous application (HWND: {prior_h})...")
                                force_bring_to_foreground(prior_h)
                        except Exception as e:
                            print(f"[OS Agent] Could not restore previous focus: {e}")

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
