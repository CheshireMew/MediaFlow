class TaskRuntimeState:
    def __init__(self):
        self.queued_ids: set[str] = set()
        self.queued_order: list[str] = []
        self.running_ids: set[str] = set()
        self.stop_requests: dict[str, str] = {}
        self.delete_after_stop: set[str] = set()

    def clear(self) -> None:
        self.queued_ids.clear()
        self.queued_order.clear()
        self.running_ids.clear()
        self.stop_requests.clear()
        self.delete_after_stop.clear()

    def mark_queued(self, task_id: str) -> None:
        self.queued_ids.add(task_id)
        self.queued_order.append(task_id)

    def unmark_queued(self, task_id: str) -> None:
        self.queued_ids.discard(task_id)
        if task_id in self.queued_order:
            self.queued_order.remove(task_id)

    def mark_running(self, task_id: str) -> None:
        self.running_ids.add(task_id)
        self.stop_requests.pop(task_id, None)

    def unmark_running(self, task_id: str) -> None:
        self.running_ids.discard(task_id)

    def mark_delete_after_stop(self, task_id: str) -> None:
        self.delete_after_stop.add(task_id)

    def clear_delete_after_stop(self, task_id: str) -> None:
        self.delete_after_stop.discard(task_id)
