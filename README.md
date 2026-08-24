# 🌊 MediaFlow

**MediaFlow** 是一个现代化的本地视频字幕生成与处理工作站。基于 Electron + React + Python (FastAPI) 构建，旨在提供从视频下载、转录、翻译到合成的一站式解决方案。

## ✨ 核心特性

- **📽️ 媒体下载**: 支持多平台视频、音频和小宇宙公开播客单集解析与下载（内置 yt-dlp 集成）。
- **📝 智能转录**: 集成 Whisper 模型，支持本地 GPU 加速转录。
- **🌍 翻译工作流**:
  - 支持多服务商（OpenAI、DeepSeek、OpenRouter、自定义 OpenAI 兼容接口）。
  - **术语表支持**: 保证专业词汇翻译准确性。
  - **人机协同**: 提供可视化字幕编辑器，支持波形图、实时预览和快捷键操作。
- **🎬 视频合成**:
  - **真·分辨率适配**: 自动探测视频分辨率，确保字幕和水印在 4K/1080p/720p 下均完美显示。
  - **水印系统**: 支持位置预设、透明度调整和智能缩放。
- **可靠的桌面任务**: 后台任务支持持久化、暂停和断点恢复；桌面关闭会先确认工作区状态落盘，再停止后端进程。
- **显式运行合同**: 后端健康状态、任务协议和 Electron 桥能力都由版本化合同约束，前端类型由后端模型生成。

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
├── contracts/            # 任务与桌面桥运行合同
├── .project-steward/     # 受管运行产物与项目治理合同
├── archive/              # 已退出运行、构建和测试边界的历史实现
├── workspace/            # 默认下载与处理输出目录（已忽略）
├── output/               # 本地验证输出目录（已忽略）
├── models/               # 模型权重目录（已忽略）
└── user_data/            # 用户数据与本地配置（已忽略）
```

### 目录约定

- `backend/`、`frontend/`、`tests/`、`scripts/` 是长期维护的源码目录。
- 开发模式下，`workspace/`、`output/`、`models/`、`user_data/` 是仓库内的本地运行数据目录，不应提交到 Git。
- Windows 桌面生产版优先把可变运行数据、模型和工具写入 `D:\Tools\MediaFlow\runtime`；可通过 `MEDIAFLOW_RUNTIME_DIR` 显式覆盖。仅在 D 盘不可用且未配置该变量时才回退到系统用户数据目录。
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

# 前端静态检查、类型检查和浏览器端到端测试
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test:e2e
```

- `tests/` 只放自动化测试。
- `scripts/verify/` 放手工验证和冒烟脚本。
- `scripts/debug/` 放复现问题和临时排障脚本。
- Windows CI 还会构建并启动真实 PyInstaller 后端，再把它装入未压缩 Electron 产物，验证桌面渲染进程看到的后端状态为 `ready`。

## 🛠️ 环境依赖

- **Python**: 3.10+（锁文件与 CI 使用 PDM 校验）
- **Node.js**: 22
- **项目依赖安装**: Windows 下运行 `npm run setup`；国内网络可运行 `npm run setup:cn`
- **FFmpeg**: 正式 Windows 构建固定使用 Gyan FFmpeg 8.1 essentials。`npm run build` 会在缺失时从官方发布页下载到 D 盘构建缓存（可用 `MEDIAFLOW_BUILD_CACHE_DIR` 改写），然后按 `contracts/bundled-tools.json` 校验发布包、可执行文件哈希和版本；已有但不匹配的文件会直接阻止构建。开发环境仍可显式使用系统 PATH。
- **Faster-Whisper CLI**: 可在设置页安装固定版本的 Purfview Windows 独立 CLI 包。安装前会检查空间预算，下载和解压先进入受管暂存区，成功后再切换正式目录；来源、版本和归档 SHA-256 会写入运行时来源记录。
  - 官方仓库: https://github.com/Purfview/whisper-standalone-win
  - Release 页面: https://github.com/Purfview/whisper-standalone-win/releases/tag/Faster-Whisper-XXL
  - Windows 下载直链: https://github.com/Purfview/whisper-standalone-win/releases/download/Faster-Whisper-XXL/Faster-Whisper-XXL_r245.4_windows.7z
- **GPU / CUDA**: 推荐 NVIDIA 显卡以获得最佳转录速度。内置 `faster-whisper` GPU 转录需要 CUDA 12 运行库、cuBLAS for CUDA 12、cuDNN 9 for CUDA 12。
- **安装依赖**: Python 依赖见 `pyproject.toml`，前端依赖见 `frontend/package.json`

### Faster-Whisper-XXL 冷启动

Faster-Whisper-XXL 是独立 CLI 包，每次 CLI 转录都会启动一个新的 `faster-whisper-xxl.exe` 进程。该包目录包含大量 Torch/CUDA/ONNX DLL，冷启动时 Windows 需要加载这些依赖，可能在进程第一行输出前出现几十秒等待。Windows Defender 实时防护可能放大这个等待，但排除 Defender 后仍可能受冷文件缓存、DLL 动态加载、CUDA/Torch 初始化影响。这个等待不属于 MediaFlow 的 CUDA 就绪检查；CLI 自带 CUDA 运行库，内置 `faster-whisper` 的 CUDA DLL 检查不适用于它。

应用会按当前 ASR 配置后台运行一次短音频预热，预热状态只在短时间内有效。超过有效期后再次进入转写相关页面会重新预热；如果正式转写启动时同一模型和设备的预热还在运行，后端会先等待预热完成，避免同时启动两个 XXL 进程争抢同一段冷启动成本。

如果确认 XXL 包来源可信且确实被 Windows Defender 的实时扫描拖慢，可以用管理员 PowerShell 只对实际运行目录加排除。生产版默认路径如下；若设置了 `MEDIAFLOW_RUNTIME_DIR`，请替换为对应目录：

```powershell
Add-MpPreference -ExclusionPath "D:\Tools\MediaFlow\runtime\tools\Faster-Whisper-XXL"
```

查看或删除排除项：

```powershell
(Get-MpPreference).ExclusionPath
Remove-MpPreference -ExclusionPath "D:\Tools\MediaFlow\runtime\tools\Faster-Whisper-XXL"
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

- API Key 保存在运行时根目录下的 `user_data/user_settings.json`
- 在 Windows 上，程序会优先使用 DPAPI 进行本机当前用户级加密
- 如果 DPAPI 不可用，会回退为可读明文保存，以避免用户因加密失败无法继续使用
- 配置文件会显式标记 `api_key_encrypted: true/false`
- 开发模式的 `user_data/` 和 `data/` 已被 `.gitignore` 忽略；生产版用户数据位于仓库之外

### 默认下载目录

- 可在设置页指定“默认下载目录”
- 未设置时，下载任务默认保存到 `workspace/`

### 诊断日志

- 生产模式默认使用 `INFO` 级别，只记录 LLM 请求数量、角色、正文字符数和响应结构等摘要，不记录提示词、字幕或模型响应正文。
- 临时排障时可设置 `ENABLE_DETAILED_LLM_LOGGING=true` 显式开启完整 LLM 请求/响应日志；排障结束后应立即关闭。
- `LOG_LEVEL` 可设置为 `TRACE / DEBUG / INFO / SUCCESS / WARNING / ERROR / CRITICAL`。未显式设置时，普通模式使用 `INFO`，`DEBUG=true` 时使用 `DEBUG`。
- 后端日志写入 `runtime/user_data/logs/mediaflow.log`，Electron 主进程日志写入同目录的 `mediaflow-desktop.log`；两者按 10 MB 轮转并保留 7 天。

### 任务历史

- 默认保留最近 100 条已完成、失败或取消的任务记录；超出数量时后端会记录明确的裁剪日志。
- 可通过 `TASK_HISTORY_LIMIT` 环境变量调整保留数量，最小值为 1。运行中和暂停中的可恢复任务不受历史数量限制。

## 📋 运行与维护真源

- 当前正式能力和明确排除项见 `FEATURE_INVENTORY.md`。
- 任务与桌面桥版本见 `contracts/runtime-contract.json`；改动后必须重新生成并检查前端 API 类型。
- 正式安装包内置工具的来源、版本、哈希和许可证文件见 `contracts/bundled-tools.json`、`THIRD_PARTY_NOTICES.md` 与 `third_party_licenses/`。
- 模型和外部工具的空间预算、复用身份、来源证据与中断处理见 `.project-steward/storage-contract.json`。
- `archive/` 仅保留历史参考，不参与运行、构建或测试；边界见 `archive/README.md`。

## ⭐ Star History

<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://raw.githubusercontent.com/CheshireMew/MediaFlow/star-history/star-history-dark.svg"
  />
  <source
    media="(prefers-color-scheme: light)"
    srcset="https://raw.githubusercontent.com/CheshireMew/MediaFlow/star-history/star-history.svg"
  />
  <img
    alt="GitHub Star History"
    src="https://raw.githubusercontent.com/CheshireMew/MediaFlow/star-history/star-history.svg"
  />
</picture>

## ⚖️ 许可证与第三方资源

MediaFlow 的原创代码与项目文档采用 `AGPL-3.0-or-later`，版权所有 `Copyright (c) 2026 CheshireMew`。完整条款见 [`LICENSE`](LICENSE)，明确的版本选择与免责声明见 [`LICENSE-NOTICE.md`](LICENSE-NOTICE.md)，适用范围、排除项和历史说明见 [`LICENSING.md`](LICENSING.md)。

Windows 安装包复用了下列未修改资源；它们仍由各自的上游许可证约束：

| 资源 | 上游与许可证 | 本项目中的用途与修改 |
| --- | --- | --- |
| FFmpeg 8.1 essentials build（`ffmpeg.exe`、`ffprobe.exe`） | [Gyan Doshi FFmpeg Builds](https://www.gyan.dev/ffmpeg/builds/)，GPL-3.0-only | 用于探测、解码、编码和封装；原样随 Windows 包分发，没有源码或二进制修改。精确版本、源代码提交、归档与二进制哈希见 [`contracts/bundled-tools.json`](contracts/bundled-tools.json)。 |
| LXGW WenKai Regular | [LXGW WenKai](https://github.com/lxgw/LxgwWenKai)，SIL Open Font License 1.1，Copyright 2021-2026 LXGW / Copyright 2020 The Klee Project Authors | 用作界面与字幕字体；原样随包分发，没有修改。 |
| Electron、Chromium、Node.js 与包管理器依赖 | 各组件上游项目及各自许可证 | 构成桌面运行时或应用依赖；版本由锁文件固定，本项目没有改变其许可证。 |

安装包会携带项目许可证、范围说明、[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) 和 `third_party_licenses/` 中的对应文本。运行时按用户操作下载的工具、模型及媒体不被宣称为 MediaFlow 原创内容，其边界也记录在上述第三方通知和 [`LICENSING.md`](LICENSING.md) 中。
