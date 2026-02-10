import requests
import json

try:
    response = requests.get('http://127.0.0.1:8000/api/v1/tasks')
    tasks = response.json()
    print(f"Total tasks: {len(tasks)}")
    for t in tasks:
        # Print key info to debug type detection
        print(f"\nID: {t.get('id')} | Type: {t.get('type')} | Name: {t.get('name')} | Status: {t.get('status')}")
        if t.get('type') == 'pipeline':
             steps = t.get('request_params', {}).get('steps', [])
             print(f"  -> Pipeline Steps: {steps}")
             
        # Check params for translate task
        if t.get('type') == 'translate':
            params = t.get('request_params', {})
            print(f"  -> Params Keys: {list(params.keys())}")
            
except Exception as e:
    print(f"Error: {e}")
