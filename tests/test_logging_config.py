import backend.config as config_module


def _isolated_settings(tmp_path, monkeypatch, **env):
    monkeypatch.setattr(config_module, "_load_env_file", lambda _path: {})
    monkeypatch.setattr(config_module.sys, "path", list(config_module.sys.path))
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


def test_settings_construction_does_not_create_runtime_state_or_mutate_process_env(
    tmp_path,
    monkeypatch,
):
    runtime_root = tmp_path / "runtime"
    monkeypatch.setattr(config_module, "_load_env_file", lambda _path: {})
    monkeypatch.setenv(config_module.RUNTIME_DIR_ENV, str(runtime_root))
    monkeypatch.delenv("HF_HOME", raising=False)

    configured = config_module.Settings()

    assert configured.RUNTIME_DIR == runtime_root
    assert not runtime_root.exists()
    assert "HF_HOME" not in config_module.os.environ

    configured.prepare_runtime_environment()
    assert configured.USER_DATA_DIR.is_dir()
    assert config_module.os.environ["HF_HOME"] == str(configured.HUGGINGFACE_CACHE_DIR)
