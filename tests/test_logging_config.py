import backend.config as config_module


def _isolated_settings(tmp_path, monkeypatch, **env):
    monkeypatch.setattr(config_module, "_load_env_file", lambda _path: {})
    monkeypatch.setenv(config_module.RUNTIME_DIR_ENV, str(tmp_path))
    for key in ("DEBUG", "LOG_LEVEL", "ENABLE_DETAILED_LLM_LOGGING"):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return config_module.Settings()


def test_production_logging_defaults_to_info_without_llm_payloads(tmp_path, monkeypatch):
    configured = _isolated_settings(tmp_path, monkeypatch)

    assert configured.LOG_LEVEL == "INFO"
    assert configured.ENABLE_DETAILED_LLM_LOGGING is False


def test_detailed_llm_logging_requires_explicit_environment_switch(
    tmp_path,
    monkeypatch,
):
    configured = _isolated_settings(
        tmp_path,
        monkeypatch,
        ENABLE_DETAILED_LLM_LOGGING="true",
    )

    assert configured.ENABLE_DETAILED_LLM_LOGGING is True


def test_debug_mode_raises_default_log_verbosity_without_enabling_payloads(
    tmp_path,
    monkeypatch,
):
    configured = _isolated_settings(tmp_path, monkeypatch, DEBUG="true")

    assert configured.LOG_LEVEL == "DEBUG"
    assert configured.ENABLE_DETAILED_LLM_LOGGING is False
