import sys
import asyncio
import uvicorn
from src.config import settings

def main():
    # Critical: Force ProactorEventLoop on Windows BEFORE uvicorn starts
    if sys.platform == "win32":
        print(" [System] Enforcing WindowsProactorEventLoopPolicy for Playwright compatibility...")
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    try:
        # Run Uvicorn via API, not CLI, to ensure our policy sticks
        uvicorn.run(
            "src.main:app", 
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
