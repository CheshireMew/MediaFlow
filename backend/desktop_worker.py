import json
import sys
import traceback

from loguru import logger
from pydantic import ValidationError

from backend.config import settings
from backend.desktop import commands  # noqa: F401
from backend.desktop.command_registry import dispatch_worker_command
from backend.desktop.worker_context import emit, emit_error
from backend.core.container import container
from backend.core.service_registry import register_desktop_worker_services

DESKTOP_WORKER_PROTOCOL_VERSION = 1

def configure_worker_stdio() -> None:
    reconfigure_in = getattr(sys.stdin, "reconfigure", None)
    if callable(reconfigure_in):
        sys.stdin.reconfigure(encoding="utf-8")
        
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if callable(reconfigure):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    reconfigure_err = getattr(sys.stderr, "reconfigure", None)
    if callable(reconfigure_err):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def configure_worker_logging() -> None:
    logger.remove()

    log_format = (
        "{time:YYYY-MM-DD HH:mm:ss.SSS} | "
        "{level:<8} | "
        "{name}:{function}:{line} - {message}"
    )

    logger.add(
        sys.stdout,
        level="DEBUG",
        format=log_format,
        enqueue=False,
        backtrace=False,
        diagnose=False,
        filter=lambda record: record["level"].no < 40,
    )
    logger.add(
        sys.stderr,
        level="ERROR",
        format=log_format,
        enqueue=False,
        backtrace=True,
        diagnose=False,
    )


def bootstrap_worker() -> None:
    settings.init_dirs()
    container.clear()
    register_desktop_worker_services(container)


def handle_request(request: dict[str, object]) -> None:
    request_id = request.get("id")
    command = request.get("command")
    payload = request.get("payload") or {}

    if command == "ping":
        emit({
            "type": "response",
            "id": request_id,
            "ok": True,
            "result": {
                "status": "pong",
                "protocol_version": DESKTOP_WORKER_PROTOCOL_VERSION,
                "app_version": settings.APP_VERSION,
            },
        })
        return

    if not isinstance(command, str):
        raise ValueError("Worker command must be a string")
    if not isinstance(payload, dict):
        raise ValueError("Worker payload must be an object")

    dispatch_worker_command(
        command,
        str(request_id) if request_id is not None else None,
        payload,
    )


def main() -> None:
    configure_worker_stdio()
    configure_worker_logging()
    bootstrap_worker()
    emit({"type": "ready"})

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            handle_request(request)
        except Exception as exc:  # noqa: BLE001
            request_id = None
            try:
                request_id = json.loads(line).get("id")
            except Exception:  # noqa: BLE001
                request_id = None

            if isinstance(exc, ValidationError):
                emit_error(
                    str(request_id) if request_id is not None else None,
                    exc.json(),
                )
            else:
                emit_error(str(request_id) if request_id is not None else None, str(exc))
            traceback.print_exc(file=sys.stderr)


if __name__ == "__main__":
    main()
