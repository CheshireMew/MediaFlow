def test_editor_synthesize_requires_video_ref(client):
    response = client.post(
        "/api/v1/editor/synthesize",
        json={
            "srt_ref": {"path": "E:/subs/demo.srt", "name": "demo.srt"},
            "options": {},
        },
    )

    assert response.status_code == 422


def test_editor_synthesize_requires_subtitle_ref(client):
    response = client.post(
        "/api/v1/editor/synthesize",
        json={
            "video_ref": {"path": "E:/media/demo.mp4", "name": "demo.mp4"},
            "options": {},
        },
    )

    assert response.status_code == 422
