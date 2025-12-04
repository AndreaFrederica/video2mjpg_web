import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { quasar, transformAssetUrls } from "@quasar/vite-plugin";
import { fileURLToPath, URL } from "node:url";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// 构建完成后复制 Cloudflare Pages 配置文件
const copyCloudflareConfig = () => ({
  name: 'copy-cloudflare-config',
  apply: 'build' as const,
  closeBundle() {
    const files = ['_headers', '_redirects'];
    const outDir = 'dist';
    
    files.forEach(file => {
      const src = join(process.cwd(), file);
      const dest = join(process.cwd(), outDir, file);
      
      if (existsSync(src)) {
        copyFileSync(src, dest);
        console.log(`✓ 已复制 ${file} 到 ${outDir}/`);
      } else {
        console.warn(`⚠ 未找到 ${file}`);
      }
    });
  }
});

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      src: fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    quasar({
      sassVariables: "src/quasar-variables.sass",
    }),
    copyCloudflareConfig(),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // 确保生成的文件包含正确的 MIME 类型
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  },
});