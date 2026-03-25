import { describe, it, expect } from 'vitest'
import { computeEnvDiff } from '../lib/envDiff'
import type { EnvVar } from '../types'

function makeVar(key: string, val: string): EnvVar {
  return { id: crypto.randomUUID(), key, val, revealed: false, sourceProjectId: 'p1' }
}

describe('computeEnvDiff', () => {
  it('returns empty entries when both envs are empty', () => {
    const result = computeEnvDiff([], [], 'dev', 'prod')
    expect(result.entries).toHaveLength(0)
    expect(result.addedCount).toBe(0)
    expect(result.removedCount).toBe(0)
    expect(result.modifiedCount).toBe(0)
    expect(result.unchangedCount).toBe(0)
  })

  it('classifies a key present only in left as removed', () => {
    const result = computeEnvDiff([makeVar('API_KEY', 'abc')], [], 'dev', 'prod')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].status).toBe('removed')
    expect(result.entries[0].key).toBe('API_KEY')
  })

  it('classifies a key present only in right as added', () => {
    const result = computeEnvDiff([], [makeVar('API_KEY', 'abc')], 'dev', 'prod')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].status).toBe('added')
    expect(result.entries[0].key).toBe('API_KEY')
  })

  it('classifies a key with the same value on both sides as unchanged', () => {
    const result = computeEnvDiff(
      [makeVar('API_KEY', 'abc')],
      [makeVar('API_KEY', 'abc')],
      'dev', 'prod'
    )
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].status).toBe('unchanged')
  })

  it('classifies a key with different values as modified', () => {
    const result = computeEnvDiff(
      [makeVar('API_KEY', 'abc')],
      [makeVar('API_KEY', 'xyz')],
      'dev', 'prod'
    )
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].status).toBe('modified')
  })

  it('sets leftVal to null for added entries', () => {
    const result = computeEnvDiff([], [makeVar('NEW_KEY', 'val')], 'dev', 'prod')
    expect(result.entries[0].leftVal).toBeNull()
    expect(result.entries[0].rightVal).toBe('val')
  })

  it('sets rightVal to null for removed entries', () => {
    const result = computeEnvDiff([makeVar('OLD_KEY', 'val')], [], 'dev', 'prod')
    expect(result.entries[0].rightVal).toBeNull()
    expect(result.entries[0].leftVal).toBe('val')
  })

  it('handles a mix of all four statuses in one call', () => {
    const left = [
      makeVar('REMOVED_KEY', 'left-only'),
      makeVar('MODIFIED_KEY', 'old-val'),
      makeVar('SAME_KEY', 'same'),
    ]
    const right = [
      makeVar('ADDED_KEY', 'right-only'),
      makeVar('MODIFIED_KEY', 'new-val'),
      makeVar('SAME_KEY', 'same'),
    ]
    const result = computeEnvDiff(left, right, 'dev', 'prod')
    expect(result.entries).toHaveLength(4)
    const statuses = result.entries.map(e => e.status)
    expect(statuses).toContain('removed')
    expect(statuses).toContain('added')
    expect(statuses).toContain('modified')
    expect(statuses).toContain('unchanged')
  })

  it('correctly counts addedCount, removedCount, modifiedCount, unchangedCount', () => {
    const left = [
      makeVar('REMOVED', 'r'),
      makeVar('MODIFIED', 'old'),
      makeVar('SAME', 's'),
    ]
    const right = [
      makeVar('ADDED', 'a'),
      makeVar('MODIFIED', 'new'),
      makeVar('SAME', 's'),
    ]
    const result = computeEnvDiff(left, right, 'dev', 'prod')
    expect(result.removedCount).toBe(1)
    expect(result.addedCount).toBe(1)
    expect(result.modifiedCount).toBe(1)
    expect(result.unchangedCount).toBe(1)
  })

  it('deduplicates duplicate keys using last-write-wins before diffing', () => {
    const left = [makeVar('KEY', 'first'), makeVar('KEY', 'last')]
    const right = [makeVar('KEY', 'last')]
    const result = computeEnvDiff(left, right, 'dev', 'prod')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].status).toBe('unchanged')
  })

  it('treats key order as irrelevant — same keys different order = unchanged', () => {
    const left = [makeVar('B', 'b'), makeVar('A', 'a')]
    const right = [makeVar('A', 'a'), makeVar('B', 'b')]
    const result = computeEnvDiff(left, right, 'dev', 'prod')
    expect(result.unchangedCount).toBe(2)
    expect(result.modifiedCount).toBe(0)
  })

  it('treats empty string value as distinct from missing key (null vs empty string)', () => {
    const left = [makeVar('KEY', '')]
    const right: EnvVar[] = []
    const result = computeEnvDiff(left, right, 'dev', 'prod')
    expect(result.entries[0].status).toBe('removed')
    expect(result.entries[0].leftVal).toBe('')
    expect(result.entries[0].rightVal).toBeNull()
  })

  it('sorts entries: modified first, then removed, then added, then unchanged', () => {
    const left = [makeVar('A', 'unchanged'), makeVar('B', 'old'), makeVar('C', 'leftonly')]
    const right = [makeVar('A', 'unchanged'), makeVar('B', 'new'), makeVar('D', 'rightonly')]
    const result = computeEnvDiff(left, right, 'dev', 'prod')
    const statuses = result.entries.map(e => e.status)
    // modified before removed before added before unchanged
    const modIdx = statuses.indexOf('modified')
    const remIdx = statuses.indexOf('removed')
    const addIdx = statuses.indexOf('added')
    const unchIdx = statuses.indexOf('unchanged')
    expect(modIdx).toBeLessThan(remIdx)
    expect(remIdx).toBeLessThan(addIdx)
    expect(addIdx).toBeLessThan(unchIdx)
  })

  it('sorts alphabetically within each status group', () => {
    const left = [makeVar('Z_KEY', 'old'), makeVar('A_KEY', 'old')]
    const right = [makeVar('Z_KEY', 'new'), makeVar('A_KEY', 'new')]
    const result = computeEnvDiff(left, right, 'dev', 'prod')
    const modifiedEntries = result.entries.filter(e => e.status === 'modified')
    expect(modifiedEntries[0].key).toBe('A_KEY')
    expect(modifiedEntries[1].key).toBe('Z_KEY')
  })

  it('handles leftVars empty — all right keys are added', () => {
    const right = [makeVar('A', 'a'), makeVar('B', 'b')]
    const result = computeEnvDiff([], right, 'dev', 'prod')
    expect(result.addedCount).toBe(2)
    expect(result.removedCount).toBe(0)
    expect(result.modifiedCount).toBe(0)
    expect(result.unchangedCount).toBe(0)
    result.entries.forEach(e => expect(e.status).toBe('added'))
  })

  it('handles rightVars empty — all left keys are removed', () => {
    const left = [makeVar('A', 'a'), makeVar('B', 'b')]
    const result = computeEnvDiff(left, [], 'dev', 'prod')
    expect(result.removedCount).toBe(2)
    expect(result.addedCount).toBe(0)
    result.entries.forEach(e => expect(e.status).toBe('removed'))
  })

  it('returns correct leftSuffix and rightSuffix in result', () => {
    const result = computeEnvDiff([], [], 'development', 'production')
    expect(result.leftSuffix).toBe('development')
    expect(result.rightSuffix).toBe('production')
  })
})
