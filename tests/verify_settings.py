
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).parent.parent))

from backend.services.settings_manager import SettingsManager
from backend.services.translator.llm_translator import LLMTranslator

def test_settings_flow():
    settings_manager = SettingsManager()
    llm_translator = LLMTranslator()
    print("1. initializing SettingsManager...")
    # This should auto-migrate from .env if JSON is missing
    settings = settings_manager.get_settings()
    print(f"   Providers: {len(settings.llm_providers)}")
    
    active_provider = settings_manager.get_active_llm_provider()
    if active_provider:
        print(f"   Active Provider: {active_provider.name} ({active_provider.model})")
    else:
        print("   No active provider found.")

    print("\n2. Testing LLMTranslator Client Resolution...")
    # This calls _get_client() internally
    try:
        client, model = llm_translator._get_client()
        if client:
            print(f"   ✅ Client initialized for model: {model}")
            print(f"   ✅ Base URL: {client.base_url}")
        else:
            print("   ❌ Client creation failed.")
    except Exception as e:
        print(f"   ❌ Error: {e}")

if __name__ == "__main__":
    test_settings_flow()
