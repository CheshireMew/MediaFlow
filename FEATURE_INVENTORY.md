# MediaFlow Feature Inventory

> **Status**: Development Phase 7 (Modular Framework)

## 1. 核心模块 (Modules)

| 模块名称        | 描述                             | 状态      | 技术栈                     |
| :-------------- | :------------------------------- | :-------- | :------------------------- |
| **Downloader**  | 独立视频下载工具                 | ✅ 已复用 | yt-dlp + FFmpeg            |
| **Transcriber** | 独立语音识别/转录工具            | 🚧 开发中 | Faster-Whisper + VAD       |
| **Translator**  | 字幕翻译/大模型润色              | 📅 计划中 | LLM (DeepSeek/OpenAI)      |
| **Editor**      | 视频预览 + 波形时间轴 + 字幕编辑 | 🚧 强化中 | WaveSurfer.js + Video Sync |
| **VideoTool**   | 视频剪辑工具 (裁剪/去黑边)       | 📅 计划中 | FFmpeg Filter              |
| **Dashboard**   | 任务队列监控                     | 📅 计划中 | WebSocket                  |

## 2. 基础设施 (Infrastructure)

- **Backend**: Python FastAPI + Pydantic v2
- **Frontend**: React 18 + Vite + Lucide Icons
- **Shell**: Electron (Frameless Window)
- **Runtime**: FFmpeg Portable (Self-contained)

## 3. 开发规范 (Standards)

- **架构**: Core-Shell 分离
- **UI**: 深色商务模式, Lucide 图标, 侧边栏导航
- **同步**: 视频与波形强绑定 (MediaElement Sync)
