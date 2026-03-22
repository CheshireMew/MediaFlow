from backend.core.context import PipelineContext


def test_pipeline_context_media_adapter_keeps_ref_and_legacy_path_mirrors_in_sync():
    ctx = PipelineContext()

    ctx.set_media(
        path_key="srt_path",
        ref_key="subtitle_ref",
        path="E:/subs/demo_CN.srt",
        media_type="application/x-subrip",
        mirror_path_keys=("subtitle_path",),
        extra_ref_keys=("context_ref", "output_ref"),
    )

    assert ctx.get("srt_path") == "E:/subs/demo_CN.srt"
    assert ctx.get("subtitle_path") == "E:/subs/demo_CN.srt"
    assert ctx.get("subtitle_ref")["path"] == "E:/subs/demo_CN.srt"
    assert ctx.get("context_ref")["path"] == "E:/subs/demo_CN.srt"
    assert ctx.get("output_ref")["path"] == "E:/subs/demo_CN.srt"
    assert ctx.get_media_path("subtitle_ref", "srt_path", "subtitle_path") == "E:/subs/demo_CN.srt"
