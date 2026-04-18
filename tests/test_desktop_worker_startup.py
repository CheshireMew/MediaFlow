from backend import desktop_worker


def test_ping_skips_runtime_bootstrap(monkeypatch):
    emitted: list[dict] = []
    bootstrapped: list[bool] = []

    monkeypatch.setattr(desktop_worker, "emit", emitted.append)
    monkeypatch.setattr(
        desktop_worker,
        "ensure_worker_runtime_bootstrapped",
        lambda: bootstrapped.append(True),
    )

    desktop_worker.handle_request({"id": "ping-1", "command": "ping", "payload": {}})

    assert emitted == [
        {
            "type": "response",
            "id": "ping-1",
            "ok": True,
            "result": {
                "status": "pong",
                "protocol_version": desktop_worker.DESKTOP_WORKER_PROTOCOL_VERSION,
                "app_version": desktop_worker.settings.APP_VERSION,
            },
        }
    ]
    assert bootstrapped == []


def test_runtime_command_bootstraps_before_dispatch(monkeypatch):
    boot_sequence: list[str] = []
    dispatched: list[tuple[str, str | None, dict[str, object]]] = []

    monkeypatch.setattr(desktop_worker, "command_requires_runtime", lambda command: command == "dummy")
    monkeypatch.setattr(
        desktop_worker,
        "ensure_worker_runtime_bootstrapped",
        lambda: boot_sequence.append("bootstrapped"),
    )
    monkeypatch.setattr(
        desktop_worker,
        "dispatch_worker_command",
        lambda command, request_id, payload: dispatched.append((command, request_id, payload)),
    )

    desktop_worker.handle_request({"id": "req-1", "command": "dummy", "payload": {"value": 1}})

    assert boot_sequence == ["bootstrapped"]
    assert dispatched == [("dummy", "req-1", {"value": 1})]
