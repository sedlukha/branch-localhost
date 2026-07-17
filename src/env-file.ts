import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"

const ASSIGNMENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/

/**
 * Upsert `vars` into the text of an env file.
 *
 * Every other line is kept byte for byte — comments, blank lines, ordering and
 * unrelated vars. A commented-out `# FOO=x` is not an assignment, so it stays
 * and a real `FOO=` is appended instead.
 *
 * Repeated assignments to the same name are all rewritten, not just the first:
 * dotenv lets the last one win, so leaving a duplicate behind would keep the
 * stale value in effect.
 */
export function upsertEnvContent(
  content: string,
  vars: Record<string, string>,
): string {
  const body = content.endsWith("\n") ? content.slice(0, -1) : content
  const lines = body === "" ? [] : body.split("\n")
  const seen = new Set<string>()

  const out = lines.map((line) => {
    const name = ASSIGNMENT.exec(line)?.[1]
    if (name === undefined || !(name in vars)) {
      return line
    }
    seen.add(name)
    return `${name}=${vars[name]}`
  })

  for (const [name, value] of Object.entries(vars)) {
    if (!seen.has(name)) {
      out.push(`${name}=${value}`)
    }
  }

  return out.length === 0 ? "" : `${out.join("\n")}\n`
}

/**
 * Write `vars` into the env file at `path`, creating it when missing.
 *
 * Does nothing when the result is byte-identical, so a dev server restart on
 * the same branch leaves the mtime alone — build tools that hash or watch env
 * files (turbo, Next.js) do not see a change that is not one.
 *
 * Writes via a temp file and rename so a crash mid-write cannot truncate a
 * file that usually holds local secrets.
 */
export function writeEnvFile(path: string, vars: Record<string, string>): void {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : ""
  const next = upsertEnvContent(existing, vars)

  if (next === existing) {
    return
  }

  const tmp = `${path}.branch-localhost.tmp`
  writeFileSync(tmp, next)
  renameSync(tmp, path)
}
