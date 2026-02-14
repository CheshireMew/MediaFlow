"""Quick test: ServiceContainer instance isolation after refactor."""
from src.core.container import ServiceContainer, container


def test_instance_isolation():
    """Two containers should NOT share state."""
    c2 = ServiceContainer()
    c2.register("test", lambda: "hello")
    
    assert c2.has("test"), "c2 should have 'test'"
    assert not container.has("test"), "global container should NOT have 'test'"
    print("Instance isolation OK")
