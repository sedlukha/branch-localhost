import net from "node:net"

/**
 * Deterministic 32-bit hash of a string. Stable across runs.
 */
export function hash32(key: string): number {
  const MOD = 2 ** 32
  let h = 0
  for (const c of key) {
    h = (h * 31 + c.charCodeAt(0)) % MOD
  }
  return h
}

/**
 * "Bad ports" from the Fetch standard: browsers refuse to connect to them
 * (ERR_UNSAFE_PORT), and dev servers like Next.js refuse to bind them
 * (`Bad port: "5060" is reserved for sip`). Never hand one out.
 * https://fetch.spec.whatwg.org/#port-blocking
 */
const RESERVED_PORTS: ReadonlySet<number> = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77,
  79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135,
  137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531,
  532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720,
  1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
])

/**
 * Whether browsers block this port (see RESERVED_PORTS).
 */
export function isReservedPort(port: number): boolean {
  return RESERVED_PORTS.has(port)
}

/**
 * Next port after `port` inside [basePort, basePort + range), wrapping around.
 */
function nextInRange(port: number, basePort: number, range: number): number {
  return basePort + ((port - basePort + 1) % range)
}

/**
 * Seed a port from a branch name within [basePort, basePort + range).
 * A reserved seed moves forward to the next usable port in the range, so the
 * result is still deterministic per branch.
 */
export function seedPort(
  branch: string,
  basePort: number,
  range: number,
): number {
  let port = basePort + (hash32(branch) % range)
  for (let i = 0; i < range; i += 1) {
    if (!isReservedPort(port)) return port
    port = nextInRange(port, basePort, range)
  }
  throw new Error(
    `every port in [${basePort}, ${basePort + range}) is reserved by browsers`,
  )
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once("error", () => resolve(false))
    server.once("listening", () => {
      server.close(() => resolve(true))
    })
    server.listen(port, "127.0.0.1")
  })
}

export interface FindFreePortOptions {
  start: number
  basePort: number
  range: number
  probeLimit: number
}

/**
 * Find a free port by probing successive ports inside the range, wrapping
 * around. Returns the start port if free, otherwise probes up to probeLimit.
 * Reserved ports are skipped without spending a probe.
 */
export async function findFreePort({
  start,
  basePort,
  range,
  probeLimit,
}: FindFreePortOptions): Promise<number> {
  let port = start
  let probed = 0
  let stepped = 0
  while (isReservedPort(port) || !(await isPortFree(port))) {
    if (!isReservedPort(port)) probed += 1
    stepped += 1
    if (probed > probeLimit || stepped >= range) {
      throw new Error(
        `no free port found within ${probeLimit} probes from ${start}`,
      )
    }
    port = nextInRange(port, basePort, range)
  }
  return port
}
