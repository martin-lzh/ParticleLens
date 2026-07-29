import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";

const target = process.env.PARTICLELENS_TARGET === "native" ? "native" : "web";
const root = process.cwd();
const outDir = path.join(root, "dist", target);

function particleLensAssets() {
  return {
    name: "particlelens-assets",
    async closeBundle() {
      await mkdir(outDir, { recursive: true });
      await cp(path.join(root, "static", "service-worker.js"), path.join(outDir, "service-worker.js"));
      await writeFile(
        path.join(outDir, "runtime-config.json"),
        `${JSON.stringify({ detector: target === "native" ? "native" : "browser" })}\n`,
      );
      if (target === "web") {
        await cp(path.join(root, ".cache", "pyodide"), path.join(outDir, "runtime"), {
          recursive: true,
        });
        await writeFile(path.join(outDir, "CNAME"), "particlelens.liuzhaohan.com\n");
      }
    },
  };
}

export default defineConfig({
  root: path.join(root, "static"),
  base: "./",
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: true,
  },
  plugins: [particleLensAssets()],
});
