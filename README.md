# 🌊 MediaFlow

**MediaFlow** 是一个现代化的本地视频字幕生成与处理工作站。基于 Electron + React + Python (FastAPI) 构建，旨在提供从视频下载、转录、翻译到合成的一站式解决方案。

## ✨ 核心特性

- **📽️ 视频下载**: 支持多平台视频解析与下载（内置 yt-dlp 集成）。
- **📝 智能转录**: 集成 Whisper 模型，支持本地 GPU 加速转录。
- **🌍 翻译工作流**:
  - 支持多服务商（OpenAI、DeepSeek、OpenRouter、自定义 OpenAI 兼容接口）。
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
├── backend/              # Python 后端 (FastAPI)
│   ├── api/v1/           # HTTP / WebSocket 接口
│   ├── application/      # 工作流编排与用例层
│   ├── core/             # 容器、任务系统、步骤注册
│   ├── services/         # 业务服务 (下载、转录、翻译、合成等)
│   └── utils/            # 底层工具
├── frontend/             # Electron + React 前端
│   ├── electron/         # Electron 主进程 / preload
│   ├── src/
│   │   ├── components/   # UI 组件
│   │   ├── hooks/        # 前端业务逻辑
│   │   ├── pages/        # 页面入口
│   │   ├── services/     # 前端服务层
│   │   └── stores/       # 状态管理
├── scripts/
│   ├── debug/            # 手工排障 / 复现脚本
│   ├── setup/            # 环境与模型安装脚本
│   └── verify/           # 手工验证 / 冒烟脚本
├── tests/
│   ├── api/              # 后端接口测试
│   ├── application/      # 应用层测试
│   ├── core/             # 核心调度与流水线测试
│   ├── services/         # 服务层测试
│   └── fixtures/         # 测试样本与夹具
├── docs/                 # 文档与问题记录
├── workspace/            # 默认下载与处理输出目录（已忽略）
├── output/               # 本地验证输出目录（已忽略）
├── models/               # 模型权重目录（已忽略）
└── user_data/            # 用户数据与本地配置（已忽略）
```

### 目录约定

- `backend/`、`frontend/`、`tests/`、`scripts/` 是长期维护的源码目录。
- `workspace/`、`output/`、`models/`、`user_data/` 是本地运行数据目录，不应提交到 Git。
- `scripts/debug/` 和 `scripts/verify/` 用于手工排查与验证，不属于 `pytest` 自动测试集合。

## 🚀 快速启动

### 1. 后端启动 (Dev)

```powershell
# 推荐使用 Python 3.10+
# Windows 下优先使用该入口，以确保事件循环策略与 Playwright 兼容
npm run backend:dev
```

### 2. 前端启动 (Dev)

```powershell
npm run frontend:dev
# 或者:
# npm run dev
```

### 3. Windows 一键启动

```powershell
start.bat
```

## 🧪 测试与验证

```powershell
# 后端测试
npm run test:backend

# 前端测试
npm run test:frontend

# 全量测试入口
npm run test
```

- `tests/` 只放自动化测试。
- `scripts/verify/` 放手工验证和冒烟脚本。
- `scripts/debug/` 放复现问题和临时排障脚本。

## 🛠️ 环境依赖

- **Python**: 3.10+ (推荐使用 uv 管理依赖)
- **Node.js**: 18+
- **FFmpeg**: 需配置系统环境变量或放入 `bin/` 目录
- **GPU**: 推荐 NVIDIA 显卡以获得最佳转录速度 (CUDA 11.8+)
- **安装依赖**: Python 依赖见 `pyproject.toml` / `requirements.txt`，前端依赖见 `frontend/package.json`

## ⚙️ 设置说明

### LLM 供应商

- 设置页内置常见供应商预设：`OpenAI / GPT`、`DeepSeek`、`OpenRouter`
- 也支持自定义 OpenAI 兼容接口，手动填写 `Base URL`、`API Key` 和 `Model`
- 新增或编辑供应商时可直接使用“测试连接”按钮校验接口是否可用

### API Key 存储

- API Key 保存在 `user_data/user_settings.json`
- 在 Windows 上，程序会优先使用 DPAPI 进行本机当前用户级加密
- 如果 DPAPI 不可用，会回退为可读明文保存，以避免用户因加密失败无法继续使用
- 配置文件会显式标记 `api_key_encrypted: true/false`
- `user_data/` 和 `data/` 已被 `.gitignore` 忽略，默认不会被提交到 Git

### 默认下载目录

- 可在设置页指定“默认下载目录”
- 未设置时，下载任务默认保存到 `workspace/`

## 🔄 最近更新 (Architecture 2.0)

- **UI/UX**: 修复了下载按钮样式、优化了合成对话框交互。
- **Scaling**: 实现了 Subtitle/Watermark 的真·分辨率自适应缩放。
- **Refactor**: 这里的代码库经历了深度重构，提升了可维护性和扩展性。
- **Settings**: 新增 LLM 供应商预设、独立翻译目标语言、默认下载目录、测试连接与本地加密/明文回退标记。

