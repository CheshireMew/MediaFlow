# FFmpeg 8.1 Windows build provenance

MediaFlow distributes unmodified `ffmpeg.exe` and `ffprobe.exe` files from the Gyan FFmpeg 8.1 essentials ZIP published on 17 March 2026.

- Release: <https://github.com/GyanD/codexffmpeg/releases/tag/8.1>
- Archive: <https://github.com/GyanD/codexffmpeg/releases/download/8.1/ffmpeg-8.1-essentials_build.zip>
- Archive SHA-256: `8748283d821613d930b0e7be685aaa9df4ca6f0ad4d0c42fd02622b3623463c6`
- Corresponding FFmpeg source revision: <https://github.com/FFmpeg/FFmpeg/commit/9047fa1b08>
- Build provider and current build documentation: <https://www.gyan.dev/ffmpeg/builds/>

`FFmpeg-8.1-BUILD-README.txt` is the README shipped in that exact archive. It records the build configuration, enabled components, external libraries, source revision, and GPLv3 status. `FFmpeg-GPL-3.0.txt` is the unmodified license file from the same archive.

The checked-in binary hashes are pinned in `contracts/bundled-tools.json`. The formal desktop build verifies both hashes and version banners before packaging. Changing either executable therefore requires an explicit contract and legal-resource update.
