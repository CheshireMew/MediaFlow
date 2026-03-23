from dataclasses import dataclass
from typing import Any, Callable, Iterable

from backend.core.container import ServiceContainer, ServiceKey


Factory = Callable[[ServiceContainer], Any]
EnabledPredicate = Callable[[], bool]


@dataclass(frozen=True)
class ServiceProvider:
    name: ServiceKey | str
    factory: Factory
    enabled: EnabledPredicate | None = None

    def is_enabled(self) -> bool:
        return self.enabled() if self.enabled is not None else True


class ServiceAssembly:
    def __init__(self, providers: Iterable[ServiceProvider]):
        self._providers = tuple(providers)

    @property
    def providers(self) -> tuple[ServiceProvider, ...]:
        return self._providers

    def register_into(self, container: ServiceContainer) -> int:
        registered_count = 0
        for provider in self._providers:
            if not provider.is_enabled() or container.has(provider.name):
                continue
            container.register(provider.name, lambda provider=provider: provider.factory(container))
            registered_count += 1
        return registered_count
