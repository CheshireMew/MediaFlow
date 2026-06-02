from backend.services.generated_output_paths import build_suffixed_output_path


def test_translation_output_path_preserves_normal_names():
    assert (
        build_suffixed_output_path("E:/subs/demo.srt", "_ZH-CN", extension=".srt")
    ).as_posix() == "E:/subs/demo_ZH-CN.srt"

    assert (
        build_suffixed_output_path("E:/subs/demo.ts.srt", "_ZH-CN", extension=".srt")
    ).as_posix() == "E:/subs/demo.ts_ZH-CN.srt"


def test_translation_output_path_shortens_windows_edge_paths():
    path = build_suffixed_output_path(
        r"C:\Users\Lenovo\Downloads\Cannibal Stocks (@cannibalstocks)- 'Mohnish Pabrai just revealed that Charlie Munger was buying Alpha Metallurgical Resources literally days before he passed away. Still making long-term bets at 99.9 years old. $AMR traded ar.ts.srt",
        "_ZH-CN",
        extension=".srt",
    )

    assert len(str(path)) <= 240
    assert str(path).endswith("_ZH-CN.srt")


def test_synthesis_output_path_uses_mp4_for_transport_stream_source():
    assert (
        build_suffixed_output_path("E:/clips/demo.ts", "_synthesized", extension=".mp4")
    ).as_posix() == "E:/clips/demo_synthesized.mp4"

    path = build_suffixed_output_path(
        r"C:\Users\Lenovo\Downloads\Cannibal Stocks (@cannibalstocks)- 'Mohnish Pabrai just revealed that Charlie Munger was buying Alpha Metallurgical Resources literally days before he passed away. Still making long-term bets at 99.9 years old. $AMR traded ar.ts",
        "_synthesized",
        extension=".mp4",
    )

    assert len(str(path)) <= 240
    assert str(path).endswith("_synthesized.mp4")
