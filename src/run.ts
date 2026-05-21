import { spawn, type SpawnOptions } from "node:child_process"

/**
 * Spawn a child command with inherited stdio and the given env vars merged
 * into process.env. Forwards SIGINT/SIGTERM/SIGHUP, and exits the parent
 * with the child's exit code (or re-raises its terminating signal).
 *
 * Returns once listeners are registered; the parent stays alive on the
 * event loop until the child exits.
 */
export function runCommand(
  cmd: string,
  cmdArgs: string[],
  extraEnv: Record<string, string>,
): void {
  const spawnOptions: SpawnOptions = {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
  }
  const child = spawn(cmd, cmdArgs, spawnOptions)

  const forward = (sig: NodeJS.Signals) => {
    if (!child.killed) {
      child.kill(sig)
    }
  }
  process.on("SIGINT", () => forward("SIGINT"))
  process.on("SIGTERM", () => forward("SIGTERM"))
  process.on("SIGHUP", () => forward("SIGHUP"))

  child.on("error", (err) => {
    process.stderr.write(
      `branch-localhost: failed to spawn "${cmd}": ${err.message}\n`,
    )
    process.exit(1)
  })
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
    } else {
      process.exit(code ?? 0)
    }
  })
}
