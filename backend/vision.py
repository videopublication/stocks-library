"""
Gemini Vision UI Grounding Engine for Artlist Relay OS Agent
============================================================
Uses Google Gemini multimodal models to visually locate icons, buttons,
and dropdown menus on the screen with human-level accuracy.
"""

import os
import io
import json
import base64
import urllib.request
import urllib.error
from typing import Optional, Tuple, Dict, Any
from pathlib import Path

import pyautogui
from PIL import Image

# Read API Key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))


def is_vision_enabled() -> bool:
    """Check if Gemini Vision is configured and available."""
    return bool(GEMINI_API_KEY and GEMINI_API_KEY.strip())


def capture_screen_base64() -> Tuple[str, int, int]:
    """Captures the primary monitor and returns JPEG base64 + screen dimensions."""
    screenshot = pyautogui.screenshot()
    w, h = screenshot.size

    # Resize slightly if 4K to stay fast and within Gemini optimal token budget
    if w > 1920:
        scale = 1920 / w
        new_w = 1920
        new_h = int(h * scale)
        screenshot = screenshot.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    buffer = io.BytesIO()
    screenshot.save(buffer, format="JPEG", quality=85)
    b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return b64_str, w, h


def locate_element_with_gemini(target_description: str, timeout: float = 10.0) -> Optional[Tuple[int, int]]:
    """
    Sends a desktop screenshot to Gemini Vision and returns physical screen (X, Y) pixel coordinates.
    """
    if not is_vision_enabled():
        return None

    try:
        b64_image, screen_w, screen_h = capture_screen_base64()
        
        prompt = f"""
You are an expert UI automation assistant.
Analyze this computer screen capture and locate the exact center coordinates of the requested UI element.

Target Element to locate: "{target_description}"

Return ONLY a raw JSON object with no markdown formatting and no backticks:
{{
  "found": true,
  "point": [y, x],
  "box_2d": [ymin, xmin, ymax, xmax],
  "label": "name of element detected"
}}
Coordinates must be normalized integers from 0 to 1000 (where 0,0 is top-left and 1000,1000 is bottom-right).
If the element is not found, return: {{"found": false}}
"""

        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": b64_image
                        }
                    }
                ]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "response_mime_type": "application/json"
            }
        }

        # Try gemini-2.5-flash, fallback to gemini-1.5-flash
        models = ["gemini-2.5-flash", "gemini-1.5-flash"]
        for model in models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            try:
                with urllib.request.urlopen(req, timeout=timeout) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                    text_content = res_data["candidates"][0]["content"]["parts"][0]["text"]
                    parsed = json.loads(text_content)
                    
                    if parsed.get("found"):
                        # Extract coordinates
                        if "point" in parsed and len(parsed["point"]) == 2:
                            norm_y, norm_x = parsed["point"]
                        elif "box_2d" in parsed and len(parsed["box_2d"]) == 4:
                            ymin, xmin, ymax, xmax = parsed["box_2d"]
                            norm_y = (ymin + ymax) / 2
                            norm_x = (xmin + xmax) / 2
                        else:
                            continue

                        pixel_x = int(norm_x * screen_w / 1000)
                        pixel_y = int(norm_y * screen_h / 1000)
                        print(f"[Gemini Vision] Successfully located '{target_description}' at ({pixel_x}, {pixel_y}) [Label: {parsed.get('label', '')}]")
                        return pixel_x, pixel_y

            except urllib.error.HTTPError as he:
                print(f"[Gemini Vision] Model {model} HTTP Error {he.code}: {he.reason}")
                continue
            except Exception as e:
                print(f"[Gemini Vision] Error querying {model}: {e}")
                continue

    except Exception as err:
        print(f"[Gemini Vision] Failure during UI grounding: {err}")

    return None
