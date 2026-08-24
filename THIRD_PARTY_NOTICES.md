# Third-party notices

MediaFlow includes or can install third-party components. Each component remains under its own license; MediaFlow's project license does not replace those terms. The desktop package carries this notice and the files under `third_party_licenses/` in its `legal/` directory.

## Distributed in the Windows desktop package

| Component | Use | License and source |
| --- | --- | --- |
| Electron, Chromium, and Node.js | Desktop shell and embedded browser runtime | Electron is MIT-licensed. Electron's own package supplies its license and `LICENSES.chromium.html`, which electron-builder retains in the distribution. Source: <https://github.com/electron/electron>. |
| FFmpeg 8.1 essentials build by Gyan Doshi | Media probing, decoding, encoding, and muxing | GPL-3.0-only. Exact release, archive digest, executable digests, build README, license text, and corresponding source revision are recorded in `contracts/bundled-tools.json` and `third_party_licenses/FFmpeg-*`. |
| LXGW WenKai Regular | User-interface and subtitle font | SIL Open Font License 1.1. Copyright 2021-2026 LXGW and copyright 2020 The Klee Project Authors. The required notice and license are in `third_party_licenses/LXGW-WenKai-OFL-1.1.txt`. Source: <https://github.com/lxgw/LxgwWenKai>. |

The JavaScript and Python package-manager dependencies retain their own licenses. Their exact resolved versions are recorded in `frontend/package-lock.json` and `pdm.lock`. The Python backend bundled by PyInstaller and the frontend bundle may include code from those resolved packages; review the dependency manifests when redistributing a modified build.

## Installed or downloaded separately at the user's request

| Component | Distribution boundary |
| --- | --- |
| yt-dlp | MediaFlow downloads the official PyPI wheel, verifies the release SHA-256, retains its `.dist-info` metadata and license files, and records source, version, and digest. The upstream project is released under the Unlicense. |
| Faster-Whisper-XXL command-line package | MediaFlow downloads the pinned Purfview release archive into writable runtime storage and retains the complete archive contents, including any notices supplied by that distribution. The upstream repository does not declare one repository-wide license; the archive contains separately licensed components. Review those included notices before redistribution. |
| faster-whisper, CTranslate2, and speech-recognition model weights | Python engines and model weights are resolved or downloaded separately. Engine code and each model card/license govern their respective files. Model provenance records the repository and immutable revision. |

User media is not a MediaFlow dependency. Users are responsible for having the rights required to download, process, translate, or publish their media.
