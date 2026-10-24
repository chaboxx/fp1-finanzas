import {
  mkdirSync,
  copyFileSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { format } from "prettier";
const target = resolve("src/app/auth/revision/page.tsx");
if (existsSync(target))
  throw new Error("Ya existe una página de revisión; no se sobrescribirá.");
mkdirSync(dirname(target), { recursive: true });
copyFileSync("tests/fixtures/review-page.tsx", target);
const baseURL = "http://localhost:3100";
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-p", "3100"],
  {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, FINANZAS_REVIEW: "1" },
  },
);
let result = 1;
try {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (server && server.exitCode !== null)
      throw new Error("El servidor de revisión se detuvo.");
    try {
      if ((await fetch(baseURL + "/login")).ok) break;
    } catch {}
    if (attempt === 89) throw new Error("El servidor no respondió.");
    await new Promise((r) => setTimeout(r, 500));
  }
  result = await new Promise((resolveCode) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        ...process.argv.slice(2),
      ],
      {
        stdio: "inherit",
        windowsHide: true,
        env: { ...process.env, FINANZAS_REVIEW_URL: baseURL },
      },
    );
    child.on("exit", (code) => resolveCode(code ?? 1));
  });
} finally {
  if (server && process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else if (server) server.kill("SIGTERM");
  rmSync(target, { force: true });
  const reviewDir = resolve(".next-review");
  if (dirname(reviewDir) === resolve(".") && reviewDir.endsWith(".next-review"))
    rmSync(reviewDir, { recursive: true, force: true });
  const config = JSON.parse(readFileSync("tsconfig.json", "utf8"));
  config.include = config.include.filter((p) => !p.startsWith(".next-review/"));
  writeFileSync(
    "tsconfig.json",
    await format(JSON.stringify(config), { parser: "json" }),
  );
}
process.exitCode = result;
