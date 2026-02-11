# 🌊 MediaFlow

**MediaFlow** 是一个现代化的本地视频字幕生成与处理工作站。基于 Electron + React + Python (FastAPI) 构建，旨在提供从视频下载、转录、翻译到合成的一站式解决方案。

## ✨ 核心特性

- **📽️ 视频下载**: 支持多平台视频解析与下载（内置 yt-dlp 集成）。
- **📝 智能转录**: 集成 Whisper 模型，支持本地 GPU 加速转录。
- **🌍 翻译工作流**:
  - 支持多服务商（DeepL, OpenAI, Claude, SiliconeFlow）。
  - **术语表支持**: 保证专业词汇翻译准确性。
  - **人机协同**: 提供可视化字幕编辑器，支持波形图、实时预览和快捷键操作。
- **🎬 视频合成**:
  - **真·分辨率适配**: 自动探测视频分辨率，确保字幕和水印在 4K/1080p/720p 下均完美显示。
  - **水印系统**: 支持位置预设、透明度调整和智能缩放。
- **⚡ Architecture 2.0**:
  - **高内聚低耦合**: 采用 Hook 拆分 (useTranslationTask, useGlossary) 和服务层隔离。
  - **健壮性**: 统一的异常处理、中央导航服务 (NavigationService) 和 类型安全的 API 契约。

## 🏗️ 项目结构

```
Mediaflow/
├── src/                  # Python 后端 (FastAPI)
│   ├── services/         # 核心业务逻辑 (转录, 翻译, 合成)
│   ├── routers/          # API 路由
│   └── utils/            # 工具库 (SubtitleManager, HashUtil)
├── frontend/             # Electron + React 前端
│   ├── src/
│   │   ├── components/   # UI 组件 (Dialogs, Downloader, Editor)
│   │   ├── hooks/        # 自定义 Hooks (逻辑核心)
│   │   │   ├── useTranslator.ts     # 翻译聚合 Hook
│   │   │   ├── useTranslationTask.ts # 任务管理
│   │   │   ├── useGlossary.ts        # 术语表逻辑
│   │   │   └── useFileIO.ts          # 文件操作
│   │   ├── services/     # 前端服务 (Navigation, API Client)
│   │   └── pages/        # 页面路由
├── models/               # AI 模型权重
└── user_data/            # 用户数据 (数据库, 配置)
```

## 🚀 快速启动

### 1. 后端启动 (Dev)

```powershell
# 推荐使用 Python 3.10+
python -m uvicorn src.main:app --host 127.0.0.1 --port 8001 --reload
```

### 2. 前端启动 (Dev)

```powershell
cd frontend
npm run electron:dev
# 或者在根目录: npm run dev
```

## 🛠️ 环境依赖

- **Python**: 3.10+ (推荐使用 uv 管理依赖)
- **Node.js**: 18+
- **FFmpeg**: 需配置系统环境变量或放入 `bin/` 目录
- **GPU**: 推荐 NVIDIA 显卡以获得最佳转录速度 (CUDA 11.8+)

## 🔄 最近更新 (Architecture 2.0)

- **UI/UX**: 修复了下载按钮样式、优化了合成对话框交互。
- **Scaling**: 实现了 Subtitle/Watermark 的真·分辨率自适应缩放。
- **Refactor**: 这里的代码库经历了深度重构，提升了可维护性和扩展性。

---

_Created with ❤️ by AntiGravity Agent._
