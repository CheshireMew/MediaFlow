import sys


def configure_utf8_stdio(*, include_stdin: bool = False) -> None:
    if include_stdin:
        reconfigure_in = getattr(sys.stdin, "reconfigure", None)
        if callable(reconfigure_in):
            sys.stdin.reconfigure(encoding="utf-8")

    reconfigure_out = getattr(sys.stdout, "reconfigure", None)
    if callable(reconfigure_out):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    reconfigure_err = getattr(sys.stderr, "reconfigure", None)
    if callable(reconfigure_err):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

