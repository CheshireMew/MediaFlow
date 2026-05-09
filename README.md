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

### 1. 首次初始化

新机器从 GitHub 拉取项目后，需要先在本机重建 Python 虚拟环境和前端依赖。`.venv/` 与 `node_modules/` 是本地生成目录，不会提交到 Git。

```powershell
git clone https://github.com/CheshireMew/MediaFlow.git
cd MediaFlow
npm run setup
```

国内网络如果 Electron 或 npm 包下载较慢，优先使用镜像初始化：

```powershell
npm run setup:cn
```

也可以直接运行 Windows 批处理入口：

```powershell
setup.bat
```

初始化脚本会自动执行：

- 创建 `.venv/`
- 安装 `pyproject.toml` 中声明的 Python 依赖
- 安装 `frontend/package-lock.json` 对应的前端依赖

### 2. 开发模式启动

```powershell
node scripts/dev.mjs
```

开发模式由根目录 `scripts/dev.mjs` 统一托管后端、Vite renderer 和 Electron。不要分别启动后端和前端；dev supervisor 会选择可用端口、注入前端 API / WebSocket 地址、注入后端 CORS origin，并在 Electron 退出时关闭子进程。

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
- **项目依赖安装**: Windows 下运行 `npm run setup`；国内网络可运行 `npm run setup:cn`
- **FFmpeg**: 需配置系统环境变量或放入 `bin/` 目录
- **Faster-Whisper CLI**: 推荐使用 Purfview 的 Windows 独立 CLI 包；本机已解压到 `bin/Faster-Whisper-XXL/faster-whisper-xxl.exe`
  - 官方仓库: https://github.com/Purfview/whisper-standalone-win
  - Release 页面: https://github.com/Purfview/whisper-standalone-win/releases/tag/Faster-Whisper-XXL
  - Windows 下载直链: https://github.com/Purfview/whisper-standalone-win/releases/download/Faster-Whisper-XXL/Faster-Whisper-XXL_r245.4_windows.7z
- **GPU / CUDA**: 推荐 NVIDIA 显卡以获得最佳转录速度。内置 `faster-whisper` GPU 转录需要 CUDA 12 运行库、cuBLAS for CUDA 12、cuDNN 9 for CUDA 12。
- **安装依赖**: Python 依赖见 `pyproject.toml`，前端依赖见 `frontend/package.json`

### Faster-Whisper-XXL 冷启动

Faster-Whisper-XXL 是独立 CLI 包，每次 CLI 转录都会启动一个新的 `faster-whisper-xxl.exe` 进程。该包目录包含大量 Torch/CUDA/ONNX DLL，冷启动时 Windows 需要加载这些依赖，可能在进程第一行输出前出现几十秒等待。Windows Defender 实时防护可能放大这个等待，但排除 Defender 后仍可能受冷文件缓存、DLL 动态加载、CUDA/Torch 初始化影响。这个等待不属于 MediaFlow 的 CUDA 就绪检查；CLI 自带 CUDA 运行库，内置 `faster-whisper` 的 CUDA DLL 检查不适用于它。

后端启动后会后台执行一次 `faster-whisper-xxl.exe --help` 来预热 CLI 依赖加载；如果应用刚启动就立即转录，第一次转录仍可能和预热竞争同一段冷启动成本。

如果确认本机 XXL 包来源可信，可以用管理员 PowerShell 只对 XXL 目录加 Defender 排除：

```powershell
Add-MpPreference -ExclusionPath "D:\Code\MediaFlow\bin\Faster-Whisper-XXL"
```

如果同时保留外部工具目录，也可以单独排除该目录：

```powershell
Add-MpPreference -ExclusionPath "D:\Software\Video\Faster-Whisper-XXL"
```

查看或删除排除项：

```powershell
(Get-MpPreference).ExclusionPath
Remove-MpPreference -ExclusionPath "D:\Code\MediaFlow\bin\Faster-Whisper-XXL"
```

不要排除整个磁盘，只排除实际使用的 XXL 目录。

### CUDA 手动依赖

只有选择内置转录引擎并把计算设备设为 `cuda` 时，才需要安装下面的 NVIDIA 依赖；CPU 转录和 Faster-Whisper CLI 不依赖这组 DLL。

Windows 推荐全局安装：

1. 安装 NVIDIA 显卡驱动，并确认 `nvidia-smi` 可执行。
2. 安装 CUDA Toolkit 12.x，确保 `bin` 目录加入 PATH，例如：
   - `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8\bin`
3. 安装 cuDNN 9 for CUDA 12，确保 cuDNN 的 `bin` 目录加入 PATH，例如：
   - `C:\Program Files\NVIDIA\CUDNN\v9.21\bin\12.9\x64`
4. 重新打开终端或重启后端进程，让新的 PATH 对后端生效。

验证命令：

```powershell
nvidia-smi
where cudart64_12.dll
where cublas64_12.dll
where cudnn64_9.dll
```

应用内也可以在 `设置 -> 通用设置 -> CUDA 就绪检查` 查看当前机器是否满足 GPU 转录要求。`nvidia-smi` 输出中的 `CUDA Version` 表示驱动支持的最高 CUDA API 版本，不等于已经安装了 CUDA Toolkit 或 cuDNN；最终以就绪检查和 `where` 命令能否找到上述 DLL 为准。

参考：
- CUDA Toolkit: https://developer.nvidia.com/cuda-downloads
- cuDNN: https://developer.nvidia.com/cudnn
- faster-whisper GPU requirements: https://github.com/SYSTRAN/faster-whisper#gpu

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

## ⭐ Star History

<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://api.star-history.com/svg?repos=CheshireMew/MediaFlow&type=Date&theme=dark"
  />
  <source
    media="(prefers-color-scheme: light)"
    srcset="https://api.star-history.com/svg?repos=CheshireMew/MediaFlow&type=Date"
  />
  <img
    alt="Star History Chart"
    src="https://api.star-history.com/svg?repos=CheshireMew/MediaFlow&type=Date"
  />
</picture>
