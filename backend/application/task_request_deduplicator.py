import json
from collections.abc import Iterable


class TaskRequestDeduplicator:
    @staticmethod
    def get_comparison_key(params: dict) -> str:
        if "steps" in params:
            try:
                normalized_steps = []
                for step in params["steps"]:
                    step_name = step.get("step_name")
                    step_params = step.get("params", {})
                    if step_name == "download":
                        normalized_steps.append(
                            {
                                "step_name": step_name,
                                "url": step_params.get("url"),
                                "output_dir": step_params.get("output_dir"),
                                "playlist_title": step_params.get("playlist_title"),
                                "playlist_items": step_params.get("playlist_items"),
                                "download_subs": step_params.get("download_subs", False),
                                "resolution": step_params.get("resolution", "best"),
                                "codec": step_params.get("codec", "best"),
                                "filename": step_params.get("filename") or step_params.get("output_filename"),
                            }
                        )
                    else:
                        normalized_steps.append(step)
                return json.dumps(normalized_steps, sort_keys=True, default=str)
            except (KeyError, TypeError, IndexError):
                pass
        elif "url" in params:
            return params["url"]
        return json.dumps(params, sort_keys=True)

    def find_existing_task(
        self,
        tasks: Iterable,
        task_type: str,
        request_params: dict,
    ) -> str | None:
        if not request_params:
            return None

        target_key = self.get_comparison_key(request_params)

        for task in tasks:
            if task.type != task_type or not task.request_params:
                continue
            current_key = self.get_comparison_key(task.request_params)
            if current_key == target_key:
                return task.id
        return None
