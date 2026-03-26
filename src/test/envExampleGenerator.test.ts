import { describe, it, expect } from 'vitest'
import { generateEnvExampleContent } from '../lib/envFormats'
import type { EnvVar } from '../types'

function makeVar(key: string, val = '', comment?: string): EnvVar {
  return { id: crypto.randomUUID(), key, val, revealed: false, sourceProjectId: 'p1', comment }
}

// ── generateEnvExampleContent ─────────────────────────────────────────────

describe('generateEnvExampleContent', () => {
  // ── Basic output ────────────────────────────────────────────────────────

  it('1.1: empty vars returns empty string', () => {
    expect(generateEnvExampleContent([], new Map())).toBe('')
  })

  it('1.2: single var with no annotation produces KEY= line', () => {
    const vars = [makeVar('DATABASE_URL')]
    const result = generateEnvExampleContent(vars, new Map())
    expect(result).toBe('DATABASE_URL=')
  })

  it('1.3: annotation placeholder is used as value', () => {
    const vars = [makeVar('DATABASE_URL')]
    const annotations = new Map([['DATABASE_URL', { placeholder: 'postgres://localhost/db', note: '' }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).toBe('DATABASE_URL=postgres://localhost/db')
  })

  it('1.4: annotation note appended as inline comment', () => {
    const vars = [makeVar('API_KEY')]
    const annotations = new Map([['API_KEY', { placeholder: '', note: 'get from dashboard' }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).toBe('API_KEY= # get from dashboard')
  })

  it('1.5: both placeholder and note in single line', () => {
    const vars = [makeVar('API_KEY')]
    const annotations = new Map([['API_KEY', { placeholder: 'your_api_key_here', note: 'get from Auth0' }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).toBe('API_KEY=your_api_key_here # get from Auth0')
  })

  it('1.6: multiple vars produce one line each separated by newline', () => {
    const vars = [makeVar('PORT'), makeVar('HOST'), makeVar('DEBUG')]
    const annotations = new Map([
      ['PORT', { placeholder: '3000', note: '' }],
      ['HOST', { placeholder: 'localhost', note: '' }],
    ])
    const result = generateEnvExampleContent(vars, annotations)
    const lines = result.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('PORT=3000')
    expect(lines[1]).toBe('HOST=localhost')
    expect(lines[2]).toBe('DEBUG=')
  })

  it('1.7: var with empty key is skipped', () => {
    const vars = [makeVar(''), makeVar('VALID_KEY')]
    const result = generateEnvExampleContent(vars, new Map())
    const lines = result.split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('VALID_KEY=')
  })

  it('1.8: whitespace-only key is skipped', () => {
    const vars = [makeVar('   '), makeVar('REAL_KEY')]
    const result = generateEnvExampleContent(vars, new Map())
    expect(result).toBe('REAL_KEY=')
  })

  it('1.9: pre-existing EnvVar.comment is used as default note when no annotation override', () => {
    const vars = [makeVar('SECRET', 'my-secret', 'rotate monthly')]
    const result = generateEnvExampleContent(vars, new Map())
    expect(result).toBe('SECRET= # rotate monthly')
  })

  it('1.10: annotation note overrides EnvVar.comment', () => {
    const vars = [makeVar('SECRET', 'my-secret', 'old comment')]
    const annotations = new Map([['SECRET', { placeholder: '', note: 'new note from generator' }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).toBe('SECRET= # new note from generator')
  })

  it('1.11: val is never written to example (privacy — only placeholder from annotation)', () => {
    const vars = [makeVar('PASSWORD', 'super-secret-password')]
    const annotations = new Map([['PASSWORD', { placeholder: 'your_password', note: '' }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).not.toContain('super-secret-password')
    expect(result).toBe('PASSWORD=your_password')
  })

  it('1.12: no annotation and no comment — just KEY= with no trailing space or hash', () => {
    const vars = [makeVar('KEY_A', 'real-val')]
    const result = generateEnvExampleContent(vars, new Map())
    expect(result).toBe('KEY_A=')
  })

  // ── Order and grouping ──────────────────────────────────────────────────

  it('1.13: output preserves input var ordering', () => {
    const vars = [makeVar('Z_KEY'), makeVar('A_KEY'), makeVar('M_KEY')]
    const result = generateEnvExampleContent(vars, new Map())
    const lines = result.split('\n')
    expect(lines[0]).toMatch(/^Z_KEY/)
    expect(lines[1]).toMatch(/^A_KEY/)
    expect(lines[2]).toMatch(/^M_KEY/)
  })

  // ── Edge cases ──────────────────────────────────────────────────────────

  it('1.14: note containing # is preserved verbatim in comment', () => {
    const vars = [makeVar('COLOR')]
    const annotations = new Map([['COLOR', { placeholder: '', note: 'hex color e.g. #FF0000' }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).toBe('COLOR= # hex color e.g. #FF0000')
  })

  it('1.15: leading/trailing whitespace in note is trimmed', () => {
    const vars = [makeVar('KEY')]
    const annotations = new Map([['KEY', { placeholder: '', note: '  trim me  ' }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).toBe('KEY= # trim me')
  })

  it('1.16: annotation for unknown key is silently ignored', () => {
    const vars = [makeVar('REAL_KEY')]
    const annotations = new Map([['UNKNOWN_KEY', { placeholder: 'ignored', note: 'ignored' }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).toBe('REAL_KEY=')
  })

  it('1.17: 100 vars generates 100 lines within 50ms', () => {
    const vars = Array.from({ length: 100 }, (_, i) => makeVar(`KEY_${i}`))
    const start = performance.now()
    const result = generateEnvExampleContent(vars, new Map())
    const elapsed = performance.now() - start
    expect(result.split('\n')).toHaveLength(100)
    expect(elapsed).toBeLessThan(50)
  })

  it('1.18: unicode in note and placeholder preserved', () => {
    const vars = [makeVar('APP_NAME')]
    const annotations = new Map([['APP_NAME', { placeholder: 'Café App', note: '应用名称' }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).toBe('APP_NAME=Café App # 应用名称')
  })

  it('1.19: annotation with empty note and empty placeholder produces KEY=', () => {
    const vars = [makeVar('BARE_KEY')]
    const annotations = new Map([['BARE_KEY', { placeholder: '', note: '', required: true }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).toBe('BARE_KEY=')
  })

  it('1.20: result does not end with trailing newline when there are vars', () => {
    const vars = [makeVar('KEY')]
    const result = generateEnvExampleContent(vars, new Map())
    expect(result.endsWith('\n')).toBe(false)
  })

  // ── Required / Optional ─────────────────────────────────────────────────

  it('1.21: required=false appends "optional" marker to comment', () => {
    const vars = [makeVar('OPTIONAL_KEY')]
    const annotations = new Map([['OPTIONAL_KEY', { placeholder: '', note: '', required: false }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).toContain('optional')
    expect(result).toBe('OPTIONAL_KEY= # optional')
  })

  it('1.22: required=false with a note combines both in comment', () => {
    const vars = [makeVar('WEBHOOK_URL')]
    const annotations = new Map([['WEBHOOK_URL', { placeholder: '', note: 'slack webhook', required: false }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).toContain('slack webhook')
    expect(result).toContain('optional')
  })

  it('1.23: required=true (default) produces no "optional" marker', () => {
    const vars = [makeVar('API_KEY')]
    const annotations = new Map([['API_KEY', { placeholder: '', note: '', required: true }]])
    const result = generateEnvExampleContent(vars, annotations)
    expect(result).not.toContain('optional')
  })

  it('1.24: mix of required and optional vars in output', () => {
    const vars = [makeVar('REQUIRED_KEY'), makeVar('OPTIONAL_KEY')]
    const annotations = new Map([
      ['REQUIRED_KEY', { placeholder: '', note: '', required: true }],
      ['OPTIONAL_KEY', { placeholder: '', note: '', required: false }],
    ])
    const result = generateEnvExampleContent(vars, annotations)
    const lines = result.split('\n')
    expect(lines[0]).toBe('REQUIRED_KEY=')
    expect(lines[1]).toContain('optional')
  })
})
