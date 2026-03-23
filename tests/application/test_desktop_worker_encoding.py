import sys
import subprocess
import json
from pathlib import Path

def test_desktop_worker_decodes_utf8_stdin():
    worker_script = Path(__file__).parent.parent.parent / "backend" / "desktop_worker.py"
    
    # Payload with Chinese characters
    payload = {
        "id": "test-request-123",
        "command": "ping",
        "payload": {
            "test_filename": "巴菲特与盖茨：关于成功的终极对话，1998年华盛顿大学"
        }
    }
    
    # We send the payload to the worker encoded as strict utf-8 bytes
    json_bytes = (json.dumps(payload) + "\n").encode("utf-8")
    
    # Start the worker process
    import os
    env = os.environ.copy()
    env["PYTHONPATH"] = str(worker_script.parent.parent)
    process = subprocess.Popen(
        [sys.executable, "-m", "backend.desktop_worker"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        cwd=str(worker_script.parent.parent)
    )
    
    # Communicate the bytes
    process.stdin.write(json_bytes)
    process.stdin.flush()
    
    # Read lines until we find the responses we expect
    import time
    start_time = time.time()
    
    seen_ready = False
    seen_pong = False
    
    while True:
        if time.time() - start_time > 30:
            raise TimeoutError("Timed out waiting for expected responses")
            
        line = process.stdout.readline().decode("utf-8", errors="replace").strip()
        if not line:
            # Maybe EOF
            if process.poll() is not None:
                break
            time.sleep(0.1)
            continue
            
        print("Worker:", line)
        # Try to parse as JSON
        try:
            data = json.loads(line)
            if data.get("type") == "ready":
                seen_ready = True
            elif data.get("type") == "response" and data.get("result", {}).get("status") == "pong":
                seen_pong = True
        except ValueError:
            pass # It's a log line
            
        if seen_ready and seen_pong:
            break
            
    assert seen_ready, "Never received ready event"
    assert seen_pong, "Never received pong event"
    
    process.terminate()

if __name__ == "__main__":
    test_desktop_worker_decodes_utf8_stdin()
    print("Test passed: DesktopWorker can handle UTF-8 stdin without crashing or ValidationErrors")
