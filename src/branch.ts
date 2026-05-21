import { execFileSync } from "node:child_process"

/**
 * Sanitize a branch name into a valid DNS label.
 *
 * Lowercases, replaces runs of non-[a-z0-9-] with a single dash, trims
 * leading/trailing dashes, caps at 63 chars (DNS label limit), then re-trims
 * any trailing dashes introduced by truncation.
 */
export function sanitizeBranch(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "")
}

function execGit(argv: string[]): string {
  return execFileSync("git", argv, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim()
}

/**
 * Read the current branch name, falling back to `sha-<short>` when detached.
 * Throws if not inside a git working tree.
 */
export function readGitBranch(): string {
  let raw: string
  try {
    raw = execGit(["rev-parse", "--abbrev-ref", "HEAD"])
  } catch {
    throw new Error("failed to read git branch (not a git repo?)")
  }
  if (raw === "HEAD") {
    try {
      return `sha-${execGit(["rev-parse", "--short", "HEAD"])}`
    } catch {
      return "head"
    }
  }
  return raw
}

export function computeHost(sanitized: string): string {
  return sanitized.length > 0 ? `${sanitized}.localhost` : "localhost"
}
