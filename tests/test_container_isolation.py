"""Quick test: ServiceContainer instance isolation after refactor."""
import pytest
from backend.core.container import ServiceContainer, ServiceKey, container


TEST_SERVICE = ServiceKey("test_service")


def test_instance_isolation():
    """Two containers should NOT share state."""
    c2 = ServiceContainer()
    c2.register(TEST_SERVICE, lambda: "hello")

    assert c2.has(TEST_SERVICE), "c2 should have the local test service"
    assert not container.has(TEST_SERVICE), "global container should NOT have the local test service"
    print("Instance isolation OK")


def test_duplicate_registration_raises():
    c2 = ServiceContainer()
    c2.register(TEST_SERVICE, lambda: "hello")

    with pytest.raises(RuntimeError, match="already registered"):
        c2.register(TEST_SERVICE, lambda: "world")
