from backend.models.schemas import PipelineRequest
from backend.services.settings_manager import UserSettings


class TranscriberWorkflowService:
    def is_transcriber_pipeline(self, req: PipelineRequest) -> bool:
        return (
            req.pipeline_id == "transcriber_tool"
            and bool(req.steps)
            and req.steps[0].step_name == "transcribe"
        )

    def prepare_request(
        self,
        req: PipelineRequest,
        settings: UserSettings,
    ) -> PipelineRequest:
        if not self.is_transcriber_pipeline(req):
            return req

        payload = req.model_dump(mode="json")
        return PipelineRequest.model_validate(payload)
