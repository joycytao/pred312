import { rename } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const workspaceRoot = process.cwd();
const apiDir = path.join(workspaceRoot, "apps", "web", "app", "api");
const apiBackupDir = path.join(workspaceRoot, "apps", "web", ".api.static-backup");

async function moveApiRoutesOutOfTheWay() {
  await rename(apiDir, apiBackupDir);
}

async function restoreApiRoutes() {
  await rename(apiBackupDir, apiDir);
}

function runStaticBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["--filter", "web", "build:firebase-static"], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        NEXT_PUBLIC_STATIC_FIREBASE_HOSTING: "1",
        STATIC_FIREBASE_HOSTING: "1",
      },
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`Static Firebase build failed with exit code ${code ?? "unknown"}.`));
    });
    child.on("error", reject);
  });
}

try {
  await moveApiRoutesOutOfTheWay();
  await runStaticBuild();
} finally {
  await restoreApiRoutes();
}