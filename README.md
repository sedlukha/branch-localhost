# branch-localhost

[![CI](https://github.com/sedlukha/branch-localhost/actions/workflows/ci.yml/badge.svg)](https://github.com/sedlukha/branch-localhost/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/branch-localhost.svg)](https://www.npmjs.com/package/branch-localhost)
[![npm downloads](https://img.shields.io/npm/dm/branch-localhost.svg)](https://www.npmjs.com/package/branch-localhost)
[![license](https://img.shields.io/npm/l/branch-localhost.svg)](LICENSE)

Run your local dev server at a **stable, per-git-branch URL** like `my-feature.localhost:4123`. Deterministic port per branch, free-port probing, env injection — one command, no config files, no global state.

```bash
branch-localhost --base-port 4000 -- next dev
# - Branch URL:    http://my-feature.localhost:4123
# (next dev runs with PORT=4123 and DEV_HOST_URL/DEV_HOST_HOST set)
```

## Why?

- **Stable URL per branch.** Same branch → same port, every time. No more
  "which tab was the auth feature on?".
- **Isolated cookies & storage.** `*.localhost` is a separate origin in
  modern browsers — branches don't stomp each other's session.
- **No collisions across branches/apps.** Different branches in the same app
  get different ports (hash of branch). Different apps get disjoint ranges
  (each picks its own `--base-port`).
- **Free-port aware.** If the seeded port is busy, probes the next ones in
  the range.
- **Works great with git worktrees.** Each worktree is on its own branch,
  so each gets its own deterministic URL — run several dev servers in
  parallel with zero coordination. See [Git worktree workflow](#git-worktree-workflow).

## Installation

```bash
npm install -D branch-localhost
# or pnpm add -D branch-localhost / yarn add -D branch-localhost
```

Requires Node 18+ and a git working tree (uses `git rev-parse --abbrev-ref HEAD`).

## Usage

```bash
branch-localhost [options] [-- <command> [args...]]
```

The bit after `--` is the command to spawn. It inherits stdio and receives
the computed env vars. Exit code and signals are forwarded.

## CLI

| Option | Type | Required | Default | Description |
| ------ | ---- | -------- | ------- | ----------- |
| `--base-port <n>` | `number` | no | `3000` | First port of the range |
| `--range <n>` | `number` | no | `1000` | Range size (ports `[base, base+range)`) |
| `--probe-limit <n>` | `number` | no | `50` | Max attempts to find a free port |
| `--env-url <NAME>` | `string` | no | — | Set `NAME=http://<host>:<port>`. Repeatable. |
| `--env-url-slash <NAME>` | `string` | no | — | Set `NAME=http://<host>:<port>/`. Repeatable. |
| `--env-port <NAME>` | `string` | no | — | Set `NAME=<port>`. Repeatable. |
| `--env-host <NAME>` | `string` | no | — | Set `NAME=<host>`. Repeatable. |
| `--write-env <path>` | `string` | no | — | Also write the `--env-*` vars into the env file at `<path>` (upsert). |
| `--show` | `boolean` | no | `false` | Print URL to stdout and exit. Skips port probing. Implies `--quiet`. |
| `--quiet` | `boolean` | no | `false` | Suppress the "Branch URL" stderr line. |
| `-h`, `--help` | `boolean` | no | — | Show help |
| `-v`, `--version` | `boolean` | no | — | Show version |

Always-set env vars (wrapper mode): `DEV_HOST_URL`, `DEV_HOST_PORT`, `DEV_HOST_HOST`.
These are not written by `--write-env` — only the names you pass to `--env-*` are.

### Examples

Next.js — Next reads `PORT`, so just point it there:

```json
{
  "scripts": {
    "dev": "branch-localhost --base-port 4000 --env-port PORT -- next dev"
  }
}
```

Next.js with public site URL injection:

```json
{
  "scripts": {
    "dev": "branch-localhost --base-port 4000 --env-port PORT --env-url-slash NEXT_PUBLIC_SITE_URL --env-url BASE_URL -- next dev"
  }
}
```

Vite — Vite reads `PORT` too, or pass via `--port`:

```bash
branch-localhost --base-port 5173 --env-port PORT -- vite
```

Monorepo with two apps on disjoint ranges:

```json
// apps/web/package.json
{ "scripts": { "dev": "branch-localhost --base-port 4000 --env-port PORT -- next dev" } }

// apps/admin/package.json
{ "scripts": { "dev": "branch-localhost --base-port 5000 --env-port PORT -- next dev" } }
```

Print the URL without running anything:

```bash
branch-localhost --base-port 4000 --show
# → http://my-feature.localhost:4123

open "$(branch-localhost --base-port 4000 --show)"   # open it in the browser
```

## Sharing the URL with another process (`--write-env`)

`--show` recomputes the URL from the branch name. That is fine to open a tab,
but it returns the **seed** port without probing. If the seed was taken when
the dev server started, the server moved on and `--show` now points at the
wrong port — quietly.

So do not guess the port from a second process. Have the dev server record the
one it actually bound:

```json
{
  "scripts": {
    "dev": "branch-localhost --base-port 4000 --env-port PORT --env-url BASE_URL --write-env .env.local -- next dev"
  }
}
```

`.env.local` then holds the real values, written before the child starts:

```bash
BASE_URL=http://my-feature.localhost:4123
PORT=4123
```

Anything that already reads env files — Playwright, a test runner, a script —
picks the URL up with no extra wiring:

```ts
// playwright.config.ts — no port maths, no git, no guessing
export default defineConfig({ use: { baseURL: process.env.BASE_URL } })
```

Notes:

- Only the names you passed to `--env-*` are written. `DEV_HOST_*` are not.
- Other lines are kept: comments, blank lines, ordering, unrelated vars. A
  commented-out `# FOO=x` is left alone and a real `FOO=` is appended.
- An unchanged result does not touch the file, so restarting on the same branch
  will not bust a build cache that hashes `.env*` or trip a file watcher.
- The write happens before the child spawns, so a watcher (Next.js) does not
  reload on it.
- `--show` ignores `--write-env` and says so: it does not probe, so it has no
  real port to record.
- Add the target to `.gitignore` — it holds machine-local values.

## Git worktree workflow

This is where the tool shines. With [git worktrees](https://git-scm.com/docs/git-worktree),
each checkout lives in its own directory on its own branch. Spin up a few
in parallel and each gets a unique, stable URL — no port collisions, no
"which terminal had which feature?".

```bash
# Layout:
#   ~/proj/main         (master)
#   ~/proj/auth         (worktree, branch: feat/auth)
#   ~/proj/checkout     (worktree, branch: feat/checkout)

cd ~/proj/auth      && pnpm dev   # → http://feat-auth.localhost:4291
cd ~/proj/checkout  && pnpm dev   # → http://feat-checkout.localhost:4807
cd ~/proj/main      && pnpm dev   # → http://master.localhost:4145
```

All three run side-by-side. Cookies and localStorage are isolated per
subdomain. The port is the same every time you start that worktree.

To grab a URL from a script (e.g., to open in browser or paste in Slack). This
is the seed port — if a process needs the port the server really bound, use
[`--write-env`](#sharing-the-url-with-another-process---write-env) instead:

```bash
# from inside any worktree:
branch-localhost --base-port 4000 --show
```

To open every running worktree at once (Bash):

```bash
for wt in $(git worktree list --porcelain | awk '/^worktree /{print $2}'); do
  open "$(cd "$wt" && branch-localhost --base-port 4000 --show)"
done
```

Detached HEAD (e.g. `git checkout <sha>`) falls back to `sha-<short>` as
the branch label, so each checked-out commit still gets a stable URL.

## How it works

1. Read current git branch via `git rev-parse --abbrev-ref HEAD`. If detached
   (returns `HEAD`), fall back to `sha-<short>`.
2. Sanitize → lowercase `[a-z0-9-]`, trim dashes, cap at 63 chars
   (DNS label limit). Host becomes `<sanitized>.localhost`, or just
   `localhost` if the branch sanitizes to empty.
3. Hash the sanitized branch (deterministic) → pick a port inside
   `[base-port, base-port + range)`.
4. If that port is busy, probe successive ports (wrapping inside the range)
   up to `--probe-limit` times. (`--show` skips this — it returns the
   deterministic seed.)
5. With `--write-env <path>`, upsert the `--env-*` vars into that env file, so
   the port from step 4 is on record rather than guessed again elsewhere.
6. Spawn `<command>` with stdio inherited and the chosen env vars set.

## FAQ

**Does `*.localhost` actually resolve?**
Yes — Chrome, Firefox, Safari, and Edge all resolve `*.localhost` to
`127.0.0.1` by default (per [RFC 6761](https://www.rfc-editor.org/rfc/rfc6761)).
Most modern OS resolvers (macOS, Linux with systemd-resolved) also do this.
If your environment doesn't, add an `/etc/hosts` entry or pick another
suffix and patch this script.

**What about Windows?**
The wrapper uses `shell: true` on Windows to resolve `.cmd` shims. Should
work but is less battle-tested than Mac/Linux.

**Does the port survive a branch rename?**
No — different branch name → different hash → different port. Same branch
name is deterministic across machines.

## License

MIT
