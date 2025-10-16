type Entry = { ts: number; scope: string; msg: string; data?: unknown }

const buffer: Entry[] = []
const MAX = 200

export const aiDebugEnabled = String((import.meta as any).env?.VITE_AI_DEBUG || '').toLowerCase() === 'true'

export function dlog(scope: string, msg: string, data?: unknown) {
  if (!aiDebugEnabled) return
  const e: Entry = { ts: Date.now(), scope, msg, data }
  buffer.push(e)
  if (buffer.length > MAX) buffer.shift()
  // Also mirror to console for convenience
  // eslint-disable-next-line no-console
  console.debug(`[AI][${scope}] ${msg}`, data)
}

export function getLogs() {
  return [...buffer]
}

export function clearLogs() {
  buffer.length = 0
}

