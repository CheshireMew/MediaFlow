
import sys
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.runtime.application_runtime import ApplicationRuntime
from backend.core.container import ServiceContainer, Services
from backend.contracts import pipeline_step_names


def main():
    print(">>> Verifying Auto-Execute Flow Pipeline Construction")

    service_container = ServiceContainer()
    runtime = ApplicationRuntime(service_container)
    registered_count = runtime.register_services()
    runtime.validate_runtime_contracts()

    step_registry = service_container.get(Services.PIPELINE_STEPS)
    steps = set(step_registry.list_steps())
    print(f"Registered steps: {steps}")

    required = pipeline_step_names()
    missing = required - steps
    if missing:
        raise RuntimeError(f"Missing steps: {sorted(missing)}")

    print(
        f"SUCCESS: {registered_count} services assembled and all "
        f"{len(required)} pipeline steps satisfy the runtime contract."
    )


if __name__ == "__main__":
    main()
