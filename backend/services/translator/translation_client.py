from loguru import logger


class TranslationClientFactory:
    def __init__(self, settings_manager):
        self._settings_manager = settings_manager

    def get_client(self):
        import instructor
        from openai import OpenAI

        provider = self._settings_manager.get_active_llm_provider()
        if not provider:
            logger.error("No active LLM provider found in settings.")
            return None, None

        client = instructor.patch(
            OpenAI(
                api_key=provider.api_key,
                base_url=provider.base_url,
            )
        )
        return client, provider.model
