import pytest

from backend import desktop_worker
from backend.contracts import DESKTOP_WORKER_CONTRACT
from backend.desktop.command_registry import (
    get_worker_command_definition,
    register_worker_command,
)


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


def test_all_contract_worker_commands_are_registered():
    worker_commands = {
        descriptor["workerCommand"]
        for descriptor in DESKTOP_WORKER_CONTRACT["invocations"].values()
    }
    worker_commands.update(DESKTOP_WORKER_CONTRACT.get("workerCommands", {}).keys())

    for command in worker_commands:
        definition = get_worker_command_definition(command)
        assert definition is not None


def test_worker_command_registration_rejects_commands_outside_contract():
    with pytest.raises(ValueError, match="Unknown worker command"):
        register_worker_command("outside_contract")(lambda _request_id, _payload: None)
