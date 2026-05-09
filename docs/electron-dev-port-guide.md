# Electron Dev 启动边界

## 问题类型

本轮处理的是 dev 模式启动边界问题：后端、Vite renderer、Electron 主进程曾由不同入口分别启动，端口、CORS origin、API 地址和退出清理没有单一 owner。

这类问题的修法不是继续给某个端口或某个窗口加补丁，而是收口到一个真实边界：

> 根目录 `scripts/dev.mjs` 是 dev 模式下 backend、Vite renderer、Electron 的唯一运行期启动 owner。

## 当前链路

运行：

```powershell
node scripts/dev.mjs
```

`scripts/dev.mjs` 负责：

1. 选择 backend 端口。
   - 默认优先使用 `127.0.0.1:8800`。
   - 如果默认端口不可用，自动选择空闲端口。
   - 如果显式设置 `PORT` 或 `MEDIAFLOW_BACKEND_DEV_PORT`，端口不可用时直接失败。
2. 选择 Vite renderer 端口。
   - 默认使用系统分配的空闲端口。
   - 如果显式设置 `MEDIAFLOW_RENDERER_DEV_PORT`，端口不可用时直接失败。
3. 在启动 Vite 前注入：
   - `VITE_API_URL`
   - `VITE_WS_URL`
4. 启动 Vite 后解析真实 renderer origin。
5. 启动 Python backend，并注入：
   - `HOST`
   - `PORT`
   - `MEDIAFLOW_RENDERER_DEV_ORIGIN`
6. 等待 backend `/health` ready。
7. 启动 Electron，并注入：
   - `IS_DEV`
   - `MEDIAFLOW_RENDERER_DEV_URL`
   - `MEDIAFLOW_RENDERER_DEV_ORIGIN`
8. Electron 退出时关闭 backend、Vite、Electron build watch。

## 已删除的旧入口

不要恢复这些分裂入口：

- 根目录后端单独启动脚本
- 根目录前端单独启动脚本
- frontend 包内 `dev`
- frontend 包内 Electron 单独启动脚本
- frontend 下旧 Electron dev 编排脚本
- `start.bat` 同时打开两个独立窗口的逻辑

这些入口会让 dev 模式重新出现多 owner：后端端口、renderer origin、API 地址和进程生命周期再次分散。

## 显式端口

固定 backend 端口：

```powershell
$env:MEDIAFLOW_BACKEND_DEV_PORT = "8800"
node scripts/dev.mjs
```

固定 renderer 端口：

```powershell
$env:MEDIAFLOW_RENDERER_DEV_PORT = "3000"
node scripts/dev.mjs
```

显式端口是严格配置。端口不可用时应失败，而不是静默换端口。

## 排障

仍然看到旧启动入口时，扫描根 package、frontend package 和 frontend scripts，确认没有后端/前端分裂启动命令或旧 Electron dev 编排脚本。

期望结果：没有生产性调用点。

仍然看到固定 API 地址失效：

- 检查启动日志中 `[dev] backend ready at ...`。
- 检查 Vite 是否由 `scripts/dev.mjs` 启动，而不是单独运行 `vite`。
- 检查 Electron 是否由 `node scripts/dev.mjs` 启动，而不是直接运行 frontend 包脚本。

## 回归

修改 dev 启动边界后至少验证：

```powershell
npm run build --prefix frontend
npm run test:frontend
.\.venv\Scripts\python.exe -m py_compile backend\main.py
node scripts/dev.mjs
```
