import assert from "node:assert/strict"
import { test } from "node:test"

import { computeHost, sanitizeBranch } from "../src/branch.js"
import { hash32, seedPort } from "../src/port.js"

test("sanitizeBranch — lowercases and replaces non-[a-z0-9-]", () => {
  assert.equal(sanitizeBranch("feature/Foo_Bar"), "feature-foo-bar")
  assert.equal(sanitizeBranch("FEAT/123"), "feat-123")
})

test("sanitizeBranch — strips leading/trailing dashes", () => {
  assert.equal(sanitizeBranch("--foo--"), "foo")
  assert.equal(sanitizeBranch("///"), "")
})

test("sanitizeBranch — truncates to 63 chars without trailing dash", () => {
  const long = "a".repeat(70)
  assert.equal(sanitizeBranch(long).length, 63)

  const trailingDashAfterTruncate = `${"a".repeat(63)}-bar`
  const out = sanitizeBranch(trailingDashAfterTruncate)
  assert.ok(out.length <= 63)
  assert.ok(!out.endsWith("-"))
})

test("computeHost — adds .localhost when branch is non-empty", () => {
  assert.equal(computeHost("foo"), "foo.localhost")
  assert.equal(computeHost("feature-x"), "feature-x.localhost")
})

test("computeHost — falls back to bare localhost on empty", () => {
  assert.equal(computeHost(""), "localhost")
})

test("hash32 — deterministic", () => {
  assert.equal(hash32("foo"), hash32("foo"))
  assert.notEqual(hash32("foo"), hash32("bar"))
})

test("seedPort — stays in [basePort, basePort + range)", () => {
  const base = 4000
  const range = 1000
  for (const branch of ["main", "feature-a", "feature-b", "", "x".repeat(40)]) {
    const p = seedPort(branch, base, range)
    assert.ok(
      p >= base && p < base + range,
      `port ${p} out of range for "${branch}"`,
    )
  }
})

test("seedPort — stable across calls for same input", () => {
  assert.equal(
    seedPort("feature-x", 4000, 1000),
    seedPort("feature-x", 4000, 1000),
  )
})

test("seedPort — different bases ⇒ different ports for same branch", () => {
  assert.notEqual(seedPort("main", 4000, 1000), seedPort("main", 5000, 1000))
})
