# MediaFlow 功能清单

本文件只记录当前产品真实可用的能力、正式入口和代码归属。归档原型、已移除功能和开发设想不能出现在“已支持”范围内。

## 当前产品能力

| 能力 | 状态 | 正式入口 | 主要实现 |
| --- | --- | --- | --- |
| 桌面启动与后端运行时 | 已支持 | Electron 主进程与 `GET /health` | `frontend/electron/main.ts`、`frontend/electron/backend/backendProcess.ts`、`backend/runtime/backend_bootstrap.py` |
| 视频与音频下载 | 已支持 | 下载器页面、`POST /api/v1/pipeline/run` | `frontend/src/pages/DownloaderPage.tsx`、`backend/services/downloader/` |
| 视频/音频转写 | 已支持 | 转写页、流水线 `transcribe` 步骤 | `frontend/src/pages/TranscriberPage.tsx`、`backend/application/pipeline_steps/transcribe.py` |
| 内置 ASR 与 Faster-Whisper CLI | 已支持 | 设置页选择执行引擎 | `backend/services/asr/`、`backend/application/settings_service.py` |
| 字幕翻译与术语表 | 已支持 | 翻译页、流水线 `translate` 步骤 | `frontend/src/pages/TranslatorPage.tsx`、`backend/application/pipeline_steps/translate.py`、`backend/api/v1/glossary.py` |
| 字幕烧录、水印、裁剪与画面导出 | 已支持 | 合成页与编辑器导出 | `frontend/src/pages/SynthesisPage.tsx`、`backend/application/pipeline_steps/synthesize.py` |
| 时间线编辑、波形与片段导出 | 已支持 | 编辑器页面 | `frontend/src/pages/EditorPage.tsx`、`backend/application/clip_export_service.py`、`backend/application/waveform_service.py` |
| 后台任务、队列、暂停与恢复 | 已支持 | 任务中心、HTTP/WebSocket 任务接口 | `backend/services/task_manager.py`、`backend/core/pipeline.py`、`frontend/src/context/TaskProvider.tsx` |
| 自动执行流水线 | 已支持 | 设置中的自动执行开关 | `frontend/src/services/domain/executionService.ts`；音频只执行转写和翻译，视频才继续合成 |
| 工作区与界面状态恢复 | 已支持 | 桌面工作区状态桥 | `frontend/src/services/persistence/workspaceState.ts`、`frontend/electron/ipc/workspace-state-handlers.ts` |
| 可写运行时工具与模型 | 已支持 | 设置页工具安装、ASR 首次使用 | `backend/services/storage_policy.py`、`backend/application/settings_service.py`、`backend/services/asr/model_manager.py` |
| 多语言界面 | 已支持 | 设置页语言选择 | `frontend/src/i18n/locales/zh/`、`en/`、`ja/` |

## 运行合同

- 任务线协议由 `contracts/runtime-contract.json` 管理；任务记录、前端生成类型和消息目录必须同步更新。
- 桌面桥协议也由同一合同管理；缺少要求能力时启动必须明确失败，不能静默降级。
- 受管模型和工具写入由 `.project-steward/storage-contract.json` 约束；未知峰值、越界路径、超预算和未授权清理都会被阻止。
- 任务 WebSocket 只传实时摘要，完整请求和结果通过任务 HTTP 接口按需读取。
- Windows 正式包内的 FFmpeg 由 `contracts/bundled-tools.json` 固定来源、版本和哈希；构建前必须完成来源准备与二进制校验，安装包必须携带第三方声明和许可证文件。

## 明确不属于当前产品的能力

- OCR、遮挡清理、AI 超分辨率和预处理工作台已经移除，不是隐藏功能或可选后端。
- ProPainter、旧 Pillow 字幕渲染器、旧任务运行器及调试探针仅保留在 `archive/`，不参与运行、构建和测试。
- MediaFlow 不是通用文件管理器，也不提供 Git 工作区管理、内置 Agent 或聊天入口。

归档总边界和各组原因见 `archive/README.md` 及对应子目录说明。
