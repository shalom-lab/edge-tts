# Edge TTS Laboratory

基于 Microsoft Edge TTS 的语音合成实验前端：Vite + React。本地由 Express（`server.ts`）提供 `/api/voices` 与 `/api/synthesize`；GitHub Pages 可接 Cloudflare Worker 作为同款 API。

## 本地开发（全栈同域）

```bash
bun install
bun run dev
```

浏览器访问本地地址即可。前端请求 `/api/...`，与 Express 同域，无需设置 `VITE_API_BASE`。

也可用：`bun run build` 后 `bun run start`。

## GitHub Pages

静态站点地址：

**https://shalom-lab.github.io/edge-tts/**

CI 在构建时设置 `BASE_PATH=/edge-tts/`，使资源路径适配项目 Pages。

音色列表由前端内置的精选目录（`src/data/voices.ts`）提供，因此 Pages **无需后端即可浏览音色**。合成仍依赖后端（Express 或 Cloudflare Worker）：浏览器无法设置 Edge TTS 所需的 WebSocket 请求头，不能在页面内直连微软服务。

合成历史保存在浏览器 **IndexedDB**（含音频 Blob，约最近 30 条）；收藏仍用 `localStorage`。

### 配置远程 API（可选）

构建时设置：

```bash
VITE_API_BASE=https://your-api.example.com bun run build
```

或在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 中新增变量 `VITE_API_BASE`（也可用同名 Secret），再重新跑 Pages 工作流。留空则请求同源 `/api/...`（适合本地 `tsx server.ts`）。

参见 `.env.example`。仓库中请勿提交密钥。

## Cloudflare Worker / Pages 是什么

| 产品 | 类比 | 作用（本项目） |
|------|------|----------------|
| **GitHub Pages** | 静态网站托管 | 我们实际用的前端托管：`https://shalom-lab.github.io/edge-tts/` |
| **Cloudflare Pages** | 也是静态站托管（类似 GitHub Pages） | **本仓库未使用**；概念上和 GitHub Pages 一类 |
| **Cloudflare Workers** | **云函数 / Serverless**（不是常开的云服务器） | 请求到来才跑一小段 JS：把 `/api/voices`、`/api/synthesize` 转给微软 Edge TTS 再返回 |

和买 VPS 的区别：VPS 是一台一直开着的机器；Worker 是按次执行、按请求计费/计额度，适合这种轻量 API。

当前线上 Worker：`https://edge-tts-api.shalom-lab.workers.dev`  
**访问限制**：`/api/voices` 与 `/api/synthesize` **只允许**浏览器 Origin：

- `https://shalom-lab.github.io`（本站 Pages）

其它网站、**包括别人的 localhost**、以及无 Origin 的脚本直调都会 **403**。`GET /health` 不做 Origin 校验（运维探测用）。

本地开发请用 Express（`bun run dev`，同域 `/api`）或 `bun run worker:dev` 打本地 Worker，不要依赖线上 Worker 放行 localhost。

## Cloudflare Worker

仓库内 `worker/` 是与前端契约一致的 TTS 后端，跑在 Cloudflare **Workers 免费套餐**上：

| 路由 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /api/voices` | 返回精选音色 JSON（`{ success, voices }`） |
| `POST /api/synthesize` | JSON body → 原始音频（`audio/mpeg`），含 `X-Synthesis-Duration-Ms` |

Worker 用 `fetch` + `Upgrade: websocket` 连接 `api.msedgeservices.com`（Sec-MS-GEC v2），**不**使用 Node `ws` 包。

### 部署步骤

1. 登录 Cloudflare（只需一次）：

```bash
bunx wrangler login
```

2. 从仓库根目录部署：

```bash
bun run worker:deploy
```

或：

```bash
cd worker && bun install && bunx wrangler deploy
```

3. 记下输出的 `*.workers.dev` URL（形如 `https://edge-tts-api.<subdomain>.workers.dev`）。

4. 在 GitHub 仓库设置 Actions 变量 **`VITE_API_BASE`** 为该 URL（不要末尾斜杠）。

5. 重新运行 **Deploy GitHub Pages** workflow（push 到 `main` 或 `workflow_dispatch`），使静态站带上新的 API 地址。

本地调试 Worker：

```bash
bun run worker:dev
```

然后将 `VITE_API_BASE=http://127.0.0.1:8787` 用于前端，或直接 `curl` Worker 路由。

> 本仓库 CI **不会**自动部署 Worker；登录与 `wrangler deploy` 由维护者在本地完成。Worker 内无密钥可提交。
>
> **滥用防护（已启用）**
> - `POST /api/synthesize`：按客户端 IP 约 **50 次 / 60 秒**（Cloudflare Rate Limiting，按机房计数）
> - `/api/voices` 与 `/api/synthesize`：仅允许本站 Origin `https://shalom-lab.github.io`（**不含** localhost）；其它站或无 Origin 返回 403
> - 免费套餐仍有约 **10 万请求/天** 上限；到顶后接口当天不可用，一般不产生额外扣费


## 脚本

| 命令 | 说明 |
|------|------|
| `bun run dev` / `start` | 启动 Express + Vite（开发） |
| `bun run build` | 构建静态前端到 `dist/` |
| `bun run preview` | 预览静态构建 |
| `bun run lint` | `tsc --noEmit` |
| `bun run worker:dev` | 本地跑 Cloudflare Worker |
| `bun run worker:deploy` | 部署 Worker 到 Cloudflare |
