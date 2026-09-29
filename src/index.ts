import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import { computeHost, readGitBranch, sanitizeBranch } from "./branch.js"
import { writeEnvFile } from "./env-file.js"
import { findFreePort, seedPort } from "./port.js"
import { runCommand } from "./run.js"

export { computeHost, readGitBranch, sanitizeBranch } from "./branch.js"
export { upsertEnvContent, writeEnvFile } from "./env-file.js"
export { findFreePort, hash32, isReservedPort, seedPort } from "./port.js"
export { runCommand } from "./run.js"

const DEFAULTS = {
  basePort: 3000,
  range: 1000,
  probeLimit: 50,
}

const HELP = `Usage: branch-localhost [options] [-- <command> [args...]]

Compute a stable per-branch URL like <branch>.localhost:<port>, then run
<command> with the computed env vars set — or print the URL with --show.

Options:
  --base-port <n>            Base port for the range. Default: ${DEFAULTS.basePort}.
  --range <n>                Port range size. Default: ${DEFAULTS.range}.
  --probe-limit <n>          Max probes for a free port. Default: ${DEFAULTS.probeLimit}.

  --env-url <NAME>           Set NAME=http://<host>:<port>. Repeatable.
  --env-url-slash <NAME>     Set NAME=http://<host>:<port>/. Repeatable.
  --env-port <NAME>          Set NAME=<port>. Repeatable.
  --env-host <NAME>          Set NAME=<host>. Repeatable.

  --write-env <path>         Also write the --env-* vars above into the env
                             file at <path> (upsert; other lines and comments
                             are kept). Records the port actually bound, after
                             probing, so another process can read the real URL
                             instead of recomputing it. Skipped by --show.

  --show                     Print the URL to stdout and exit. Skips port
                             probing — gives the deterministic seed port,
                             which is what the dev server uses on a clean
                             start. Implies --quiet.
  --quiet                    Suppress the "Branch URL" stderr line.

  -h, --help                 Show this help.
  -v, --version              Show version.

Always-set env vars (in wrapper mode): DEV_HOST_URL, DEV_HOST_PORT, DEV_HOST_HOST.
These are not written by --write-env — only the names you pass to --env-* are.

Examples:
  branch-localhost --base-port 4000 -- next dev
  branch-localhost --base-port 4000 --env-port PORT -- next dev
  branch-localhost --base-port 4000 --show               # → http://<branch>.localhost:<port>
  open "$(branch-localhost --base-port 4000 --show)"     # open this worktree in browser

  # publish the real URL for e2e tests to read from .env.local
  branch-localhost --base-port 4000 --env-port PORT --env-url BASE_URL \\
    --write-env .env.local -- next dev
`

function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const pkg = JSON.parse(
    readFileSync(join(here, "..", "package.json"), "utf8"),
  ) as { version: string }
  return pkg.version
}

function splitDoubleDash(argv: string[]): {
  args: string[]
  command: string[] | null
} {
  const i = argv.indexOf("--")
  if (i === -1) {
    return { args: argv, command: null }
  }
  return { args: argv.slice(0, i), command: argv.slice(i + 1) }
}

function parseIntStrict(raw: string, flag: string): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${flag} must be a positive integer (got "${raw}")`)
  }
  return n
}

export async function run(): Promise<void> {
  const { args, command } = splitDoubleDash(process.argv.slice(2))

  let parsed
  try {
    parsed = parseArgs({
      args,
      options: {
        "base-port": { type: "string" },
        range: { type: "string" },
        "probe-limit": { type: "string" },
        "env-url": { type: "string", multiple: true },
        "env-url-slash": { type: "string", multiple: true },
        "env-port": { type: "string", multiple: true },
        "env-host": { type: "string", multiple: true },
        "write-env": { type: "string" },
        show: { type: "boolean" },
        quiet: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      strict: true,
    })
  } catch (err) {
    throw new Error(`${(err as Error).message}\n\n${HELP}`)
  }

  if (parsed.values.help) {
    process.stdout.write(HELP)
    return
  }
  if (parsed.values.version) {
    process.stdout.write(`${readVersion()}\n`)
    return
  }

  const basePort = parsed.values["base-port"]
    ? parseIntStrict(parsed.values["base-port"], "--base-port")
    : DEFAULTS.basePort
  const range = parsed.values.range
    ? parseIntStrict(parsed.values.range, "--range")
    : DEFAULTS.range
  const probeLimit = parsed.values["probe-limit"]
    ? parseIntStrict(parsed.values["probe-limit"], "--probe-limit")
    : DEFAULTS.probeLimit

  const sanitized = sanitizeBranch(readGitBranch())
  const host = computeHost(sanitized)
  const start = seedPort(sanitized, basePort, range)
  const showMode = parsed.values.show === true
  const quiet = parsed.values.quiet === true || showMode

  const port = showMode
    ? start
    : await findFreePort({ start, basePort, range, probeLimit })

  const url = `http://${host}:${port}`

  if (!quiet) {
    const cyan = "\x1b[36m"
    const bold = "\x1b[1m"
    const dim = "\x1b[2m"
    const reset = "\x1b[0m"
    process.stderr.write(
      `${dim}- Branch URL:${reset}    ${bold}${cyan}${url}${reset}\n`,
    )
  }

  if (showMode) {
    if (command !== null) {
      process.stderr.write(
        "branch-localhost: --show ignores any command after `--`.\n",
      )
    }
    if (parsed.values["write-env"] !== undefined) {
      process.stderr.write(
        "branch-localhost: --show ignores --write-env; it skips probing, so the\n" +
          "port may not be the one a dev server actually bound.\n",
      )
    }
    process.stdout.write(`${url}\n`)
    return
  }

  if (command === null || command.length === 0) {
    throw new Error(
      "no command provided after `--`; nothing to run.\n" +
        "Use `branch-localhost --help` for usage, or `--show` to just print the URL.",
    )
  }

  const [cmd, ...cmdArgs] = command
  if (cmd === undefined) {
    throw new Error("command after `--` is empty.")
  }

  const declaredEnv: Record<string, string> = {}
  for (const name of parsed.values["env-url"] ?? []) declaredEnv[name] = url
  for (const name of parsed.values["env-url-slash"] ?? [])
    declaredEnv[name] = `${url}/`
  for (const name of parsed.values["env-port"] ?? [])
    declaredEnv[name] = String(port)
  for (const name of parsed.values["env-host"] ?? []) declaredEnv[name] = host

  // Before the spawn on purpose: the child may watch this file (Next.js does),
  // and a write landing after startup would trigger a reload.
  const writeEnvPath = parsed.values["write-env"]
  if (writeEnvPath !== undefined) {
    if (Object.keys(declaredEnv).length === 0) {
      process.stderr.write(
        "branch-localhost: --write-env has nothing to write; name the vars with\n" +
          "--env-url/--env-url-slash/--env-port/--env-host.\n",
      )
    } else {
      writeEnvFile(writeEnvPath, declaredEnv)
    }
  }

  const extraEnv: Record<string, string> = {
    DEV_HOST_URL: url,
    DEV_HOST_PORT: String(port),
    DEV_HOST_HOST: host,
    ...declaredEnv,
  }

  runCommand(cmd, cmdArgs, extraEnv)
}
