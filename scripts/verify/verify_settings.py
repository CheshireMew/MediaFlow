
import argparse
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.application.settings_service import SettingsApplicationService
from backend.core.app_runtime import ApplicationRuntime
from backend.core.container import ServiceContainer, Services


def test_settings_flow(*, connect: bool) -> None:
    service_container = ServiceContainer()
    runtime = ApplicationRuntime(service_container)
    runtime.register_services()
    settings_manager = service_container.get(Services.SETTINGS_MANAGER)
    llm_translator = service_container.get(Services.LLM_TRANSLATOR)

    print("1. initializing SettingsManager...")
    settings = settings_manager.get_settings()
    print(f"   Providers: {len(settings.llm_providers)}")

    active_provider = settings_manager.get_active_llm_provider()
    if active_provider:
        print(f"   Active Provider: {active_provider.name} ({active_provider.model})")
    else:
        print("   No active provider found.")

    print(f"\n2. LLMTranslator resolved from assembly: {type(llm_translator).__name__}")
    if connect:
        if active_provider is None:
            raise RuntimeError("Cannot test a connection without an active provider")
        result = SettingsApplicationService(settings_manager).test_provider_connection(
            base_url=active_provider.base_url,
            api_key=active_provider.api_key,
            model=active_provider.model,
            name=active_provider.name,
        )
        print(f"   Provider connection: {result['status']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Verify settings and translator assembly without exposing credentials."
    )
    parser.add_argument(
        "--connect",
        action="store_true",
        help="Send a minimal request to the active provider.",
    )
    args = parser.parse_args()
    test_settings_flow(connect=args.connect)
