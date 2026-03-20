
import asyncio
import sys
import os
import time
from pathlib import Path

# Add src to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.container import container, Services
from backend.services.task_manager import TaskManager
from backend.core.database import init_db, get_session_context
from backend.api.v1.translate import run_translation_task, TranslateRequest
from backend.models.schemas import SubtitleSegment
from backend.services.settings_manager import SettingsManager
from unittest.mock import MagicMock

async def register_services():
    await init_db()
    # Manual registration since we are not running full app
    container.register(Services.SETTINGS_MANAGER, lambda: SettingsManager())
    # TaskManager needs DB, assuming it handles it
    container.register(Services.TASK_MANAGER, lambda: TaskManager())
    
    from backend.services.translator.llm_translator import LLMTranslator
    from backend.services.translator.glossary_service import GlossaryService

    container.register(Services.LLM_TRANSLATOR, lambda: LLMTranslator())
    container.register(Services.GLOSSARY, lambda: GlossaryService())
    
    # container.register(Services.WEBSOCKET, lambda: mock_ws) # Services.WEBSOCKET does not exist


async def main():
    print("Initializing Services...")
    await register_services()
    
    task_manager: TaskManager = container.get(Services.TASK_MANAGER)
    # Patch broadcast to avoid connection manager issues
    task_manager.broadcast = MagicMock(side_effect=lambda m: asyncio.sleep(0))
    
    # Mock Request
    segments = [
        SubtitleSegment(id="1", start=0.0, end=5.0, text="Hello world"),
        SubtitleSegment(id="2", start=5.0, end=10.0, text="This is a test subtitle"),
        SubtitleSegment(id="3", start=10.0, end=15.0, text="Testing long translation task"),
    ] * 5  # 15 segments
    
    req = TranslateRequest(
        segments=segments,
        target_language="Chinese",
        mode="standard",
        context_path="test_video.mp4"
    )
    
    print(f"Creating Task with {len(req.segments)} segments...")
    task_id = await task_manager.create_task(
        task_type="translate",
        initial_message="Queued",
        task_name="Test Translation",
        request_params=req.dict()
    )
    
    print(f"Task ID: {task_id}")
    
    # Run task directly (bypassing BackgroundTasks wrapper for testing)
    # We need to simulate how FastAPI runs it.
    # run_translation_task is async
    print("Running translation task...")
    
    # We mock the LLM Translator to avoid actual API calls and precise timing
    from unittest.mock import patch
    
    # Mock list of segments to return
    mock_segments = [
        SubtitleSegment(id=s.id, start=s.start, end=s.end, text=f"[CN] {s.text}")
        for s in segments
    ]
    
    with patch("backend.services.translator.llm_translator.LLMTranslator.translate_segments") as mock_translate:
        # Simulate delay
        async def mock_translate_fn(*args, **kwargs):
            print("  (Mock LLM) Translating...")
            await asyncio.sleep(2) # Simulate processing time
            # Call progress callback if exists
            if "progress_callback" in kwargs and kwargs["progress_callback"]:
                kwargs["progress_callback"](50, "Halfway there...")
            await asyncio.sleep(2)
            return mock_segments
            
        # Wait, translate_segments in real code is synchronous (blocking)
        # BackgroundTaskRunner runs it in executor.
        # So our mock should be synchronous and block.
        def mock_translate_sync(*args, **kwargs):
            print("  (Mock LLM) Translating blocking...")
            time.sleep(0.1)
            if "progress_callback" in kwargs and kwargs["progress_callback"]:
                 # We can't await in sync function, but callback is threadsafe async?
                 # progress_callback is a wrapper that uses run_coroutine_threadsafe.
                 kwargs["progress_callback"](50, "Halfway there...")
            time.sleep(0.1)
            return mock_segments
            
        mock_translate.side_effect = mock_translate_sync
        
        await run_translation_task(task_id, req)
        
    print("Task Execution Function Returned.")
    
    # Now verification
    print("Verifying DB State...")
    async with get_session_context() as session:
        from backend.models.task_model import Task
        task = await session.get(Task, task_id)
        
        if not task:
            print("ERROR: Task not found in DB!")
            return
            
        print(f"Task Status: {task.status}")
        print(f"Task Progress: {task.progress}")
        print(f"Task Result Type: {type(task.result)}")
        
        if task.status != "completed":
            print(f"ERROR: Task status is {task.status}, expected 'completed'")
            
        if not task.result:
            print("ERROR: Task result is empty!")
        else:
            # Check segments
            # task.result is a Dict (SQLModel/JSON)
            result = task.result
            if "meta" not in result:
                print("ERROR: 'meta' key missing in result")
            else:
                meta = result["meta"]
                if "segments" not in meta:
                    print("ERROR: 'segments' key missing in result.meta")
                else:
                    segments_out = meta["segments"]
                    print(f"Segments Count in DB: {len(segments_out)}")
                    if len(segments_out) == 0:
                        print("ERROR: Segments list is empty!")
                    else:
                        print("SUCCESS: Segments found in DB.")
                        print(f"Sample: {segments_out[0]}")

if __name__ == "__main__":
    asyncio.run(main())
