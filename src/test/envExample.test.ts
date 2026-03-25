import { describe, it, expect } from 'vitest'
import { parseEnvExampleContent, buildExampleImportPlan } from '../lib/envFormats'
import type { EnvVar } from '../types'
import type { EnvExampleFile } from '../types'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeExampleFile(
  keys: Array<{
    key: string
    placeholder?: string
    inlineComment?: string | null
    sectionHeading?: string | null
  }>
): EnvExampleFile {
  const exampleKeys = keys.map(k => ({
    key: k.key,
    placeholder: k.placeholder ?? '',
    inlineComment: k.inlineComment ?? null,
    sectionHeading: k.sectionHeading ?? null,
  }))
  return {
    keys: exampleKeys,
    totalKeyCount: exampleKeys.length,
    hasPlaceholders: exampleKeys.some(k => k.placeholder !== ''),
  }
}

function makeVar(key: string, val = ''): EnvVar {
  return { id: 'test-id', key, val, revealed: false, sourceProjectId: 'p1' }
}

// ── Phase 1: parseEnvExampleContent ───────────────────────────────────────

describe('parseEnvExampleContent', () => {
  it('1.1: empty file returns no keys and totalKeyCount 0', () => {
    const result = parseEnvExampleContent('')
    expect(result.keys).toEqual([])
    expect(result.totalKeyCount).toBe(0)
  })

  it('1.2: whitespace-only input returns no keys', () => {
    const result = parseEnvExampleContent('   \n\n\t\n')
    expect(result.keys).toEqual([])
  })

  it('1.3: comments-only input returns no keys', () => {
    const result = parseEnvExampleContent('# Comment\n# Another')
    expect(result.keys).toEqual([])
  })

  it('1.4: single key with empty value', () => {
    const result = parseEnvExampleContent('DATABASE_URL=')
    expect(result.keys).toHaveLength(1)
    expect(result.keys[0]).toMatchObject({
      key: 'DATABASE_URL',
      placeholder: '',
      inlineComment: null,
      sectionHeading: null,
    })
  })

  it('1.5: single key with placeholder value', () => {
    const result = parseEnvExampleContent('DATABASE_URL=postgres://localhost/db')
    expect(result.keys[0].placeholder).toBe('postgres://localhost/db')
  })

  it('1.6: inline comment captured; placeholder is empty before space-hash', () => {
    const result = parseEnvExampleContent('API_KEY= # get from dashboard')
    expect(result.keys[0].inlineComment).toBe('get from dashboard')
    expect(result.keys[0].placeholder).toBe('')
  })

  it('1.7: inline comment is trimmed of leading and trailing spaces', () => {
    const result = parseEnvExampleContent('SECRET=   #   trailing spaces   ')
    expect(result.keys[0].inlineComment).toBe('trailing spaces')
  })

  it('1.8: hash without preceding space is part of value, not a comment', () => {
    const result = parseEnvExampleContent('HASH=abc#def')
    expect(result.keys[0].placeholder).toBe('abc#def')
    expect(result.keys[0].inlineComment).toBeNull()
  })

  it('1.9: section heading captured on the first key after it', () => {
    const result = parseEnvExampleContent('# Database\nDATABASE_URL=')
    expect(result.keys[0].sectionHeading).toBe('Database')
  })

  it('1.10: section heading consumed by first key only; next key has null sectionHeading', () => {
    const result = parseEnvExampleContent('# Auth\nJWT_SECRET=\nAPI_KEY=')
    expect(result.keys[0].sectionHeading).toBe('Auth')
    expect(result.keys[1].sectionHeading).toBeNull()
  })

  it('1.11: blank line between heading and key clears heading attribution', () => {
    const result = parseEnvExampleContent('# Auth\n\nJWT_SECRET=')
    expect(result.keys[0].sectionHeading).toBeNull()
  })

  it('1.12: multiple keys parsed in order with correct keys and placeholders', () => {
    const result = parseEnvExampleContent('PORT=3000\nHOST=localhost\nDEBUG=false')
    expect(result.keys).toHaveLength(3)
    expect(result.keys[0]).toMatchObject({ key: 'PORT', placeholder: '3000' })
    expect(result.keys[1]).toMatchObject({ key: 'HOST', placeholder: 'localhost' })
    expect(result.keys[2]).toMatchObject({ key: 'DEBUG', placeholder: 'false' })
  })

  it('1.13: lines without = are skipped', () => {
    const result = parseEnvExampleContent('NO_EQUALS\nKEY=val')
    expect(result.keys).toHaveLength(1)
    expect(result.keys[0].key).toBe('KEY')
  })

  it('1.14: value containing inner = is preserved in full', () => {
    const result = parseEnvExampleContent('DATABASE_URL=postgres://host/db?ssl=true')
    expect(result.keys[0].placeholder).toBe('postgres://host/db?ssl=true')
  })

  it('1.15: 150 keys performance test completes in under 50ms', () => {
    const lines = Array.from({ length: 150 }, (_, i) => `KEY_${i}=VALUE_${i}`).join('\n')
    const start = performance.now()
    const result = parseEnvExampleContent(lines)
    const elapsed = performance.now() - start
    expect(result.keys).toHaveLength(150)
    expect(elapsed).toBeLessThan(50)
  })

  it('1.16: unicode in values preserved', () => {
    const result = parseEnvExampleContent('APP_NAME=Café')
    expect(result.keys[0].placeholder).toBe('Café')
  })

  it('1.17: duplicate keys both returned', () => {
    const result = parseEnvExampleContent('API_KEY=first\nAPI_KEY=second')
    expect(result.keys).toHaveLength(2)
    expect(result.keys[0].placeholder).toBe('first')
    expect(result.keys[1].placeholder).toBe('second')
  })

  it('1.18: CRLF line endings normalized; no \\r in key or placeholder', () => {
    const result = parseEnvExampleContent('KEY1=\r\nKEY2=\r\n')
    expect(result.keys).toHaveLength(2)
    for (const k of result.keys) {
      expect(k.key).not.toContain('\r')
      expect(k.placeholder).not.toContain('\r')
    }
  })

  it('1.19: line containing only = does not throw', () => {
    expect(() => parseEnvExampleContent('=')).not.toThrow()
    // accepted behavior: either [] or [{ key: '', placeholder: '' }]
    const result = parseEnvExampleContent('=')
    expect(Array.isArray(result.keys)).toBe(true)
  })

  it('1.20: leading and trailing whitespace in key is trimmed', () => {
    const result = parseEnvExampleContent('  API_KEY  =value')
    expect(result.keys[0].key).toBe('API_KEY')
  })

  it('totalKeyCount always matches keys.length', () => {
    const result = parseEnvExampleContent('A=1\nB=2\nC=3')
    expect(result.totalKeyCount).toBe(result.keys.length)
  })

  it('hasPlaceholders is true when any key has a non-empty placeholder', () => {
    const result = parseEnvExampleContent('EMPTY=\nFILLED=some-value')
    expect(result.hasPlaceholders).toBe(true)
  })

  it('hasPlaceholders is false when all placeholders are empty', () => {
    const result = parseEnvExampleContent('EMPTY=\nALSO_EMPTY=')
    expect(result.hasPlaceholders).toBe(false)
  })
})

// ── Phase 2: buildExampleImportPlan ───────────────────────────────────────

describe('buildExampleImportPlan', () => {
  it('2.1: all keys are new when existingVars is empty', () => {
    const exampleFile = makeExampleFile([{ key: 'API_KEY' }, { key: 'SECRET' }])
    const plan = buildExampleImportPlan(exampleFile, [])
    expect(plan.newCount).toBe(2)
    expect(plan.existsCount).toBe(0)
  })

  it('2.2: all keys already set', () => {
    const exampleFile = makeExampleFile([{ key: 'API_KEY' }, { key: 'SECRET' }])
    const existing = [makeVar('API_KEY', 'abc'), makeVar('SECRET', 'xyz')]
    const plan = buildExampleImportPlan(exampleFile, existing)
    expect(plan.newCount).toBe(0)
    expect(plan.existsCount).toBe(2)
  })

  it('2.3: mixed new and already-set keys', () => {
    const exampleFile = makeExampleFile([
      { key: 'API_KEY' },
      { key: 'PORT' },
      { key: 'HOST' },
    ])
    const existing = [makeVar('API_KEY', 'key-val'), makeVar('PORT', '3000')]
    const plan = buildExampleImportPlan(exampleFile, existing)
    expect(plan.newCount).toBe(1)
    expect(plan.existsCount).toBe(2)
  })

  it('2.4: empty exampleFile returns zero counts', () => {
    const exampleFile = makeExampleFile([])
    const plan = buildExampleImportPlan(exampleFile, [makeVar('EXISTING', 'val')])
    expect(plan.newCount).toBe(0)
    expect(plan.existsCount).toBe(0)
    expect(plan.rows).toHaveLength(0)
  })

  it('2.5: key comparison is case-sensitive; api_key !== API_KEY', () => {
    const exampleFile = makeExampleFile([{ key: 'API_KEY' }])
    const existing = [makeVar('api_key', 'lowercased')]
    const plan = buildExampleImportPlan(exampleFile, existing)
    expect(plan.rows[0].status).toBe('new')
  })

  it('2.6: invariant: newCount + existsCount === rows.length', () => {
    const exampleFile = makeExampleFile([
      { key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }
    ])
    const existing = [makeVar('A'), makeVar('C')]
    const plan = buildExampleImportPlan(exampleFile, existing)
    expect(plan.newCount + plan.existsCount).toBe(plan.rows.length)
  })

  it('2.7: duplicate keys in example both preserved with individual classification', () => {
    const exampleFile = makeExampleFile([{ key: 'API_KEY' }, { key: 'API_KEY' }])
    const existing = [makeVar('API_KEY', 'existing-val')]
    const plan = buildExampleImportPlan(exampleFile, existing)
    expect(plan.rows).toHaveLength(2)
    expect(plan.rows[0].status).toBe('exists')
    expect(plan.rows[1].status).toBe('exists')
  })

  it('2.8: row inherits full EnvExampleKey fields including inlineComment', () => {
    const exampleFile = makeExampleFile([
      { key: 'AUTH_TOKEN', placeholder: '', inlineComment: 'from Auth0', sectionHeading: null }
    ])
    const plan = buildExampleImportPlan(exampleFile, [])
    expect(plan.rows[0].inlineComment).toBe('from Auth0')
  })

  it('2.9: existingVal populated from existing vars for already-set keys', () => {
    const exampleFile = makeExampleFile([{ key: 'PORT' }])
    const existing = [makeVar('PORT', '3000')]
    const plan = buildExampleImportPlan(exampleFile, existing)
    expect(plan.rows[0].existingVal).toBe('3000')
  })

  it('2.10: row ordering follows example key order', () => {
    const exampleFile = makeExampleFile([
      { key: 'C' }, { key: 'A' }, { key: 'B' }
    ])
    const existing = [makeVar('A', 'exists')]
    const plan = buildExampleImportPlan(exampleFile, existing)
    expect(plan.rows[0].key).toBe('C')
    expect(plan.rows[0].status).toBe('new')
    expect(plan.rows[1].key).toBe('A')
    expect(plan.rows[1].status).toBe('exists')
    expect(plan.rows[2].key).toBe('B')
    expect(plan.rows[2].status).toBe('new')
  })
})

// ── Phase 6: Edge Cases ───────────────────────────────────────────────────

describe('parseEnvExampleContent edge cases (Phase 6)', () => {
  it('6.1: only = as file content does not throw', () => {
    expect(() => parseEnvExampleContent('=')).not.toThrow()
  })

  it('6.2: CRLF normalized; array length 2 and no \\r in any field', () => {
    const result = parseEnvExampleContent('KEY1=value1\r\nKEY2=value2\r\n')
    expect(result.keys).toHaveLength(2)
    for (const k of result.keys) {
      expect(k.key).not.toContain('\r')
      expect(k.placeholder).not.toContain('\r')
    }
  })

  it('6.3: SQL injection characters in value are returned verbatim without throw', () => {
    const sqlInjection = "'; DROP TABLE users; --"
    const result = parseEnvExampleContent(`EVIL=${sqlInjection}`)
    expect(result.keys[0].placeholder).toBe(sqlInjection)
  })

  it('6.4: 10,000 unique keys parsed correctly in under 200ms', () => {
    const lines = Array.from({ length: 10_000 }, (_, i) => `KEY_${i}=VALUE_${i}`).join('\n')
    const start = performance.now()
    const result = parseEnvExampleContent(lines)
    const elapsed = performance.now() - start
    expect(result.keys).toHaveLength(10_000)
    expect(elapsed).toBeLessThan(200)
  })

  it('6.5: 10,000 total lines including 500 duplicate pairs returns all 10,000 rows (duplicates preserved)', () => {
    // 9,000 unique + 500 duplicate keys × 2 appearances = 10,000 lines total
    const lines: string[] = []
    for (let i = 0; i < 9_000; i++) lines.push(`UNIQUE_${i}=val`)
    for (let i = 0; i < 500; i++) {
      lines.push(`DUP_${i}=first`)
      lines.push(`DUP_${i}=second`)
    }
    // Total: 9,000 + 1,000 = 10,000 lines
    expect(lines).toHaveLength(10_000)
    const result = parseEnvExampleContent(lines.join('\n'))
    expect(result.keys).toHaveLength(10_000)
  })

  it('6.6: space before # separates value from comment', () => {
    const result = parseEnvExampleContent('KEY=abc # comment')
    expect(result.keys[0].placeholder).toBe('abc')
    expect(result.keys[0].inlineComment).toBe('comment')
  })
})
