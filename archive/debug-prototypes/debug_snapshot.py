
import asyncio
import json
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parents[2]))


async def recreate_bug():
    print("Loading tasks...")
    # task_manager auto loads on init
    
    print(f"Loaded {len(task_manager.tasks)} tasks.")
    
    tasks_list = [task.dict() for task in task_manager.tasks.values()]
    data = {
        "type": "snapshot",
        "tasks": tasks_list
    }

    try:
        # Simulate what websocket.send_json does (internally dumping to json)
        json.dumps(data, ensure_ascii=False)
        print(f"✅ Full snapshot serialization OK")
    except Exception as e:
        print(f"❌ Full snapshot serialization FAILED: {e}")
        
        # Binary search for the culprit
        for task in task_manager.tasks.values():
             try:
                json.dumps(task.dict(), ensure_ascii=False)
             except Exception as task_e:
                 print(f"   -> Failed Task ID: {task.id} Type: {task.type} Error: {task_e}")

if __name__ == "__main__":
    asyncio.run(recreate_bug())
