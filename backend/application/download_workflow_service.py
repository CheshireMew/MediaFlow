from backend.models.schemas import PipelineRequest
from backend.services.settings_manager import UserSettings


class DownloadWorkflowService:
    def is_download_pipeline(self, req: PipelineRequest) -> bool:
        return (
            req.pipeline_id == "downloader_tool"
            and bool(req.steps)
            and req.steps[0].step_name == "download"
        )

    def infer_task_type(self, req: PipelineRequest) -> str:
        if self.is_download_pipeline(req) and len(req.steps) == 1:
            return "download"
        return "pipeline"

    def prepare_request(
        self,
        req: PipelineRequest,
        settings: UserSettings,
    ) -> PipelineRequest:
        if not self.is_download_pipeline(req):
            return req

        payload = req.model_dump(mode="json")
        steps = payload.get("steps", [])
        if not steps:
            return req

        download_params = steps[0].setdefault("params", {})
        if not download_params.get("output_dir") and settings.default_download_path:
            download_params["output_dir"] = settings.default_download_path

        return PipelineRequest.model_validate(payload)
