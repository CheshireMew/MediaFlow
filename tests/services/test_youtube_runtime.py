from backend.services.cookie_manager import CookieManager
from backend.services.ytdlp_runtime_options import YtDlpRuntimeOptions
from backend.services.youtube_runtime import youtube_options


def test_shared_options_enable_anonymous_provider_without_browser_cookies(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("MEDIAFLOW_YOUTUBE_TOOLS_DIR", str(tmp_path))
    server = tmp_path / "bgutil-2.0.0" / "server"
    (server / "build").mkdir(parents=True)
    (server / "build" / "generate_once.js").write_text("// installed")
    monkeypatch.setattr(
        "backend.services.youtube_runtime.shutil.which",
        lambda name: "D:/Tools/NodeJS/node.exe" if name == "node" else None,
    )
    options = YtDlpRuntimeOptions(
        cookie_manager=CookieManager(tmp_path / "cookies")
    ).build_base(
        url="https://youtu.be/abc",
        proxy="http://127.0.0.1:7897",
    )
    assert options["extractor_args"]["youtube"]["player_client"] == ["mweb"]
    assert options["extractor_args"]["youtubepot-bgutilscript"]["server_home"] == [
        str(server)
    ]
    assert options["js_runtimes"]["node"]["path"] == "D:/Tools/NodeJS/node.exe"
    assert options["no_warnings"] is False
    assert options["proxy"] == "http://127.0.0.1:7897"
    assert "cookiesfrombrowser" not in options
    assert "cookiefile" not in options


def test_youtube_short_url_reuses_explicitly_saved_youtube_cookies(tmp_path):
    manager = CookieManager(tmp_path)
    cookie_file = manager.get_cookie_path("youtube.com")
    cookie_file.write_text("# Netscape HTTP Cookie File\n")
    runtime = YtDlpRuntimeOptions(cookie_manager=manager)
    assert runtime.detect_cookie_file("https://youtu.be/abc") == str(cookie_file)


def test_uninstalled_provider_does_not_force_unsupported_client(tmp_path, monkeypatch):
    monkeypatch.setenv("MEDIAFLOW_YOUTUBE_TOOLS_DIR", str(tmp_path))
    monkeypatch.setattr("backend.services.youtube_runtime.shutil.which", lambda _: None)
    assert "extractor_args" not in youtube_options()
