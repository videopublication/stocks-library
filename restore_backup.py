"""
Stocks Library • Disaster Recovery Database Restoration Tool
Use this script to restore a database backup in case of hardware failure or computer migration.
"""

import sys
import os
import sqlite3
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "artlist_relay.db"
BACKUPS_DIR = BASE_DIR / "backups"


def list_available_backups():
    if not BACKUPS_DIR.exists():
        return []
    files = list(BACKUPS_DIR.glob("*.db"))
    files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return files


def restore_backup(source_file: Path):
    if not source_file.exists():
        print(f"[ERROR] Source backup file not found: {source_file}")
        sys.exit(1)

    print(f"\n======================================================================")
    print(f" STOCKS LIBRARY • DISASTER RECOVERY RESTORATION")
    print(f"======================================================================")
    print(f" • Source Backup : {source_file.resolve()}")
    print(f" • Target Database: {DB_PATH.resolve()}")
    print(f"======================================================================")

    # 1. Test backup integrity
    print("\n[1/3] Verifying source backup file integrity...")
    test_conn = sqlite3.connect(str(source_file))
    try:
        check = test_conn.execute("PRAGMA integrity_check;").fetchone()
        if not check or check[0] != "ok":
            print(f"[ERROR] Corrupt backup file: {check[0] if check else 'Unknown error'}")
            sys.exit(1)
        print(" -> Integrity Check: PASSED (100% Valid SQLite Database)")
    finally:
        test_conn.close()

    # 2. Safety copy of current database if exists
    if DB_PATH.exists() and DB_PATH.stat().st_size > 0:
        print("[2/3] Creating safety snapshot of existing database before restoring...")
        safety_name = f"pre_restore_safety_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        safety_path = BACKUPS_DIR / safety_name
        BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
        try:
            curr_conn = sqlite3.connect(str(DB_PATH))
            safe_conn = sqlite3.connect(str(safety_path))
            curr_conn.backup(safe_conn)
            safe_conn.close()
            curr_conn.close()
            print(f" -> Saved safety snapshot: {safety_path.name}")
        except Exception as e:
            print(f" -> Warning: Could not create safety snapshot: {e}")
    else:
        print("[2/3] No existing database found. Fresh restore target initialized.")

    # 3. Restore backup into target DB
    print("[3/3] Restoring database records, accounts, and library index...")
    src_conn = sqlite3.connect(str(source_file))
    target_conn = sqlite3.connect(str(DB_PATH))
    try:
        src_conn.backup(target_conn)
        print(" -> Database restore completed successfully!")
    finally:
        target_conn.close()
        src_conn.close()

    print("\n======================================================================")
    print(" [SUCCESS] Your Stocks Library system is fully restored!")
    print(" You can now run 'start_relay.bat' to launch the relay server.")
    print("======================================================================\n")


def main():
    if len(sys.argv) > 1:
        chosen_file = Path(sys.argv[1])
        restore_backup(chosen_file)
        return

    # Interactive selector
    backups = list_available_backups()
    if not backups:
        print(f"\n[INFO] No backup files found in {BACKUPS_DIR.resolve()}")
        print("Usage: python restore_backup.py <path_to_backup_file.db>\n")
        return

    print("\nAvailable database backups:")
    for i, b in enumerate(backups, 1):
        mtime = datetime.fromtimestamp(b.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        size_kb = b.stat().st_size / 1024.0
        print(f" [{i}] {b.name} ({size_kb:.1f} KB, Modified: {mtime})")

    try:
        choice = input(f"\nSelect a backup to restore [1-{len(backups)}] or press Enter for latest (1): ").strip()
        idx = int(choice) - 1 if choice else 0
        if 0 <= idx < len(backups):
            restore_backup(backups[idx])
        else:
            print("[ERROR] Invalid choice.")
    except (ValueError, KeyboardInterrupt):
        print("\nRestoration cancelled.")


if __name__ == "__main__":
    main()
