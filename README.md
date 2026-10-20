# Edge TTS Laboratory

基于 Microsoft Edge TTS（`msedge-tts`）的语音合成实验前端：Vite + React，本地由 Express（`server.ts`）提供 `/api/voices` 与 `/api/synthesize`。

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

音色列表由前端内置的精选目录（`src/data/voices.ts`）提供，因此 Pages **无需后端即可浏览音色**。合成仍依赖 Express / `msedge-tts`：浏览器（Chrome/Firefox）无法设置 Edge TTS 所需的 WebSocket 请求头，不能在页面内直连微软服务；请本地运行 `bun run dev`，或构建时配置 `VITE_API_BASE` 指向可用后端。

### 重要：TTS 合成需要 Node 后端

GitHub Pages **只能托管静态文件**，无法运行 Express / `msedge-tts`。静态页 alone 不能合成语音。

若要把 Pages 前端接到真实 API，请在 **构建时** 设置：

```bash
VITE_API_BASE=https://your-api.example.com bun run build
```

或在 Actions 中配置同名环境变量。留空则请求同源 `/api/...`（适合本地 `tsx server.ts`）；无后端时音色回退到内置精选列表，合成会提示需本地或远程 API。

参见 `.env.example` 中的 `VITE_API_BASE` 说明。仓库中请勿提交密钥。

## 脚本

| 命令 | 说明 |
|------|------|
| `bun run dev` / `start` | 启动 Express + Vite（开发） |
| `bun run build` | 构建静态前端到 `dist/` |
| `bun run preview` | 预览静态构建 |
| `bun run lint` | `tsc --noEmit` |
