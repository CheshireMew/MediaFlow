class TaskControlRequested(Exception):
    """Base exception for cooperative task stop requests."""


class TaskPauseRequested(TaskControlRequested):
    """Raised when a running task should pause cooperatively."""


class TaskCancelRequested(TaskControlRequested):
    """Raised when a running task should cancel cooperatively."""
