import requests
import json
import time

url = "http://127.0.0.1:8000/api/v1/pipeline/run"
payload = {
  "task_name": "Test Download Task",
  "steps": [
    {
      "step_name": "download",
      "params": {
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      }
    }
  ]
}

try:
    print("Sending request...")
    response = requests.post(url, json=payload)
    data = response.json()
    print(f"Response: {data}")
    
    task_id = data.get("task_id")
    if task_id:
        print(f"Task ID: {task_id}")
        # Give it a moment to persist if async
        time.sleep(1)
        
        # Fetch task details
        task_resp = requests.get(f"http://127.0.0.1:8000/api/v1/tasks/{task_id}")
        task = task_resp.json()
        print(f"Created Task Type: {task.get('type')}")
        print(f"Created Task Name: {task.get('name')}")
        
    else:
        print("Failed to create task")

except Exception as e:
    print(f"Error: {e}")
