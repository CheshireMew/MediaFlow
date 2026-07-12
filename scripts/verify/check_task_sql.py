
import argparse
import sqlite3
import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parents[2]
sys.path.append(str(repo_root))

from backend.config import settings

DB_PATH = settings.USER_DATA_DIR / "mediaflow.db"


def check_task(task_id: str) -> None:
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT id, status, progress, message_code, message_params, error "
            "FROM task WHERE id = ?",
            (task_id,),
        )
        row = cursor.fetchone()

        if row:
            print(f"Task ID: {row[0]}")
            print(f"Status: {row[1]}")
            print(f"Progress: {row[2]}")
            print(f"Message code: {row[3]}")
            print(f"Message params: {row[4]}")
            print(f"Error: {row[5]}")
        else:
            print(f"Task {task_id} not found.")
    except Exception as e:
        print(f"Error querying task: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect one task with raw SQLite.")
    parser.add_argument("task_id")
    args = parser.parse_args()
    check_task(args.task_id)
