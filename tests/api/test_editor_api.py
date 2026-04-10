def test_editor_synthesize_requires_video_path(client):
    response = client.post(
        "/api/v1/editor/synthesize",
        json={
            "video_path": None,
            "srt_path": "E:/subs/demo.srt",
            "options": {},
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "synthesis video path is required"


def test_editor_synthesize_requires_subtitle_path(client):
    response = client.post(
        "/api/v1/editor/synthesize",
        json={
            "video_path": "E:/media/demo.mp4",
            "srt_path": None,
            "options": {},
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "synthesis subtitle path is required"
