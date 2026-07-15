from backend.models.pipeline_contracts import PipelineRequest
from backend.services.settings_manager import UserSettings


class PipelineRequestPreparer:
    """Applies runtime settings to a canonical pipeline request."""

    def prepare(
        self,
        request: PipelineRequest,
        settings: UserSettings,
    ) -> PipelineRequest:
        payload = request.model_dump(mode="json")
        changed = False
        for step in payload["steps"]:
            params = step["params"]
            if (
                step["step_name"] == "download"
                and not params.get("output_dir")
                and settings.default_download_path
            ):
                params["output_dir"] = settings.default_download_path
                changed = True
        return PipelineRequest.model_validate(payload) if changed else request
