#!/usr/bin/env node
import { run } from "../index.js"

run().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`branch-localhost: ${msg}\n`)
  process.exit(1)
})
