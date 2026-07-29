import path from "node:path";
import { build } from "vite";

const target = process.argv[2];
if (!["web", "native"].includes(target)) {
  throw new Error("Usage: node scripts/build_frontend.mjs <web|native>");
}

process.env.PARTICLELENS_TARGET = target;
await build({ configFile: path.resolve("vite.config.js") });
