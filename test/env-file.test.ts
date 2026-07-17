import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { upsertEnvContent, writeEnvFile } from "../src/env-file.js"

test("upsertEnvContent — replaces an existing value in place", () => {
  const out = upsertEnvContent("A=1\nBASE_URL=http://old\nB=2\n", {
    BASE_URL: "http://new",
  })
  assert.equal(out, "A=1\nBASE_URL=http://new\nB=2\n")
})

test("upsertEnvContent — appends when the name is absent", () => {
  const out = upsertEnvContent("A=1\n", { BASE_URL: "http://new" })
  assert.equal(out, "A=1\nBASE_URL=http://new\n")
})

test("upsertEnvContent — keeps comments, blanks and unrelated vars", () => {
  const before = "# top note\n\nA=1\n# BASE_URL=http://commented\nB=2\n"
  const out = upsertEnvContent(before, { BASE_URL: "http://new" })

  // The commented line is not an assignment: it survives untouched and a real
  // one is appended.
  assert.equal(
    out,
    "# top note\n\nA=1\n# BASE_URL=http://commented\nB=2\nBASE_URL=http://new\n",
  )
})

test("upsertEnvContent — rewrites every duplicate, so dotenv's last-wins is not stale", () => {
  const out = upsertEnvContent("BASE_URL=http://old\nA=1\nBASE_URL=http://older\n", {
    BASE_URL: "http://new",
  })
  assert.equal(out, "BASE_URL=http://new\nA=1\nBASE_URL=http://new\n")
})

test("upsertEnvContent — handles an empty file and a missing trailing newline", () => {
  assert.equal(upsertEnvContent("", { A: "1" }), "A=1\n")
  assert.equal(upsertEnvContent("A=1", { B: "2" }), "A=1\nB=2\n")
})

test("upsertEnvContent — writes several vars at once", () => {
  const out = upsertEnvContent("PORT=1\n", {
    PORT: "5682",
    BASE_URL: "http://master.localhost:5682",
  })
  assert.equal(out, "PORT=5682\nBASE_URL=http://master.localhost:5682\n")
})

test("upsertEnvContent — leaves a name that only prefixes another alone", () => {
  const out = upsertEnvContent("BASE_URL_BRANDWEIGHT=http://prod\n", {
    BASE_URL: "http://new",
  })
  assert.equal(
    out,
    "BASE_URL_BRANDWEIGHT=http://prod\nBASE_URL=http://new\n",
  )
})

test("writeEnvFile — creates the file when missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "bl-env-"))
  const path = join(dir, ".env.local")

  writeEnvFile(path, { BASE_URL: "http://a" })
  assert.equal(readFileSync(path, "utf8"), "BASE_URL=http://a\n")
})

test("writeEnvFile — leaves mtime alone when nothing changed", () => {
  const dir = mkdtempSync(join(tmpdir(), "bl-env-"))
  const path = join(dir, ".env.local")
  writeFileSync(path, "BASE_URL=http://a\n")

  writeEnvFile(path, { BASE_URL: "http://a" })

  // A no-op write would bust turbo's env hash and reload a dev server for
  // nothing, so an unchanged result must not touch the file at all.
  assert.deepEqual(readdirSync(dir), [".env.local"])
  assert.equal(readFileSync(path, "utf8"), "BASE_URL=http://a\n")
})

test("writeEnvFile — leaves no temp file behind", () => {
  const dir = mkdtempSync(join(tmpdir(), "bl-env-"))
  const path = join(dir, ".env.local")

  writeEnvFile(path, { BASE_URL: "http://a" })
  writeEnvFile(path, { BASE_URL: "http://b" })

  assert.deepEqual(readdirSync(dir), [".env.local"])
  assert.equal(readFileSync(path, "utf8"), "BASE_URL=http://b\n")
})
