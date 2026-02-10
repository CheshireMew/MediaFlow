import requests
import json

def inspect_translate_tasks():
    try:
        response = requests.get("http://127.0.0.1:8000/api/v1/tasks")
        tasks = response.json()
        
        print(f"Found {len(tasks)} tasks.")
        
        translate_tasks = [t for t in tasks if t['type'] == 'translate']
        print(f"Found {len(translate_tasks)} Translate tasks.")
        
        for t in translate_tasks:
            print("\n" + "="*50)
            print(f"Task ID: {t['id']}")
            print(f"Name: {t.get('name')}")
            print(f"Status: {t['status']}")
            print("-" * 20)
            print("Request Params:")
            print(json.dumps(t.get('request_params', {}), indent=2))
            print("-" * 20)
            print("Result:")
            print(json.dumps(t.get('result', {}), indent=2))
            print("="*50 + "\n")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_translate_tasks()
