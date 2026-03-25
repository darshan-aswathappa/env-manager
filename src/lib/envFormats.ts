import jsyaml from 'js-yaml'
import Papa from 'papaparse'
import type { EnvVar, ExportFormat, ConflictReport, ConflictStrategy, EnvExampleFile, ExampleImportPlan, ExampleImportPlanRow, ExampleImportDecision } from '../types'
import { parseEnvContent, serializeVars, shellQuote } from './envFile'

// ── Error class ───────────────────────────────────────────────────────────

export class FormatParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormatParseError'
  }
}

// ── Format detection ──────────────────────────────────────────────────────

export function detectFormat(filename: string, content: string): ExportFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  // Extension-based detection (highest priority)
  if (ext === 'json') return 'json'
  if (ext === 'yaml' || ext === 'yml') return 'yaml'
  if (ext === 'csv') return 'csv'
  if (ext === 'sh') return 'shell'
  if (ext === 'env') return 'env'

  // If the filename has no extension or an unrecognized extension, sniff content
  if (ext === '' || !['json', 'yaml', 'yml', 'csv', 'sh', 'env'].includes(ext)) {
    const trimmed = content.trim()
    if (trimmed.startsWith('{')) return 'json'
    if (trimmed.startsWith('---') || /^[a-zA-Z_][a-zA-Z0-9_]*:\s/m.test(trimmed)) return 'yaml'
    if (trimmed.startsWith('export ')) return 'shell'
  }

  return 'env'
}

// ── Return shape ──────────────────────────────────────────────────────────

type ParseResult = { vars: EnvVar[]; warnings: string[] }
type SerializeResult = { content: string; warnings: string[] }

// ── Parsers ───────────────────────────────────────────────────────────────

export function parseEnvFile(content: string, projectId = ''): ParseResult {
  return { vars: parseEnvContent(content, projectId), warnings: [] }
}

export function parseJson(content: string, projectId = ''): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    throw new FormatParseError(`Invalid JSON: ${(e as Error).message}`)
  }

  if (Array.isArray(parsed)) {
    throw new FormatParseError('Invalid JSON: root value must be an object, not an array')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new FormatParseError('Invalid JSON: root value must be an object')
  }

  const obj = parsed as Record<string, unknown>
  const vars: EnvVar[] = []
  const warnings: string[] = []

  for (const [key, value] of Object.entries(obj)) {
    if (value === null) {
      warnings.push(`Key "${key}" has null value — skipped`)
      continue
    }
    if (typeof value === 'object') {
      warnings.push(`Key "${key}" has a nested object value — skipped`)
      continue
    }
    vars.push({
      id: crypto.randomUUID(),
      key,
      val: String(value),
      revealed: false,
      sourceProjectId: projectId,
    })
  }

  return { vars, warnings }
}

export function parseYaml(content: string, projectId = ''): ParseResult {
  let parsed: unknown
  try {
    parsed = jsyaml.load(content)
  } catch (e) {
    throw new FormatParseError(`Invalid YAML: ${(e as Error).message}`)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new FormatParseError('Invalid YAML: root value must be a mapping')
  }

  const obj = parsed as Record<string, unknown>
  const vars: EnvVar[] = []
  const warnings: string[] = []

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      warnings.push(`Key "${key}" has null value — skipped`)
      continue
    }
    if (typeof value === 'object') {
      warnings.push(`Key "${key}" has a nested value (sequence or mapping) — skipped`)
      continue
    }
    vars.push({
      id: crypto.randomUUID(),
      key,
      val: String(value),
      revealed: false,
      sourceProjectId: projectId,
    })
  }

  return { vars, warnings }
}

export function parseCsv(content: string, projectId = ''): ParseResult {
  const result = Papa.parse<string[]>(content, { skipEmptyLines: true })
  const rows = result.data as string[][]

  if (rows.length === 0) return { vars: [], warnings: [] }

  const vars: EnvVar[] = []
  const warnings: string[] = []

  // Detect if first row is headers
  const firstRow = rows[0]
  const hasHeaders =
    firstRow.length >= 2 &&
    firstRow[0]?.toLowerCase() === 'key' &&
    firstRow[1]?.toLowerCase() === 'value'
  const dataRows = hasHeaders ? rows.slice(1) : rows

  for (const row of dataRows) {
    if (row.length < 2) {
      if (row.length === 1 && row[0]?.trim()) {
        warnings.push(`Row with only one column skipped: "${row[0]}"`)
      }
      continue
    }
    const key = row[0]?.trim() ?? ''
    const val = row[1] ?? ''
    if (!key) continue
    vars.push({
      id: crypto.randomUUID(),
      key,
      val,
      revealed: false,
      sourceProjectId: projectId,
    })
  }

  return { vars, warnings }
}

export function parseShellExport(content: string, projectId = ''): ParseResult {
  const envLines: string[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (!trimmed.startsWith('export ')) continue
    envLines.push(trimmed.slice('export '.length))
  }

  const vars = envLines.length > 0 ? parseEnvContent(envLines.join('\n'), projectId) : []
  return { vars, warnings: [] }
}

// ── Serializers ───────────────────────────────────────────────────────────

export function serializeDotenv(vars: EnvVar[]): SerializeResult {
  return { content: serializeVars(vars), warnings: [] }
}

export function serializeJson(vars: EnvVar[]): SerializeResult {
  const obj: Record<string, string> = {}
  for (const v of vars) {
    if (v.key.trim()) obj[v.key] = v.val
  }
  return { content: JSON.stringify(obj, null, 2), warnings: [] }
}

export function serializeYaml(vars: EnvVar[]): SerializeResult {
  const obj: Record<string, string> = {}
  for (const v of vars) {
    if (v.key.trim()) obj[v.key] = v.val
  }
  return { content: jsyaml.dump(obj), warnings: [] }
}

export function serializeCsv(vars: EnvVar[]): SerializeResult {
  const filtered = vars.filter(v => v.key.trim())
  const rows: string[][] = [['key', 'value'], ...filtered.map(v => [v.key, v.val])]
  return { content: Papa.unparse(rows), warnings: [] }
}

export function serializeShellExport(vars: EnvVar[]): SerializeResult {
  const warnings: string[] = []
  const lines: string[] = []

  for (const v of vars) {
    if (!v.key.trim()) continue
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v.key)) {
      warnings.push(`Key "${v.key}" is not a valid shell identifier — skipped`)
      continue
    }
    lines.push(`export ${v.key}=${shellQuote(v.val)}`)
  }

  return { content: lines.join('\n'), warnings }
}

// ── Format dispatcher ─────────────────────────────────────────────────────

export function serializeByFormat(vars: EnvVar[], format: ExportFormat): SerializeResult {
  switch (format) {
    case 'json':  return serializeJson(vars)
    case 'yaml':  return serializeYaml(vars)
    case 'csv':   return serializeCsv(vars)
    case 'shell': return serializeShellExport(vars)
    default:      return serializeDotenv(vars)
  }
}

export function parseByFormat(content: string, format: ExportFormat, projectId = ''): ParseResult {
  switch (format) {
    case 'json':  return parseJson(content, projectId)
    case 'yaml':  return parseYaml(content, projectId)
    case 'csv':   return parseCsv(content, projectId)
    case 'shell': return parseShellExport(content, projectId)
    default:      return parseEnvFile(content, projectId)
  }
}

// ── Conflict reporting ────────────────────────────────────────────────────

export function buildImportConflictReport(
  incoming: EnvVar[],
  existing: EnvVar[]
): ConflictReport {
  // Deduplicate incoming (last-write-wins)
  const incomingMap = new Map<string, string>()
  for (const v of incoming) {
    incomingMap.set(v.key, v.val)
  }

  const existingMap = new Map<string, string>(existing.map(v => [v.key, v.val]))
  const newKeys: string[] = []
  const conflictSame: string[] = []
  const conflictDifferent: ConflictReport['conflictDifferent'] = []

  for (const [key, val] of incomingMap) {
    if (!existingMap.has(key)) {
      newKeys.push(key)
    } else if (existingMap.get(key) === val) {
      conflictSame.push(key)
    } else {
      conflictDifferent.push({ key, sourceVal: val, targetVal: existingMap.get(key)! })
    }
  }

  return { newKeys, conflictSame, conflictDifferent }
}

// ── Merge for import ──────────────────────────────────────────────────────

export function mergeVarsForImport(
  incoming: EnvVar[],
  existing: EnvVar[],
  decisions: Map<string, ConflictStrategy>,
  projectId: string
): EnvVar[] {
  // Deduplicate incoming (last-write-wins)
  const incomingMap = new Map<string, string>()
  for (const v of incoming) {
    incomingMap.set(v.key, v.val)
  }

  const merged = new Map<string, EnvVar>(existing.map(v => [v.key, { ...v }]))

  for (const [key, val] of incomingMap) {
    if (!merged.has(key)) {
      // New key — always add
      merged.set(key, { id: crypto.randomUUID(), key, val, revealed: false, sourceProjectId: projectId })
    } else if (merged.get(key)!.val === val) {
      // Same value — auto-skip (leave as is)
    } else {
      // Conflict — check decision, default to overwrite
      const decision = decisions.get(key) ?? 'overwrite'
      if (decision === 'overwrite') {
        merged.set(key, { ...merged.get(key)!, val })
      }
      // 'skip' → leave existing value unchanged
    }
  }

  return Array.from(merged.values())
}

// ── .env.example Import ───────────────────────────────────────────────────

/**
 * Parses .env.example file content into structured EnvExampleFile.
 * Preserves keys, placeholder values, inline comments, and section headings.
 * Pure function — no side effects.
 */
export function parseEnvExampleContent(content: string): EnvExampleFile {
  // Normalize CRLF to LF
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')

  const keys: EnvExampleFile['keys'] = []
  let pendingHeading: string | null = null
  const headingLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      // Blank line resets pending section heading
      pendingHeading = null
      headingLines.length = 0
      continue
    }

    if (trimmed.startsWith('#')) {
      // Accumulate section heading lines
      const headingText = trimmed.slice(1).trim()
      headingLines.push(headingText)
      pendingHeading = headingLines.join('\n')
      continue
    }

    // Key line: must contain '='
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue

    const rawKey = line.slice(0, eqIndex).trim()
    const rawAfterEq = line.slice(eqIndex + 1)

    // Parse inline comment: only a ' #' (space + hash) splits value from comment
    // A # without a preceding space is part of the value
    const spaceHashIndex = rawAfterEq.search(/ #/)

    let placeholder: string
    let inlineComment: string | null

    if (spaceHashIndex !== -1) {
      placeholder = rawAfterEq.slice(0, spaceHashIndex).trim()
      inlineComment = rawAfterEq.slice(spaceHashIndex + 2).trim() || null
    } else {
      placeholder = rawAfterEq.trim()
      inlineComment = null
    }

    // Consume the pending section heading for this key
    const sectionHeading = pendingHeading
    pendingHeading = null
    headingLines.length = 0

    keys.push({ key: rawKey, placeholder, inlineComment, sectionHeading })
  }

  return {
    keys,
    totalKeyCount: keys.length,
    hasPlaceholders: keys.some(k => k.placeholder !== ''),
  }
}

/**
 * Compares EnvExampleFile keys against existing vars to produce an import plan.
 * Keys are 'exists' if existingVars contains matching key (case-sensitive).
 * Row ordering follows the original exampleFile.keys order.
 * Pure function — no side effects.
 */
export function buildExampleImportPlan(
  exampleFile: EnvExampleFile,
  existingVars: EnvVar[]
): ExampleImportPlan {
  const existingMap = new Map<string, string>(existingVars.map(v => [v.key, v.val]))

  let newCount = 0
  let existsCount = 0

  const rows: ExampleImportPlanRow[] = exampleFile.keys.map(exKey => {
    if (existingMap.has(exKey.key)) {
      existsCount++
      return {
        key: exKey.key,
        placeholder: exKey.placeholder,
        sectionHeading: exKey.sectionHeading,
        inlineComment: exKey.inlineComment,
        status: 'exists' as const,
        existingVal: existingMap.get(exKey.key) ?? null,
      }
    } else {
      newCount++
      return {
        key: exKey.key,
        placeholder: exKey.placeholder,
        sectionHeading: exKey.sectionHeading,
        inlineComment: exKey.inlineComment,
        status: 'new' as const,
        existingVal: null,
      }
    }
  })

  return { rows, newCount, existsCount }
}

/**
 * Creates new vars from an import plan, excluding 'exists' rows and 'skip' decisions.
 * New vars are created with val = "" (placeholder text is documentation, not a real value).
 * Returns a new array containing existingVars plus new vars. Does not mutate.
 * Pure function — no side effects.
 */
export function applyExampleImport(
  plan: ExampleImportPlan,
  existingVars: EnvVar[],
  decisions: Map<string, ExampleImportDecision>,
  projectId: string
): EnvVar[] {
  const newVars: EnvVar[] = []

  for (const row of plan.rows) {
    // Only import 'new' rows (never overwrite 'exists')
    if (row.status !== 'new') continue
    // Skip if explicitly decided to skip (default is 'import')
    if (decisions.get(row.key) === 'skip') continue

    newVars.push({
      id: crypto.randomUUID(),
      key: row.key,
      val: '',  // always empty — placeholder text is documentation
      revealed: false,
      sourceProjectId: projectId,
    })
  }

  return [...existingVars, ...newVars]
}
