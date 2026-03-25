import { describe, it, expect } from 'vitest'
import {
  detectFormat,
  parseEnvFile,
  parseJson,
  parseYaml,
  parseCsv,
  parseShellExport,
  serializeDotenv,
  serializeJson,
  serializeYaml,
  serializeCsv,
  serializeShellExport,
  buildImportConflictReport,
  mergeVarsForImport,
  FormatParseError,
} from '../lib/envFormats'
import type { EnvVar } from '../types'

function makeVar(key: string, val: string): EnvVar {
  return { id: crypto.randomUUID(), key, val, revealed: false, sourceProjectId: 'test' }
}

// ── detectFormat ──────────────────────────────────────────────────────────

describe('detectFormat', () => {
  it('returns json for .json extension', () => {
    expect(detectFormat('vars.json', '')).toBe('json')
  })
  it('returns yaml for .yaml extension', () => {
    expect(detectFormat('vars.yaml', '')).toBe('yaml')
  })
  it('returns yaml for .yml extension', () => {
    expect(detectFormat('vars.yml', '')).toBe('yaml')
  })
  it('returns csv for .csv extension', () => {
    expect(detectFormat('vars.csv', '')).toBe('csv')
  })
  it('returns shell for .sh extension', () => {
    expect(detectFormat('vars.sh', '')).toBe('shell')
  })
  it('returns env for .env extension', () => {
    expect(detectFormat('.env', '')).toBe('env')
  })
  it('returns env for no extension', () => {
    expect(detectFormat('myfile', '')).toBe('env')
  })
  it('sniffs JSON content when extension is unrecognized', () => {
    expect(detectFormat('vars.txt', '{"KEY": "val"}')).toBe('json')
  })
  it('sniffs YAML content when extension is unrecognized', () => {
    expect(detectFormat('vars.txt', 'KEY: value\nFOO: bar')).toBe('yaml')
  })
  it('sniffs shell content when extension is unrecognized', () => {
    expect(detectFormat('vars.txt', 'export KEY=value')).toBe('shell')
  })
  it('falls back to env when sniffing is inconclusive', () => {
    expect(detectFormat('vars.txt', 'some random content that is not a known format')).toBe('env')
  })
})

// ── parseJson ──────────────────────────────────────────────────────────────

describe('parseJson', () => {
  it('parses a valid flat JSON object into EnvVar[]', () => {
    const { vars, warnings } = parseJson('{"KEY": "value", "PORT": "3000"}')
    expect(vars).toHaveLength(2)
    expect(vars[0].key).toBe('KEY')
    expect(vars[0].val).toBe('value')
    expect(vars[1].key).toBe('PORT')
    expect(warnings).toHaveLength(0)
  })
  it('coerces numbers to strings', () => {
    const { vars } = parseJson('{"NUM": 42}')
    expect(vars[0].val).toBe('42')
  })
  it('coerces booleans to strings', () => {
    const { vars } = parseJson('{"FLAG": true, "OFF": false}')
    expect(vars.find(v => v.key === 'FLAG')?.val).toBe('true')
    expect(vars.find(v => v.key === 'OFF')?.val).toBe('false')
  })
  it('returns empty vars for empty JSON object', () => {
    const { vars, warnings } = parseJson('{}')
    expect(vars).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })
  it('excludes nested object values and adds a warning', () => {
    const { vars, warnings } = parseJson('{"KEY": "val", "OBJ": {"nested": true}}')
    expect(vars).toHaveLength(1)
    expect(vars[0].key).toBe('KEY')
    expect(warnings.some(w => w.includes('OBJ'))).toBe(true)
  })
  it('throws FormatParseError for array at root', () => {
    expect(() => parseJson('[1, 2, 3]')).toThrow(FormatParseError)
  })
  it('throws FormatParseError for invalid JSON syntax', () => {
    expect(() => parseJson('{invalid}')).toThrow(FormatParseError)
    expect(() => parseJson('{invalid}')).toThrow(/Invalid JSON/)
  })
  it('excludes null values and adds a warning', () => {
    const { vars, warnings } = parseJson('{"KEY": null}')
    expect(vars).toHaveLength(0)
    expect(warnings.some(w => w.includes('KEY'))).toBe(true)
  })
})

// ── parseYaml ──────────────────────────────────────────────────────────────

describe('parseYaml', () => {
  it('parses a valid flat YAML mapping into EnvVar[]', () => {
    const { vars } = parseYaml('KEY: value\nPORT: "3000"')
    expect(vars.find(v => v.key === 'KEY')?.val).toBe('value')
    expect(vars.find(v => v.key === 'PORT')?.val).toBe('3000')
  })
  it('coerces boolean YAML values to strings', () => {
    const { vars } = parseYaml('FLAG: true\nDISABLED: false')
    expect(vars.find(v => v.key === 'FLAG')?.val).toBe('true')
    expect(vars.find(v => v.key === 'DISABLED')?.val).toBe('false')
  })
  it('coerces numeric YAML values to strings', () => {
    const { vars } = parseYaml('PORT: 3000')
    expect(vars.find(v => v.key === 'PORT')?.val).toBe('3000')
  })
  it('excludes nested mapping values and adds a warning', () => {
    const { vars, warnings } = parseYaml('KEY: value\nNESTED:\n  inner: val')
    expect(vars).toHaveLength(1)
    expect(warnings.some(w => w.includes('NESTED'))).toBe(true)
  })
  it('throws FormatParseError for malformed YAML', () => {
    expect(() => parseYaml('key: {unclosed')).toThrow(FormatParseError)
  })
})

// ── parseCsv ───────────────────────────────────────────────────────────────

describe('parseCsv', () => {
  it('parses CSV with key,value headers into EnvVar[]', () => {
    const { vars } = parseCsv('key,value\nKEY,val\nPORT,3000')
    expect(vars).toHaveLength(2)
    expect(vars[0].key).toBe('KEY')
    expect(vars[0].val).toBe('val')
  })
  it('parses CSV without headers using col 0 and col 1', () => {
    const { vars } = parseCsv('MY_KEY,my-val\nPORT,3000')
    expect(vars).toHaveLength(2)
    expect(vars[0].key).toBe('MY_KEY')
    expect(vars[0].val).toBe('my-val')
  })
  it('handles quoted values containing commas', () => {
    const { vars } = parseCsv('key,value\nKEY,"val,with,commas"')
    expect(vars[0].val).toBe('val,with,commas')
  })
  it('skips blank rows silently', () => {
    const { vars } = parseCsv('key,value\nKEY,val\n\nPORT,3000')
    expect(vars).toHaveLength(2)
  })
  it('skips rows with only one column and adds a warning', () => {
    const { vars, warnings } = parseCsv('key,value\nKEY,val\nORPHAN')
    expect(vars).toHaveLength(1)
    expect(warnings.length).toBeGreaterThan(0)
  })
})

// ── parseShellExport ───────────────────────────────────────────────────────

describe('parseShellExport', () => {
  it('parses export KEY=value lines', () => {
    const { vars } = parseShellExport('export KEY=value')
    expect(vars[0].key).toBe('KEY')
    expect(vars[0].val).toBe('value')
  })
  it("parses export KEY='value with spaces' (single-quoted)", () => {
    const { vars } = parseShellExport("export KEY='value with spaces'")
    expect(vars[0].key).toBe('KEY')
    expect(vars[0].val).toBe('value with spaces')
  })
  it('parses export KEY="value with spaces" (double-quoted)', () => {
    const { vars } = parseShellExport('export KEY="value with spaces"')
    expect(vars[0].key).toBe('KEY')
    expect(vars[0].val).toBe('value with spaces')
  })
  it('strips the export prefix before parsing', () => {
    const { vars } = parseShellExport('export MY_VAR=hello')
    expect(vars[0].key).toBe('MY_VAR')
  })
  it('skips comment lines', () => {
    const { vars } = parseShellExport('# this is a comment\nexport KEY=val')
    expect(vars).toHaveLength(1)
    expect(vars[0].key).toBe('KEY')
  })
  it('skips blank lines', () => {
    const { vars } = parseShellExport('\nexport KEY=val\n\n')
    expect(vars).toHaveLength(1)
  })
  it('skips lines without export prefix silently', () => {
    const { vars } = parseShellExport('KEY=val\nexport VALID=yes')
    expect(vars).toHaveLength(1)
    expect(vars[0].key).toBe('VALID')
  })
})

// ── parseEnvFile ───────────────────────────────────────────────────────────

describe('parseEnvFile', () => {
  it('parses env content (round-trip with serializeDotenv)', () => {
    const original = [makeVar('KEY', 'value'), makeVar('PORT', '3000')]
    const { content } = serializeDotenv(original)
    const { vars } = parseEnvFile(content)
    expect(vars.map(v => ({ key: v.key, val: v.val }))).toEqual(
      original.map(v => ({ key: v.key, val: v.val }))
    )
  })
  it('skips comment lines and blank lines', () => {
    const { vars } = parseEnvFile('# comment\n\nKEY=val')
    expect(vars).toHaveLength(1)
    expect(vars[0].key).toBe('KEY')
  })
})

// ── serializeJson ──────────────────────────────────────────────────────────

describe('serializeJson', () => {
  it('roundtrip: parseJson(serializeJson(vars)) matches original', () => {
    const vars = [makeVar('KEY', 'value'), makeVar('PORT', '3000')]
    const { content } = serializeJson(vars)
    const { vars: parsed } = parseJson(content)
    expect(parsed.map(v => ({ key: v.key, val: v.val }))).toEqual(
      vars.map(v => ({ key: v.key, val: v.val }))
    )
  })
  it('output is valid JSON', () => {
    const vars = [makeVar('KEY', 'value')]
    const { content } = serializeJson(vars)
    expect(() => JSON.parse(content)).not.toThrow()
  })
  it('keys appear in original order', () => {
    const vars = [makeVar('B', '2'), makeVar('A', '1')]
    const { content } = serializeJson(vars)
    expect(Object.keys(JSON.parse(content))).toEqual(['B', 'A'])
  })
})

// ── serializeYaml ──────────────────────────────────────────────────────────

describe('serializeYaml', () => {
  it('roundtrip: parseYaml(serializeYaml(vars)) matches original', () => {
    const vars = [makeVar('KEY', 'value'), makeVar('PORT', '3000')]
    const { content } = serializeYaml(vars)
    const { vars: parsed } = parseYaml(content)
    expect(parsed.map(v => ({ key: v.key, val: v.val }))).toEqual(
      vars.map(v => ({ key: v.key, val: v.val }))
    )
  })
})

// ── serializeCsv ───────────────────────────────────────────────────────────

describe('serializeCsv', () => {
  it('roundtrip: parseCsv(serializeCsv(vars)) matches original', () => {
    const vars = [makeVar('KEY', 'value'), makeVar('PORT', '3000')]
    const { content } = serializeCsv(vars)
    const { vars: parsed } = parseCsv(content)
    expect(parsed.map(v => ({ key: v.key, val: v.val }))).toEqual(
      vars.map(v => ({ key: v.key, val: v.val }))
    )
  })
  it('includes key,value header row as first line', () => {
    const vars = [makeVar('KEY', 'value')]
    const { content } = serializeCsv(vars)
    expect(content.split('\n')[0].toLowerCase()).toMatch(/key.*value/)
  })
  it('quotes values containing commas in output', () => {
    const vars = [makeVar('KEY', 'a,b,c')]
    const { content } = serializeCsv(vars)
    expect(content).toContain('"a,b,c"')
  })
})

// ── serializeShellExport ───────────────────────────────────────────────────

describe('serializeShellExport', () => {
  it('each key-value pair is prefixed with export', () => {
    const vars = [makeVar('KEY', 'value')]
    const { content } = serializeShellExport(vars)
    expect(content).toMatch(/^export KEY=/)
  })
  it('roundtrip: parseShellExport(serializeShellExport(vars)) matches original', () => {
    const vars = [makeVar('KEY', 'value'), makeVar('PORT', '3000')]
    const { content } = serializeShellExport(vars)
    const { vars: parsed } = parseShellExport(content)
    expect(parsed.map(v => ({ key: v.key, val: v.val }))).toEqual(
      vars.map(v => ({ key: v.key, val: v.val }))
    )
  })
})

// ── serializeDotenv ────────────────────────────────────────────────────────

describe('serializeDotenv', () => {
  it('roundtrip with parseEnvFile', () => {
    const vars = [makeVar('KEY', 'value'), makeVar('PORT', '3000')]
    const { content } = serializeDotenv(vars)
    const { vars: parsed } = parseEnvFile(content)
    expect(parsed.map(v => ({ key: v.key, val: v.val }))).toEqual(
      vars.map(v => ({ key: v.key, val: v.val }))
    )
  })
})

// ── buildImportConflictReport ──────────────────────────────────────────────

describe('buildImportConflictReport', () => {
  it('puts absent key in newKeys', () => {
    const incoming = [makeVar('NEW_KEY', 'val')]
    const report = buildImportConflictReport(incoming, [])
    expect(report.newKeys).toContain('NEW_KEY')
  })
  it('puts same-value key in conflictSame', () => {
    const incoming = [makeVar('KEY', 'val')]
    const existing = [makeVar('KEY', 'val')]
    const report = buildImportConflictReport(incoming, existing)
    expect(report.conflictSame).toContain('KEY')
  })
  it('puts different-value key in conflictDifferent with correct sourceVal and targetVal', () => {
    const incoming = [makeVar('KEY', 'new')]
    const existing = [makeVar('KEY', 'old')]
    const report = buildImportConflictReport(incoming, existing)
    expect(report.conflictDifferent[0].key).toBe('KEY')
    expect(report.conflictDifferent[0].sourceVal).toBe('new')
    expect(report.conflictDifferent[0].targetVal).toBe('old')
  })
  it('handles empty existing — all keys are newKeys', () => {
    const incoming = [makeVar('A', '1'), makeVar('B', '2')]
    const report = buildImportConflictReport(incoming, [])
    expect(report.newKeys).toEqual(['A', 'B'])
    expect(report.conflictDifferent).toHaveLength(0)
  })
  it('handles empty incoming — result has no entries', () => {
    const existing = [makeVar('KEY', 'val')]
    const report = buildImportConflictReport([], existing)
    expect(report.newKeys).toHaveLength(0)
    expect(report.conflictSame).toHaveLength(0)
    expect(report.conflictDifferent).toHaveLength(0)
  })
  it('deduplicates duplicate keys in incoming (last-write-wins)', () => {
    const incoming = [makeVar('KEY', 'first'), makeVar('KEY', 'last')]
    const existing = [makeVar('KEY', 'old')]
    const report = buildImportConflictReport(incoming, existing)
    expect(report.conflictDifferent[0].sourceVal).toBe('last')
  })
})

// ── mergeVarsForImport ────────────────────────────────────────────────────

describe('mergeVarsForImport', () => {
  it('adds new keys from incoming', () => {
    const incoming = [makeVar('NEW', 'val')]
    const result = mergeVarsForImport(incoming, [], new Map(), 'test')
    expect(result.find(v => v.key === 'NEW')?.val).toBe('val')
  })
  it('overwrites existing key when decision is overwrite (default)', () => {
    const incoming = [makeVar('KEY', 'new')]
    const existing = [makeVar('KEY', 'old')]
    const result = mergeVarsForImport(incoming, existing, new Map(), 'test')
    expect(result.find(v => v.key === 'KEY')?.val).toBe('new')
  })
  it('skips existing key when decision is skip', () => {
    const incoming = [makeVar('KEY', 'new')]
    const existing = [makeVar('KEY', 'old')]
    const decisions = new Map([['KEY', 'skip' as const]])
    const result = mergeVarsForImport(incoming, existing, decisions, 'test')
    expect(result.find(v => v.key === 'KEY')?.val).toBe('old')
  })
  it('preserves existing keys not in incoming', () => {
    const incoming = [makeVar('NEW', 'val')]
    const existing = [makeVar('EXISTING', 'kept')]
    const result = mergeVarsForImport(incoming, existing, new Map(), 'test')
    expect(result.find(v => v.key === 'EXISTING')?.val).toBe('kept')
  })
  it('auto-skips same-value keys', () => {
    const incoming = [makeVar('KEY', 'same')]
    const existing = [makeVar('KEY', 'same')]
    const result = mergeVarsForImport(incoming, existing, new Map(), 'test')
    expect(result.find(v => v.key === 'KEY')?.val).toBe('same')
    expect(result).toHaveLength(1)
  })
})
