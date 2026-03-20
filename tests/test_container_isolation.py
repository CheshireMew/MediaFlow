"""Quick test: ServiceContainer instance isolation after refactor."""
import pytest
from backend.core.container import ServiceContainer, container


def test_instance_isolation():
    """Two containers should NOT share state."""
    c2 = ServiceContainer()
    c2.register("test", lambda: "hello")
    
    assert c2.has("test"), "c2 should have 'test'"
    assert not container.has("test"), "global container should NOT have 'test'"
    print("Instance isolation OK")


def test_duplicate_registration_raises():
    c2 = ServiceContainer()
    c2.register("test", lambda: "hello")

    with pytest.raises(RuntimeError, match="already registered"):
        c2.register("test", lambda: "world")
