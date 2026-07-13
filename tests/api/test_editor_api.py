from backend.contracts import TASK_CONTRACT_VERSION


def test_editor_synthesize_requires_video_ref(client):
    response = client.post(
        "/api/v1/editor/synthesize",
        json={
            "srt_ref": {"path": "E:/subs/demo.srt", "name": "demo.srt"},
            "options": {},
        },
    )

    assert response.status_code == 422


def test_editor_synthesize_requires_subtitle_ref_unless_disabled(client, tmp_path):
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"video")
    response = client.post(
        "/api/v1/editor/synthesize",
        json={
            "video_ref": {"path": str(video_path), "name": "demo.mp4"},
            "options": {},
        },
    )

    assert response.status_code == 400


def test_editor_synthesize_accepts_missing_subtitle_ref_when_disabled(
    client, tmp_path, monkeypatch
):
    video_path = tmp_path / "demo.mp4"
    output_path = tmp_path / "demo_exported.mp4"
    video_path.write_bytes(b"video")
    captured = {}

    async def fake_submit_task_operation(_self, task_type, request):
        captured["task_type"] = task_type
        captured["request"] = request
        return {
            "task_id": "synthesis-without-subtitles",
            "status": "pending",
            "message_code": "queued",
            "message_params": {},
            "task_source": "backend",
                "task_contract_version": TASK_CONTRACT_VERSION,
                "revision": 0,
            "persistence_scope": "runtime",
            "lifecycle": "resumable",
            "queue_state": "queued",
            "queue_position": None,
            "primary_operation": "synthesis",
        }

    monkeypatch.setattr(
        "backend.application.task_operations.TaskOperationService.submit",
        fake_submit_task_operation,
    )

    response = client.post(
        "/api/v1/editor/synthesize",
        json={
            "video_ref": {"path": str(video_path), "name": video_path.name},
            "output_ref": {"path": str(output_path), "name": output_path.name},
            "options": {"skip_subtitles": True},
        },
    )

    assert response.status_code == 200
    assert response.json()["task_id"] == "synthesis-without-subtitles"
    assert captured["task_type"] == "synthesis"
    assert captured["request"].srt_ref is None
    assert captured["request"].options["skip_subtitles"] is True


def test_editor_synthesize_validates_watermark_reference(client, tmp_path):
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"video")
    missing_watermark = tmp_path / "missing-watermark.png"

    response = client.post(
        "/api/v1/editor/synthesize",
        json={
            "video_ref": {"path": str(video_path), "name": video_path.name},
            "watermark_ref": {
                "path": str(missing_watermark),
                "name": missing_watermark.name,
            },
            "options": {"skip_subtitles": True},
        },
    )

    assert response.status_code == 404
    assert "watermark_ref.path" in response.json()["detail"]


def test_editor_synthesize_rejects_legacy_watermark_path(client, tmp_path):
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"video")

    response = client.post(
        "/api/v1/editor/synthesize",
        json={
            "video_ref": {"path": str(video_path), "name": video_path.name},
            "watermark_path": str(tmp_path / "legacy.png"),
            "options": {"skip_subtitles": True},
        },
    )

    assert response.status_code == 422


def test_clip_export_rejects_invalid_range_at_request_boundary(client, tmp_path):
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"video")

    response = client.post(
        "/api/v1/editor/clips/export",
        json={
            "video_ref": {"path": str(video_path), "name": video_path.name},
            "render_mode": "source",
            "segments": [{"id": "clip-1", "start": -1, "end": 1}],
        },
    )

    assert response.status_code == 422


def test_clip_export_validates_watermark_reference(client, tmp_path):
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"video")
    missing_watermark = tmp_path / "missing-watermark.png"

    response = client.post(
        "/api/v1/editor/clips/export",
        json={
            "video_ref": {"path": str(video_path), "name": video_path.name},
            "watermark_ref": {
                "path": str(missing_watermark),
                "name": missing_watermark.name,
            },
            "render_mode": "source",
            "segments": [{"id": "clip-1", "start": 0, "end": 1}],
        },
    )

    assert response.status_code == 404
    assert "watermark_ref.path" in response.json()["detail"]


def test_clip_export_rejects_out_of_bounds_range_before_queueing(client, tmp_path, monkeypatch):
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"video")
    monkeypatch.setattr(
        "backend.application.clip_export_service.MediaProber.get_duration",
        lambda _path: 2.0,
    )

    response = client.post(
        "/api/v1/editor/clips/export",
        json={
            "video_ref": {"path": str(video_path), "name": video_path.name},
            "render_mode": "source",
            "segments": [{"id": "clip-1", "start": 1, "end": 3}],
        },
    )

    assert response.status_code == 400
    assert "exceeds video duration" in response.json()["detail"]
