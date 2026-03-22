from backend.services.task_media_contract import normalize_task_media_contract


def test_normalize_task_media_contract_upgrades_legacy_translate_payload():
    payload = {
        "type": "translate",
        "request_params": {
            "context_path": "E:/subs/demo.srt",
        },
        "result": {
            "files": [{"type": "subtitle", "path": "E:/subs/demo_zh.srt"}],
            "meta": {"srt_path": "E:/subs/demo_zh.srt"},
        },
    }

    normalized = normalize_task_media_contract(payload)

    assert normalized is True
    assert payload["request_params"]["context_ref"]["path"] == "E:/subs/demo.srt"
    assert payload["request_params"]["subtitle_ref"]["path"] == "E:/subs/demo.srt"
    assert payload["result"]["meta"]["subtitle_ref"]["path"] == "E:/subs/demo_zh.srt"
    assert payload["result"]["meta"]["output_ref"]["path"] == "E:/subs/demo_zh.srt"


def test_normalize_task_media_contract_preserves_native_refs():
    payload = {
        "type": "translate",
        "request_params": {
            "context_ref": {
                "path": "E:/subs/demo.srt",
                "name": "demo.srt",
                "media_kind": "subtitle",
                "origin": "task",
            }
        },
        "result": {
            "files": [{"type": "subtitle", "path": "E:/subs/demo_zh.srt"}],
            "meta": {
                "subtitle_ref": {
                    "path": "E:/subs/demo_zh.srt",
                    "name": "demo_zh.srt",
                    "media_kind": "subtitle",
                    "origin": "task",
                },
                "output_ref": {
                    "path": "E:/subs/demo_zh.srt",
                    "name": "demo_zh.srt",
                    "media_kind": "subtitle",
                    "origin": "task",
                },
            },
        },
    }

    normalized = normalize_task_media_contract(payload)

    assert normalized is False
    assert payload["request_params"]["context_ref"]["path"] == "E:/subs/demo.srt"
    assert payload["result"]["meta"]["subtitle_ref"]["path"] == "E:/subs/demo_zh.srt"
