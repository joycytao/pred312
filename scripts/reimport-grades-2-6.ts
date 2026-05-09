import { spawnSync } from "node:child_process";

const GRADES = [2, 3, 4, 5, 6] as const;

for (const grade of GRADES) {
  runCommand("pnpm", ["reset:prepdog-content", "--grade", String(grade)]);
  runCommand("pnpm", ["import:prepdog", "--grade", String(grade)]);
}

function runCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}