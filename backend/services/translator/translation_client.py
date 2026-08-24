import hashlib
import threading

from loguru import logger


class TranslationClientFactory:
    def __init__(self, settings_manager):
        self._settings_manager = settings_manager
        self._lock = threading.RLock()
        self._clients: dict[str, tuple[object, str]] = {}

    @staticmethod
    def _provider_fingerprint(provider) -> str:
        secret_digest = hashlib.sha256(provider.api_key.encode("utf-8")).hexdigest()
        identity = "\0".join(
            (provider.id, provider.base_url.rstrip("/"), provider.model, secret_digest)
        )
        return hashlib.sha256(identity.encode("utf-8")).hexdigest()

    def get_client(self):
        import instructor
        from openai import OpenAI

        provider = self._settings_manager.get_active_llm_provider()
        if not provider:
            logger.error("No active LLM provider found in settings.")
            return None, None

        fingerprint = self._provider_fingerprint(provider)
        with self._lock:
            cached = self._clients.get(fingerprint)
            if cached is not None:
                return cached

            client = instructor.patch(
                OpenAI(
                    api_key=provider.api_key,
                    base_url=provider.base_url,
                )
            )
            result = (client, provider.model)
            self._clients[fingerprint] = result
            return result

    def close(self) -> None:
        with self._lock:
            clients = [client for client, _model in self._clients.values()]
            self._clients.clear()
        for client in clients:
            close = getattr(client, "close", None)
            if callable(close):
                try:
                    close()
                except Exception as exc:  # noqa: BLE001 - best-effort third-party cleanup
                    logger.warning("Failed to close an LLM client cleanly: {}", exc)
