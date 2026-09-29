import assert from "node:assert/strict"
import { test } from "node:test"

import { computeHost, sanitizeBranch } from "../src/branch.js"
import {
  findFreePort,
  hash32,
  isReservedPort,
  seedPort,
} from "../src/port.js"

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

test("isReservedPort — browser-blocked ports", () => {
  assert.equal(isReservedPort(5060), true)
  assert.equal(isReservedPort(6000), true)
  assert.equal(isReservedPort(3000), false)
})

test("seedPort — skips reserved ports, deterministically", () => {
  // "feature-209" hashes to 5060 (sip) in [5000, 6000); 5061 is reserved too.
  assert.equal(5000 + (hash32("feature-209") % 1000), 5060)
  assert.equal(seedPort("feature-209", 5000, 1000), 5062)
})

test("seedPort — throws when the whole range is reserved", () => {
  assert.throws(() => seedPort("any", 5060, 2), /reserved/)
})

test("findFreePort — skips reserved ports without spending a probe", async () => {
  const port = await findFreePort({
    start: 5060,
    basePort: 5060,
    range: 3,
    probeLimit: 0,
  })
  assert.equal(port, 5062)
})
