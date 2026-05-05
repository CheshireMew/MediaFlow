# Electron Dev 端口修复操作指南

## 背景

本次问题发生在执行 `npm run frontend:dev` / `npm run dev` 时：

```powershell
Error: listen EACCES: permission denied 127.0.0.1:5173
```

原来的 Electron 开发启动链路把 Vite dev server 固定在 `127.0.0.1:5173`，并且同一个端口散落在多个地方：

- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/electron/desktopRuntime.ts`
- `backend/main.py`

这类问题不能只把某一处端口改成别的数字。否则下一次端口被占用、被 Windows 保留，或者不同模块读取到不同端口时，Electron、Vite、后端 CORS 会再次不同步。

## 根因

根因是“Vite renderer dev server 地址”没有单一真实来源。

旧架构中：

- Vite 负责监听端口，但端口固定为 `5173`。
- Electron 主进程也硬编码加载 `http://127.0.0.1:5173`。
- 启动脚本里的 `wait-on` 也硬编码等待 `http://127.0.0.1:5173/index.html`。
- 后端 CORS 也硬编码允许 `5173`。

因此只要 `5173` 无法监听，整个 Electron dev 启动都会失败。

## 本次修法

新的边界是：

> `frontend/scripts/electron-dev.mjs` 是 Electron dev 启动时 renderer dev server 地址的唯一运行期来源。

它负责：

1. 启动 Electron 主进程构建 watch。
2. 等待 `dist-electron/.dev-build-ready`。
3. 用 Node `net.listen(0)` 让系统分配真实可用端口。
4. 用这个端口启动 Vite，且 `strictPort: true`。
5. 把实际 renderer origin 注入环境变量：
   - `MEDIAFLOW_RENDERER_DEV_URL`
   - `MEDIAFLOW_RENDERER_DEV_ORIGIN`
6. 再启动 Electron。

Electron 和后端不再猜端口：

- Electron dev 模式只读取 `MEDIAFLOW_RENDERER_DEV_URL`。
- 后端 CORS 只读取 `MEDIAFLOW_RENDERER_DEV_ORIGIN`。

## 修改过的文件

- `frontend/scripts/electron-dev.mjs`
  - 新增开发启动编排脚本。
  - 统一处理 Vite 端口选择、Electron 启动、进程退出清理。

- `frontend/package.json`
  - `electron:dev` 改为：

    ```json
    "electron:dev": "node ./scripts/electron-dev.mjs"
    ```

  - 移除旧启动链路依赖：
    - `concurrently`
    - `cross-env`
    - `wait-on`

- `frontend/package-lock.json`
  - 同步移除上述旧依赖。

- `frontend/vite.config.ts`
  - 不再默认固定 `5173`。
  - 仅当显式设置 `MEDIAFLOW_RENDERER_DEV_PORT` 时使用指定端口。

- `frontend/electron/desktopRuntime.ts`
  - 删除硬编码 `DESKTOP_DEV_SERVER_URL`。
  - dev 模式必须读取 `MEDIAFLOW_RENDERER_DEV_URL`。

- `backend/main.py`
  - 删除硬编码 `http://127.0.0.1:5173` 和 `http://localhost:5173`。
  - CORS 从 `MEDIAFLOW_RENDERER_DEV_ORIGIN` 读取当前 renderer origin。

## 操作步骤

### 1. 确认旧硬编码已经清理

```powershell
rg -n "5173|concurrently|wait-on|cross-env|DESKTOP_DEV_SERVER_URL" frontend backend -S
```

期望结果：没有匹配项。

### 2. 更新 lockfile

修改 `frontend/package.json` 后执行：

```powershell
cd D:\Code\MediaFlow\frontend
npm install --package-lock-only
```

这一步只更新 `package-lock.json`，不会重新安装依赖目录。

### 3. 验证 Electron 主进程 TypeScript

```powershell
cd D:\Code\MediaFlow\frontend
npm run electron:build
```

### 4. 验证 Vite 可以使用动态端口

可以用一次性脚本确认端口不再固定：

```powershell
cd D:\Code\MediaFlow\frontend
node --input-type=module -e "import net from 'node:net'; import { createServer } from 'vite'; const port = await new Promise((resolve, reject) => { const s = net.createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => resolve(a.port)); }); }); const server = await createServer({ configFile: './vite.config.ts', server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'silent' }); await server.listen(); console.log(server.resolvedUrls.local[0]); await server.close();"
```

期望输出类似：

```text
http://127.0.0.1:11387/
```

重点是端口不是固定 `5173`。

### 5. 验证后端语法

```powershell
cd D:\Code\MediaFlow
.\.venv\Scripts\python.exe -m py_compile backend\main.py
```

### 6. 验证前端测试

```powershell
cd D:\Code\MediaFlow\frontend
npm test
```

本次验证结果是：

```text
49 test files passed
221 tests passed
```

### 7. 验证生产 renderer build

```powershell
cd D:\Code\MediaFlow\frontend
npx vite build
```

### 8. 验证真实 Electron dev 入口

正常启动：

```powershell
cd D:\Code\MediaFlow
npm run dev
```

或：

```powershell
npm run frontend:dev
```

启动日志里应该看到类似：

```text
[electron-dev-build] ready in 17.72 ms
[electron-dev-build] watching for changes...
Local: http://127.0.0.1:11401/
Starting desktop worker: D:\Code\MediaFlow\.venv\Scripts\python.exe -m backend.desktop_worker
[DesktopWorker:control] ready
```

端口会随系统分配变化。

## 遇到的坑

### 1. `port: 0` 不能直接交给 Vite 配置当作最终方案

初版尝试把 Vite server 配成：

```ts
server: {
  port: 0,
  strictPort: false,
}
```

但实测 Vite 仍可能回到默认端口路径，也就是 `5173`。

最终方案是先用 Node `net.listen(0)` 获取系统实际分配的空闲端口，再把这个明确端口交给 Vite，并设置 `strictPort: true`。

### 2. 不能只改 `vite.config.ts`

只改 Vite 监听端口不够，因为 Electron 和后端 CORS 也需要知道真实端口。

如果 Vite 动态端口变了，但 Electron 仍加载旧 URL，会出现白屏或加载失败。

如果后端 CORS 仍允许旧端口，会出现 API 请求被浏览器拦截。

### 3. 不能保留旧兼容层

旧架构里有多个端口来源：

- 启动脚本硬编码
- Vite 配置硬编码
- Electron runtime 硬编码
- 后端 CORS 硬编码

本次修复一次性迁移所有调用点，避免留下“有的地方读环境变量，有的地方继续读旧常量”的半迁移状态。

### 4. 后端 worker 的环境变量来自 Electron

后端桌面 worker 不是由根目录 `npm run backend:dev` 启动的独立服务，而是 Electron 通过 `DesktopWorkerSupervisor` 拉起的 Python 子进程。

因此 `MEDIAFLOW_RENDERER_DEV_ORIGIN` 需要从 Electron dev 编排脚本注入给 Electron，再由 Electron 启动 worker 时继承给 Python 进程。

### 5. `package-lock.json` 会有较大 diff

删除 `concurrently`、`cross-env`、`wait-on` 后，它们的传递依赖也会从 lockfile 中移除，所以 `package-lock.json` diff 比 `package.json` 大是正常的。

### 6. Windows 上 `EACCES` 不一定是普通占用

`listen EACCES` 可能来自：

- 端口被系统保留。
- 端口被安全软件或策略限制。
- 端口被某个进程占用但表现为权限错误。

对本地桌面应用来说，不需要把重点放在安全限制绕过上。更稳妥的修法是不要依赖固定端口。

## 注意点

### 显式指定端口

如果确实需要固定端口调试，可以设置：

```powershell
$env:MEDIAFLOW_RENDERER_DEV_PORT = "3000"
npm run frontend:dev
```

指定端口时脚本会用 `strictPort: true`。如果端口不可用，启动会失败，这符合“显式配置必须准确”的预期。

### 显式指定 host

默认 host 是：

```text
127.0.0.1
```

如果需要改 host：

```powershell
$env:MEDIAFLOW_RENDERER_DEV_HOST = "127.0.0.1"
npm run frontend:dev
```

不建议随意改成 `0.0.0.0`，除非明确需要局域网访问。

### Electron dev 模式必须有 renderer URL

`frontend/electron/desktopRuntime.ts` 在 dev 模式下要求：

```text
MEDIAFLOW_RENDERER_DEV_URL
```

缺少该变量会直接报错。这是故意的，目的是阻止旧硬编码 URL 悄悄复活。

### 后端 CORS 只接受合法 origin

`backend/main.py` 会校验 `MEDIAFLOW_RENDERER_DEV_ORIGIN`：

- scheme 必须是 `http` 或 `https`
- 必须有 host
- 会去掉 path，只保留 origin

示例：

```text
http://127.0.0.1:11401/index.html
```

最终会规范化为：

```text
http://127.0.0.1:11401
```

### 不要恢复这些旧依赖

当前 Electron dev 启动不再需要：

- `concurrently`
- `cross-env`
- `wait-on`

如果未来又要引入并行启动工具，需要先确认是否真的解决了新的架构问题，而不是把端口来源重新拆散。

## 快速排障

### 仍然看到 `5173`

执行：

```powershell
rg -n "5173" frontend backend -S
```

如果还有结果，说明有人重新引入了固定端口。

### Electron 白屏

检查启动日志中 Vite 输出的 URL，再确认 Electron 环境变量：

```text
MEDIAFLOW_RENDERER_DEV_URL
```

应当等于 Vite 实际输出的 origin。

### API 被 CORS 拦截

确认 Python worker 继承了：

```text
MEDIAFLOW_RENDERER_DEV_ORIGIN
```

它应当等于 renderer origin，例如：

```text
http://127.0.0.1:11401
```

### 启动后有残留进程

新的 `electron-dev.mjs` 会在 Electron 退出时关闭 Vite 和 Electron build watch。

如果手动强杀父进程后仍有残留，可以检查：

```powershell
Get-Process | Where-Object { $_.ProcessName -match "electron|node|python" }
```

确认后再按需结束对应进程。

## 回归清单

修改 Electron dev 启动链路后，至少跑：

```powershell
cd D:\Code\MediaFlow\frontend
npm run electron:build
npm test
npx vite build
```

以及：

```powershell
cd D:\Code\MediaFlow
.\.venv\Scripts\python.exe -m py_compile backend\main.py
npm run dev
```

验收标准：

- 不再出现 `listen EACCES 127.0.0.1:5173`。
- 启动日志显示 Vite 使用动态端口。
- Electron 窗口可以加载前端。
- Desktop worker 可以 ready。
- 前端 API 请求不被 CORS 拦截。
