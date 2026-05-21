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
 * Seed a port from a branch name within [basePort, basePort + range).
 */
export function seedPort(
  branch: string,
  basePort: number,
  range: number,
): number {
  return basePort + (hash32(branch) % range)
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
 */
export async function findFreePort({
  start,
  basePort,
  range,
  probeLimit,
}: FindFreePortOptions): Promise<number> {
  let port = start
  let probed = 0
  while (!(await isPortFree(port))) {
    probed += 1
    if (probed > probeLimit) {
      throw new Error(
        `no free port found within ${probeLimit} probes from ${start}`,
      )
    }
    port = basePort + ((start - basePort + probed) % range)
  }
  return port
}
