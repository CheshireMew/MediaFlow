# MediaFlow 桌面前端

本目录包含 MediaFlow 的 Electron 主进程、preload 桥、React 渲染进程、前端测试和 Windows 桌面构建配置。项目应从仓库根目录统一启动；开发模式使用 `node scripts/dev.mjs`，不要单独启动一个没有后端运行合同的 Vite 页面。

## 目录边界

- `electron/`：桌面主进程、后端子进程、IPC 与工作区持久化。
- `src/`：React 页面、组件、领域服务、任务状态和生成的 API 类型。
- `e2e/`：浏览器端交互与视觉回归；后端由路由模拟，但协议版本必须与正式合同一致。
- `scripts/`：未压缩 Electron 产物检查与生产桌面启动烟测。
- `electron-builder.yml`：正式 Windows 构建输入。
- `electron-builder.smoke.yml`：CI 使用的未压缩生产桌面验收输入。

## 验证命令

```powershell
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build:app
```

`npm run build:smoke` 需要仓库根目录已经存在由 `scripts/build_desktop_backend.py` 生成的 `dist-desktop-backend/mediaflow-backend`。它会生成未压缩的 Windows Electron 产物，检查真实后端资源，启动桌面应用，并验证 preload 暴露的后端状态为 `ready`。该命令属于 CI/发布验收，不是日常开发启动入口。

任务协议和桌面桥版本以 `../contracts/runtime-contract.json` 为准。`src/types/generatedApi.ts` 是生成文件，不应手工修改；合同或后端模型改变后，在仓库根目录运行 `scripts/generate_frontend_api_types.py` 重新生成并执行 `--check`。
