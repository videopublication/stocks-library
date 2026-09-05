import sys
import time
import ctypes

ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_DISPLAY_REQUIRED = 0x00000002
ES_AWAYMODE_REQUIRED = 0x00000040

def main():
    print("======================================================================")
    print(" STOCKS LIBRARY • LAPTOP STAY-AWAKE & ANTI-LOCK HELPER")
    print("======================================================================")
    print(" [ACTIVE] Laptop Stay-Awake Keepalive is running...")
    print(" Prevents screen sleep, display timeout, and Windows auto-lock.")
    print(" Keep this window open while using the laptop as a server.")
    print(" Press Ctrl+C in this window if you want to stop.")
    print("======================================================================\n")

    tick = 0
    while True:
        try:
            if sys.platform == "win32":
                # Inform Windows OS to prevent screen sleep and system idle sleep
                ctypes.windll.kernel32.SetThreadExecutionState(
                    ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED | ES_AWAYMODE_REQUIRED
                )
                # Send harmless zero-displacement mouse event (resets Windows idle timer)
                ctypes.windll.user32.mouse_event(0x0001, 0, 0, 0, 0)
            
            tick += 1
            mins = (tick * 30) // 60
            print(f"[KeepAwake] System kept active: {mins} min(s)...", end="\r")
            time.sleep(30)
        except KeyboardInterrupt:
            print("\n\n[STOPPED] Laptop stay-awake helper stopped.")
            break
        except Exception:
            time.sleep(5)

if __name__ == "__main__":
    main()
