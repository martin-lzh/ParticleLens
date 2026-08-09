import { spawn } from "node:child_process";
import { createRequire } from "node:module";

if (process.env.CI) {
  throw new Error("Recognition baselines must be reviewed and updated outside CI.");
}

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const child = spawn(
  process.execPath,
  [
    playwrightCli,
    "test",
    "tests/e2e/recognition-regression.spec.js",
    "--project=chromium",
  ],
  {
    env: { ...process.env, UPDATE_RECOGNITION_BASELINE: "1" },
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  throw error;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
