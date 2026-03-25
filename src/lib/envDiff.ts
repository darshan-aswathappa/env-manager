import type { EnvVar, DiffEntry, DiffResult, DiffStatus } from '../types'

const STATUS_ORDER: Record<DiffStatus, number> = {
  modified: 0,
  removed: 1,
  added: 2,
  unchanged: 3,
}

/**
 * Pure function: computes a unified diff between two sets of env vars.
 * Deduplicates duplicate keys using last-write-wins before comparison.
 * Returns a sorted DiffResult (modified → removed → added → unchanged, then alpha).
 */
export function computeEnvDiff(
  leftVars: EnvVar[],
  rightVars: EnvVar[],
  leftSuffix: string,
  rightSuffix: string
): DiffResult {
  // Build maps with last-write-wins deduplication
  const leftMap = new Map<string, string>()
  for (const v of leftVars) leftMap.set(v.key, v.val)

  const rightMap = new Map<string, string>()
  for (const v of rightVars) rightMap.set(v.key, v.val)

  // Union of all keys
  const allKeys = new Set([...leftMap.keys(), ...rightMap.keys()])

  const entries: DiffEntry[] = []
  let addedCount = 0
  let removedCount = 0
  let modifiedCount = 0
  let unchangedCount = 0

  for (const key of allKeys) {
    const inLeft = leftMap.has(key)
    const inRight = rightMap.has(key)

    if (inLeft && inRight) {
      if (leftMap.get(key) === rightMap.get(key)) {
        entries.push({ key, status: 'unchanged', leftVal: leftMap.get(key)!, rightVal: rightMap.get(key)! })
        unchangedCount++
      } else {
        entries.push({ key, status: 'modified', leftVal: leftMap.get(key)!, rightVal: rightMap.get(key)! })
        modifiedCount++
      }
    } else if (inLeft) {
      entries.push({ key, status: 'removed', leftVal: leftMap.get(key)!, rightVal: null })
      removedCount++
    } else {
      entries.push({ key, status: 'added', leftVal: null, rightVal: rightMap.get(key)! })
      addedCount++
    }
  }

  // Sort: by status order, then alphabetically within each group
  entries.sort((a, b) => {
    const orderDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (orderDiff !== 0) return orderDiff
    return a.key.localeCompare(b.key)
  })

  return { leftSuffix, rightSuffix, entries, addedCount, removedCount, modifiedCount, unchangedCount }
}
