// Cross-platform build launcher: also works in Windows terminals.
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const result = spawnSync(process.execPath, [resolve(__dirname, "../node_modules/vite/bin/vite.js"), "build"], {
  cwd: resolve(__dirname, ".."),
  env: { ...process.env, CPANEL_BUILD: "1", VITE_GOOGLE_LOGIN_MODE: process.env.VITE_GOOGLE_LOGIN_MODE || "native" },
  stdio: "inherit",
});
if (result.error) console.error("Não foi possível iniciar a preparação para cPanel.");
process.exit(result.status ?? 1);