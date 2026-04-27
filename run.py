import asyncio
import os
from pathlib import Path
import sys


def _ensure_project_venv():
    if getattr(sys, "frozen", False):
        return

    if sys.prefix != sys.base_prefix:
        return

    project_root = Path(__file__).resolve().parent
    if sys.platform == "win32":
        venv_python = project_root / ".venv" / "Scripts" / "python.exe"
    else:
        venv_python = project_root / ".venv" / "bin" / "python"

    if not venv_python.exists():
        return

    if Path(sys.executable).resolve() == venv_python.resolve():
        return

    os.execv(str(venv_python), [str(venv_python), str(Path(__file__).resolve()), *sys.argv[1:]])


def main():
    _ensure_project_venv()

    if "--desktop-worker" in sys.argv:
        from backend.desktop_worker import main as worker_main

        worker_main()
        return

    try:
        import uvicorn
    except ModuleNotFoundError as exc:
        if exc.name != "uvicorn":
            raise

        print("Missing backend dependencies.")
        print("Run setup.bat first, or run: npm run setup")
        raise SystemExit(1) from exc

    from backend.config import settings

    # Critical: Force ProactorEventLoop on Windows BEFORE uvicorn starts
    if sys.platform == "win32":
        print(" [System] Enforcing WindowsProactorEventLoopPolicy for Playwright compatibility...")
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    try:
        # Run Uvicorn via API, not CLI, to ensure our policy sticks
        uvicorn.run(
            "backend.main:app", 
            host=settings.HOST, 
            port=settings.PORT, 
            reload=False # Disable reload to ensure Policy sticks in the main process
        )
    except (KeyboardInterrupt, SystemExit):
        pass
    except Exception as e:
        # Only print if it's not a cancellation
        if "CancelledError" not in str(type(e)):
            print(f"Server error: {e}")

if __name__ == "__main__":
    main()
