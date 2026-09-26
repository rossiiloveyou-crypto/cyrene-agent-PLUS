import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

/**
 * Inject the app version (read from package.json) into any HTML that
 * contains the placeholder `<span data-app-version></span>`.
 *
 * Replaces the placeholder with `昔涟 v<version>`, matching the existing
 * display format. Keeping the prefix in the plugin (rather than the HTML)
 * means the version is the only thing that ever changes.
 */
function appVersionPlugin(): Plugin {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, "package.json"), "utf8"),
  ) as { version: string };
  const versionText = `昔涟 v${pkg.version}`;
  return {
    name: "cyrene-app-version",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(
          /<span data-app-version><\/span>/g,
          `<span data-app-version>${versionText}</span>`,
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), appVersionPlugin()],
  root: resolve(__dirname, "src/renderer"),
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        renderer: resolve(__dirname, "src/renderer/index.html"),
        sidebar: resolve(__dirname, "src/renderer/sidebar/index.html"),
        tasks: resolve(__dirname, "src/renderer/tasks/index.html"),
        settings: resolve(__dirname, "src/renderer/settings/index.html"),
        stickers: resolve(__dirname, "src/renderer/sticker-manager/index.html"),
        call: resolve(__dirname, "src/renderer/call/index.html"),
        "chat-react": resolve(__dirname, "src/renderer/react/index.html"),
        music: resolve(__dirname, "src/renderer/music/index.html"),
        toast: resolve(__dirname, "src/renderer/toast/index.html"),
      },
    },
  },
  server: {
    // 必须显式绑 IPv4 回环：本机 Node 解析 localhost 时优先返回 ::1，Vite 默认只监听
    // [::1]:5173；而 Electron 主进程里 12 处 URL 写的是 http://localhost:5173，
    // Chromium 走 127.0.0.1 → 无人监听 → ERR_CONNECTION_REFUSED (-102) 启动失败。
    host: "127.0.0.1",
    port: 5173,
    // 主进程端口是硬编码的：5173 被占时必须立刻报错，不能静默改到 5174
    strictPort: true,
  },
});
