import { describe, it, expect } from 'vitest'
import { findKeyAcrossEnvironments, renameKeyInEnvironment, propagateKeyRenameToEnvironments } from '../lib/envFile'
import type { EnvVar, Environment } from '../types'

// ── Helpers ────────────────────────────────────────────────────

function makeVar(key: string, val = 'value', id = key): EnvVar {
  return { id, key, val, revealed: false, sourceProjectId: 'proj-1' }
}

function makeEnv(suffix: string, keys: string[]): Environment {
  return { suffix, vars: keys.map(k => makeVar(k)) }
}

// ── findKeyAcrossEnvironments ──────────────────────────────────

describe('findKeyAcrossEnvironments', () => {
  it('returns suffixes of envs containing oldKey, excluding active suffix', () => {
    const environments: Environment[] = [
      makeEnv('', ['API_KEY', 'SECRET']),
      makeEnv('local', ['API_KEY', 'DEBUG']),
      makeEnv('production', ['API_KEY', 'SECRET']),
    ]
    const result = findKeyAcrossEnvironments('API_KEY', environments, '')
    expect(result).toEqual(['local', 'production'])
  })

  it('returns empty array when no other env has oldKey', () => {
    const environments: Environment[] = [
      makeEnv('', ['API_KEY']),
      makeEnv('local', ['DEBUG']),
      makeEnv('production', ['SECRET']),
    ]
    const result = findKeyAcrossEnvironments('API_KEY', environments, '')
    expect(result).toEqual([])
  })

  it('returns empty array when only the excluded env has oldKey', () => {
    const environments: Environment[] = [
      makeEnv('', ['API_KEY']),
      makeEnv('local', ['DEBUG']),
    ]
    const result = findKeyAcrossEnvironments('API_KEY', environments, '')
    expect(result).toEqual([])
  })

  it('does not include env if key exists only in active env (active env excluded)', () => {
    const environments: Environment[] = [
      makeEnv('local', ['API_KEY', 'ONLY_LOCAL']),
      makeEnv('production', ['API_KEY']),
    ]
    const result = findKeyAcrossEnvironments('ONLY_LOCAL', environments, 'local')
    expect(result).toEqual([])
  })

  it('is case-sensitive: api_key vs API_KEY are different keys → no match', () => {
    const environments: Environment[] = [
      makeEnv('', ['API_KEY']),
      makeEnv('local', ['api_key']),
      makeEnv('production', ['API_KEY']),
    ]
    const result = findKeyAcrossEnvironments('API_KEY', environments, '')
    expect(result).toEqual(['production'])
    expect(result).not.toContain('local')
  })

  it('handles empty environments array → []', () => {
    const result = findKeyAcrossEnvironments('API_KEY', [], '')
    expect(result).toEqual([])
  })
})

// ── renameKeyInEnvironment ─────────────────────────────────────

describe('renameKeyInEnvironment', () => {
  it('renames matching key; value, id, revealed, sourceProjectId are preserved', () => {
    const vars: EnvVar[] = [
      { id: 'id-1', key: 'OLD_KEY', val: 'secret123', revealed: true, sourceProjectId: 'proj-abc' },
    ]
    const result = renameKeyInEnvironment('OLD_KEY', 'NEW_KEY', vars)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'id-1',
      key: 'NEW_KEY',
      val: 'secret123',
      revealed: true,
      sourceProjectId: 'proj-abc',
    })
  })

  it('does not rename non-matching vars (other vars unchanged)', () => {
    const vars: EnvVar[] = [
      makeVar('OLD_KEY', 'val-a', 'id-1'),
      makeVar('OTHER_KEY', 'val-b', 'id-2'),
    ]
    const result = renameKeyInEnvironment('OLD_KEY', 'NEW_KEY', vars)
    expect(result[0].key).toBe('NEW_KEY')
    expect(result[1].key).toBe('OTHER_KEY')
    expect(result[1].id).toBe('id-2')
    expect(result[1].val).toBe('val-b')
  })

  it('handles empty vars array → returns []', () => {
    const result = renameKeyInEnvironment('OLD_KEY', 'NEW_KEY', [])
    expect(result).toEqual([])
  })

  it('handles vars with no match for oldKey → returns same vars structurally', () => {
    const vars: EnvVar[] = [makeVar('SOME_KEY', 'v', 'id-x')]
    const result = renameKeyInEnvironment('MISSING_KEY', 'NEW_KEY', vars)
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('SOME_KEY')
  })

  it('does not mutate the original vars array (check original array is unchanged)', () => {
    const vars: EnvVar[] = [makeVar('OLD_KEY', 'v', 'id-1')]
    const originalKey = vars[0].key
    renameKeyInEnvironment('OLD_KEY', 'NEW_KEY', vars)
    expect(vars[0].key).toBe(originalKey)
  })

  it('renames all occurrences when duplicate keys exist (maps by key equality)', () => {
    const vars: EnvVar[] = [
      makeVar('DUPE_KEY', 'val-1', 'id-1'),
      makeVar('DUPE_KEY', 'val-2', 'id-2'),
    ]
    const result = renameKeyInEnvironment('DUPE_KEY', 'NEW_KEY', vars)
    expect(result[0].key).toBe('NEW_KEY')
    expect(result[1].key).toBe('NEW_KEY')
    expect(result[0].val).toBe('val-1')
    expect(result[1].val).toBe('val-2')
  })
})

// ── propagateKeyRenameToEnvironments ──────────────────────────

describe('propagateKeyRenameToEnvironments', () => {
  it('renames key in all targetSuffixes, leaves others untouched', () => {
    const environments: Environment[] = [
      makeEnv('', ['API_KEY', 'SECRET']),
      makeEnv('local', ['API_KEY', 'DEBUG']),
      makeEnv('production', ['API_KEY', 'SECRET']),
    ]
    const result = propagateKeyRenameToEnvironments('API_KEY', 'NEW_API_KEY', environments, ['local', 'production'])
    const base = result.find(e => e.suffix === '')!
    const local = result.find(e => e.suffix === 'local')!
    const prod = result.find(e => e.suffix === 'production')!

    // base env untouched
    expect(base.vars.some(v => v.key === 'API_KEY')).toBe(true)
    expect(base.vars.some(v => v.key === 'NEW_API_KEY')).toBe(false)

    // local and production renamed
    expect(local.vars.some(v => v.key === 'NEW_API_KEY')).toBe(true)
    expect(local.vars.some(v => v.key === 'API_KEY')).toBe(false)
    expect(prod.vars.some(v => v.key === 'NEW_API_KEY')).toBe(true)
    expect(prod.vars.some(v => v.key === 'API_KEY')).toBe(false)
  })

  it('empty targetSuffixes → returns environments structurally unchanged', () => {
    const environments: Environment[] = [makeEnv('', ['API_KEY'])]
    const result = propagateKeyRenameToEnvironments('API_KEY', 'NEW_KEY', environments, [])
    expect(result[0].vars[0].key).toBe('API_KEY')
  })

  it('does not mutate the original environments array', () => {
    const environments: Environment[] = [makeEnv('local', ['API_KEY'])]
    propagateKeyRenameToEnvironments('API_KEY', 'NEW_KEY', environments, ['local'])
    expect(environments[0].vars[0].key).toBe('API_KEY')
  })

  it('returns new array even for untouched environments (result !== original)', () => {
    const environments: Environment[] = [makeEnv('', ['API_KEY'])]
    const result = propagateKeyRenameToEnvironments('API_KEY', 'NEW_KEY', environments, [])
    expect(result).not.toBe(environments)
  })

  it('suffix not present in environments is silently ignored (no error thrown)', () => {
    const environments: Environment[] = [makeEnv('', ['API_KEY'])]
    expect(() =>
      propagateKeyRenameToEnvironments('API_KEY', 'NEW_KEY', environments, ['nonexistent'])
    ).not.toThrow()
  })
})
