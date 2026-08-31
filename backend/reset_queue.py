import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import get_db

def reset():
    with get_db(write=True) as conn:
        conn.execute("UPDATE health SET v = 'false' WHERE k = 'queue_paused'")
        conn.execute("UPDATE health SET v = '0' WHERE k = 'consecutive_failures'")
        conn.execute("UPDATE health SET v = 'true' WHERE k = 'session_authenticated'")
        # Mark permanently failed/errored jobs as failed so they do not block FIFO
        conn.execute("UPDATE jobs SET status = 'failed' WHERE status = 'queued' AND phase = 'failed'")
        conn.execute("UPDATE jobs SET status = 'failed' WHERE attempts >= 2")
        # Re-queue any stuck in-flight jobs back to queued
        conn.execute("UPDATE jobs SET status = 'queued', phase = 'queued', claimed_at = NULL WHERE status IN ('claimed', 'downloading', 'moving') AND attempts < 2")
    print("[INFO] Queue unjammed and unpaused.")

if __name__ == "__main__":
    reset()
